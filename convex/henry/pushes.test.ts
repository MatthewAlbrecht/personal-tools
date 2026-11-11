/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import fixture from "./fixtures/sightmap-2026-11-08.json";

// The push service is faked: every push "sent" lands in `fakes.sent`.
const fakes = vi.hoisted(() => ({
	sent: [] as Array<{
		at: number;
		endpoint: string;
		payload: { title: string; body: string; url: string; tag: string };
		options: { ttlSeconds: number; urgency: string; topic: string | null };
	}>,
}));

vi.mock("../model/yugioh/webPushSender", () => ({
	sendWebPush: async (
		subscription: { endpoint: string },
		payload: string,
		options: { ttlSeconds: number; urgency: string; topic: string | null },
	) => {
		fakes.sent.push({
			at: Date.now(),
			endpoint: subscription.endpoint,
			payload: JSON.parse(payload),
			options,
		});
		return { status: "sent" };
	},
}));

const modules = import.meta.glob("/convex/**/*.ts");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** 18:00 UTC: 11am in Denver. */
const BASELINE_AT = Date.UTC(2026, 10, 8, 18);
/** 06:00 UTC on Nov 9: 11pm in Denver, inside quiet hours. */
const NIGHT = Date.UTC(2026, 10, 9, 6);
/** 8am in Denver (MST) on Nov 9. */
const EIGHT_AM = Date.UTC(2026, 10, 9, 15);

const PHONE = "https://web.push.apple.com/phone";
const LAPTOP = "https://fcm.googleapis.com/fcm/send/laptop";

type FixtureUnit = (typeof fixture)["data"]["units"][number];
type SightmapUnit = Omit<FixtureUnit, "specials_description"> & {
	specials_description: string | null;
};

/** The 12 fixture units the rules alone pass (spec, 2026-11-08 data). */
const PASSING = [
	"733",
	"743",
	"516",
	"101",
	"201",
	"713",
	"326",
	"526",
	"608",
	"647",
	"672",
	"127",
];

/** A unit first seen after the baseline: 609, a 6th floor 2 bed (B2). */
const NEW_UNIT = {
	id: "999001",
	unit_number: "609",
	floor_id: "7392",
	floor_plan_id: "648491",
	area: 1091,
	price: 2590,
	total_price: [2596.06, 2596.06],
	display_lease_term: "16 Months",
	available_on: "2026-12-01",
	specials_description: null,
} satisfies SightmapUnit;

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(BASELINE_AT);
	fakes.sent = [];
});

afterEach(() => {
	vi.useRealTimers();
});

function payload(edit?: (units: SightmapUnit[]) => SightmapUnit[]): string {
	const copy = structuredClone(fixture);
	const units: SightmapUnit[] = copy.data.units;
	return JSON.stringify({
		...copy,
		data: { ...copy.data, units: edit ? edit(units) : units },
	});
}

function without(...numbers: string[]) {
	return (units: SightmapUnit[]) =>
		units.filter((unit) => !numbers.includes(unit.unit_number));
}

function withPrice(number: string, price: number) {
	return (units: SightmapUnit[]) =>
		units.map((unit) =>
			unit.unit_number === number
				? { ...unit, price, total_price: [price + 6.06, price + 6.06] }
				: unit,
		);
}

/**
 * Records a check at `now`, running what's due by then. The clock moves
 * forward through the timers (`setSystemTime` would carry held pushes along
 * with it).
 */
async function check(t: T, now: number, body: string = payload()) {
	const ahead = now - Date.now();
	if (ahead > 0) vi.advanceTimersByTime(ahead);
	else vi.setSystemTime(now);
	await t.mutation(internal.henry.checks.recordCheck, {
		now,
		result: { kind: "response", body },
	});
	await t.finishInProgressScheduledFunctions();
}

/** Runs everything scheduled, held pushes included. */
async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function turnOn(
	t: T,
	endpoint = PHONE,
	timeZone = "America/Denver",
): Promise<void> {
	await t.mutation(api.yugioh.pushes.savePushSubscription, {
		endpoint,
		keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
		timeZone,
	});
}

/**
 * A baseline of every fixture unit except `numbers`, then a check an hour
 * later where they list.
 */
async function listLater(t: T, ...numbers: string[]): Promise<void> {
	await check(t, BASELINE_AT, payload(without(...numbers)));
	await check(t, BASELINE_AT + HOUR);
	await settle(t);
}

function pushedUnits(): string[] {
	return fakes.sent.map((push) => push.payload.url.replace("/henry?unit=", ""));
}

async function unitId(t: T, number: string) {
	const unit = await t.query(api.henry.units.getUnit, {
		number,
		now: Date.now(),
	});
	if (!unit) throw new Error(`Unit ${number} not recorded`);
	return unit._id;
}

async function henryPushes(t: T) {
	return await t.run(
		async (ctx) => await ctx.db.query("henryPushes").take(100),
	);
}

describe("the push rules", () => {
	test("on the real data the rules alone push 12 of the 33 units", async () => {
		const t = setup();
		await turnOn(t);
		// A baseline of one other unit, so all 33 list in the next check.
		await check(
			t,
			BASELINE_AT,
			payload(() => [NEW_UNIT]),
		);
		await check(t, BASELINE_AT + HOUR);
		await settle(t);

		expect(pushedUnits().sort()).toEqual([...PASSING].sort());
	});

	test("a new unit that passes is pushed to every device, opening its drawer", async () => {
		const t = setup();
		await turnOn(t, PHONE);
		await turnOn(t, LAPTOP);
		await listLater(t, "516");

		expect(fakes.sent.map((push) => push.endpoint).sort()).toEqual(
			[LAPTOP, PHONE].sort(),
		);
		expect(fakes.sent[0]?.payload).toEqual({
			title: "New at The Henry: Apt 516",
			body: "1 bed · 813 sq ft · $2,256/mo",
			url: "/henry?unit=516",
			tag: "henry-unit-516",
		});
		expect(fakes.sent[0]?.at).toBe(BASELINE_AT + HOUR);
	});

	test("no push for a unit on the I-25 side", async () => {
		const t = setup();
		await turnOn(t);
		// 563 is a 5th floor 2 bed: it fails only for facing I-25.
		await listLater(t, "563");
		expect(fakes.sent).toEqual([]);
	});

	test("no push for a 1 bed of 800 sq ft or less; over 800 pushes", async () => {
		const t = setup();
		await turnOn(t);
		// 509 is 664 sq ft, 516 is 813.
		await listLater(t, "509", "516");
		expect(pushedUnits()).toEqual(["516"]);
	});

	test("studios push only on floors 1 and 7", async () => {
		const t = setup();
		await turnOn(t);
		// 437 is a 4th floor studio, 733 a 7th floor one.
		await listLater(t, "437", "733");
		expect(pushedUnits()).toEqual(["733"]);
		expect(fakes.sent[0]?.payload.body).toBe("Studio · 630 sq ft · $1,823/mo");
	});

	test("the baseline never pushes", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await settle(t);
		expect(fakes.sent).toEqual([]);
		expect(await henryPushes(t)).toEqual([]);
	});

	test("units seen again and price changes don't push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await check(t, BASELINE_AT + HOUR, payload(withPrice("608", 2500)));
		await settle(t);
		expect(fakes.sent).toEqual([]);
	});
});

describe("relisting", () => {
	/** Takes `number` off the market (two misses), then relists it on day 3. */
	async function goneThenBack(
		t: T,
		number: string,
		beforeBack?: () => Promise<void>,
	): Promise<void> {
		await check(t, BASELINE_AT);
		await check(t, BASELINE_AT + HOUR, payload(without(number)));
		await check(t, BASELINE_AT + 2 * HOUR, payload(without(number)));
		await beforeBack?.();
		await check(t, BASELINE_AT + 3 * DAY, payload(withPrice(number, 2599)));
		await settle(t);
	}

	test("a relisted unit that passes pushes, saying it's relisted", async () => {
		const t = setup();
		await turnOn(t);
		await goneThenBack(t, "608");
		expect(fakes.sent.map((push) => push.payload)).toEqual([
			{
				title: "Back at The Henry: Apt 608",
				body: "Relisted · 2 bed · 1,091 sq ft · $2,599/mo",
				url: "/henry?unit=608",
				tag: "henry-unit-608",
			},
		]);
	});

	test("a relisted unit that fails the rules doesn't push", async () => {
		const t = setup();
		await turnOn(t);
		await goneThenBack(t, "563");
		expect(fakes.sent).toEqual([]);
	});
});

describe("stars override the rules", () => {
	test("a unit starred itself doesn't push when it relists on the I-25 side", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await t.mutation(api.henry.stars.toggleUnitStar, {
			unitId: await unitId(t, "563"),
		});
		await check(t, BASELINE_AT + HOUR, payload(without("563")));
		await check(t, BASELINE_AT + 2 * HOUR, payload(without("563")));
		await check(t, BASELINE_AT + 3 * DAY);
		await settle(t);
		expect(pushedUnits()).toEqual([]);
	});

	test("a starred floor plan doesn't push its I-25 side unit", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("563", "437")));
		// 563 (B2, I-25 side) and 437 (U1, 4th floor studio) both fail the rules.
		await t.mutation(api.henry.stars.toggleFloorPlanStar, { floorPlan: "B2" });
		await check(t, BASELINE_AT + HOUR);
		await settle(t);
		expect(pushedUnits()).toEqual([]);
	});
});

describe("quiet hours", () => {
	test("a unit found between 11pm and 8am is held until 8am", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("516")));
		await check(t, NIGHT);
		expect(fakes.sent).toEqual([]);

		await settle(t);
		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]?.at).toBe(EIGHT_AM);
	});

	test("events for one unit while held merge into one push with its latest state", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("516")));
		// Listed at 11pm, off the market by 1am, back at 2am, cheaper at 3am.
		await check(t, NIGHT);
		await check(t, NIGHT + HOUR, payload(without("516")));
		await check(t, NIGHT + 2 * HOUR, payload(without("516")));
		await check(t, NIGHT + 3 * HOUR);
		await check(t, NIGHT + 4 * HOUR, payload(withPrice("516", 2199)));
		await settle(t);

		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]).toMatchObject({
			at: EIGHT_AM,
			payload: {
				title: "New at The Henry: Apt 516",
				body: "1 bed · 813 sq ft · $2,199/mo",
			},
		});
	});

	test("a held push is dropped if the unit has gone off the market by 8am", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("516")));
		await check(t, NIGHT);
		await check(t, NIGHT + HOUR, payload(without("516")));
		await check(t, NIGHT + 2 * HOUR, payload(without("516")));
		await settle(t);

		expect(fakes.sent).toEqual([]);
		const [push] = await henryPushes(t);
		expect(push).toMatchObject({ status: "skipped" });
		expect(push?.note).toMatch(/off the market/);
	});

	test("a unit listing after an earlier push was sent gets a new push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("608")));
		await check(t, BASELINE_AT + HOUR);
		await settle(t);
		await check(t, BASELINE_AT + 2 * HOUR, payload(without("608")));
		await check(t, BASELINE_AT + 3 * HOUR, payload(without("608")));
		await check(t, BASELINE_AT + 4 * HOUR);
		await settle(t);
		expect(pushedUnits()).toEqual(["608", "608"]);
	});
});

async function starUnit(t: T, number: string): Promise<void> {
	await t.mutation(api.henry.stars.toggleUnitStar, {
		unitId: await unitId(t, number),
	});
}

describe("drop pushes", () => {
	// 608 is $2,656 in the fixture: a 2 bed in plan B2 that passes the rules.
	test("a starred unit's drop pushes the new price and how much it dropped", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await starUnit(t, "608");
		await check(t, BASELINE_AT + HOUR, payload(withPrice("608", 2615)));
		await settle(t);

		expect(fakes.sent.map((push) => push.payload)).toEqual([
			{
				title: "Apt 608 is down $41",
				body: "2 bed · 1,091 sq ft · $2,615/mo, was $2,656",
				url: "/henry?unit=608",
				tag: "henry-unit-608",
			},
		]);
		expect(fakes.sent[0]?.at).toBe(BASELINE_AT + HOUR);
	});

	test("a starred I-25 side unit's drop doesn't push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		// 563 is B2 on the I-25 side.
		await t.mutation(api.henry.stars.toggleFloorPlanStar, { floorPlan: "B2" });
		await check(t, BASELINE_AT + HOUR, payload(withPrice("563", 2600)));
		await settle(t);
		expect(pushedUnits()).toEqual([]);
	});

	test("an unstarred unit's drop doesn't push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await check(t, BASELINE_AT + HOUR, payload(withPrice("608", 2500)));
		await settle(t);
		expect(fakes.sent).toEqual([]);
		expect(await henryPushes(t)).toEqual([]);
	});

	test("a drop of $1 pushes", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await starUnit(t, "608");
		await check(t, BASELINE_AT + HOUR, payload(withPrice("608", 2655)));
		await settle(t);
		expect(fakes.sent[0]?.payload.title).toBe("Apt 608 is down $1");
	});

	test("a starred unit's rise doesn't push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await starUnit(t, "608");
		await check(t, BASELINE_AT + HOUR, payload(withPrice("608", 2700)));
		await settle(t);
		expect(fakes.sent).toEqual([]);
	});

	test("two drops overnight are one push at 8am with the total change", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await starUnit(t, "608");
		await check(t, NIGHT, payload(withPrice("608", 2615)));
		await check(t, NIGHT + HOUR, payload(withPrice("608", 2600)));
		expect(fakes.sent).toEqual([]);
		await settle(t);

		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]).toMatchObject({
			at: EIGHT_AM,
			payload: {
				title: "Apt 608 is down $56",
				body: "2 bed · 1,091 sq ft · $2,600/mo, was $2,656",
			},
		});
	});

	test("listed then dropped while held is one new-unit push saying the drop", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("608")));
		await t.mutation(api.henry.stars.toggleFloorPlanStar, { floorPlan: "B2" });
		await check(t, NIGHT);
		await check(t, NIGHT + HOUR, payload(withPrice("608", 2615)));
		await settle(t);

		expect(fakes.sent.map((push) => push.payload)).toMatchObject([
			{
				title: "New at The Henry: Apt 608",
				body: "Down $41 · 2 bed · 1,091 sq ft · $2,615/mo",
			},
		]);
		expect(await henryPushes(t)).toHaveLength(1);
	});

	test("listed then dropped then back up is a plain new-unit push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT, payload(without("608")));
		await t.mutation(api.henry.stars.toggleFloorPlanStar, { floorPlan: "B2" });
		await check(t, NIGHT);
		await check(t, NIGHT + HOUR, payload(withPrice("608", 2615)));
		await check(t, NIGHT + 2 * HOUR);
		await settle(t);

		expect(fakes.sent.map((push) => push.payload)).toMatchObject([
			{
				title: "New at The Henry: Apt 608",
				body: "2 bed · 1,091 sq ft · $2,656/mo",
			},
		]);
	});

	test("a starred unit relisted below its last price is one push", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		await starUnit(t, "608");
		await check(t, BASELINE_AT + HOUR, payload(without("608")));
		await check(t, BASELINE_AT + 2 * HOUR, payload(without("608")));
		await check(t, BASELINE_AT + 3 * DAY, payload(withPrice("608", 2599)));
		await settle(t);

		expect(fakes.sent.map((push) => push.payload)).toMatchObject([
			{
				title: "Back at The Henry: Apt 608",
				body: "Relisted, down $57 · 2 bed · 1,091 sq ft · $2,599/mo",
			},
		]);
		expect(await henryPushes(t)).toHaveLength(1);
	});

	describe("a held drop is dropped at delivery", () => {
		async function heldDrop(t: T): Promise<void> {
			await turnOn(t);
			await check(t, BASELINE_AT);
			await starUnit(t, "608");
			await check(t, NIGHT, payload(withPrice("608", 2615)));
		}

		async function skippedNote(t: T): Promise<string | null | undefined> {
			await settle(t);
			expect(fakes.sent).toEqual([]);
			const [push] = await henryPushes(t);
			expect(push?.status).toBe("skipped");
			return push?.note;
		}

		test("when the unit is no longer starred", async () => {
			const t = setup();
			await heldDrop(t);
			await starUnit(t, "608");
			expect(await skippedNote(t)).toMatch(/no longer starred/);
		});

		test("when the price is back at the price before the drop", async () => {
			const t = setup();
			await heldDrop(t);
			await check(t, NIGHT + HOUR);
			expect(await skippedNote(t)).toBe(
				"The price is back at $2,656 or above.",
			);
		});

		test("when the unit has gone off the market", async () => {
			const t = setup();
			await heldDrop(t);
			await check(t, NIGHT + HOUR, payload(without("608")));
			await check(t, NIGHT + 2 * HOUR, payload(without("608")));
			expect(await skippedNote(t)).toMatch(/off the market/);
		});

		test("but not while it's still starred through its plan", async () => {
			const t = setup();
			await heldDrop(t);
			await t.mutation(api.henry.stars.toggleFloorPlanStar, {
				floorPlan: "B2",
			});
			await starUnit(t, "608");
			await settle(t);
			expect(pushedUnits()).toEqual(["608"]);
		});
	});
});

describe("the failing-checks push", () => {
	async function fail(t: T, now: number, reason = "HTTP 503"): Promise<void> {
		vi.advanceTimersByTime(now - Date.now());
		await t.mutation(internal.henry.checks.recordCheck, {
			now,
			result: { kind: "fetchFailed", reason },
		});
		await t.finishInProgressScheduledFunctions();
	}

	test("after 6 hours without a successful check, one push, once per outage", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		for (let hour = 1; hour <= 5; hour++) {
			await fail(t, BASELINE_AT + hour * HOUR);
		}
		expect(fakes.sent).toEqual([]);

		await fail(t, BASELINE_AT + 6 * HOUR, "The operation was aborted");
		await settle(t);
		await fail(t, BASELINE_AT + 7 * HOUR);
		await fail(t, BASELINE_AT + 8 * HOUR);
		await settle(t);

		expect(fakes.sent.map((push) => push.payload)).toEqual([
			{
				title: "The Henry checks are failing",
				body: "No successful check since Sun 11:00 AM. Last error: The operation was aborted",
				url: "/henry",
				tag: "henry-checks",
			},
		]);
		// 5pm in Denver: not held.
		expect(fakes.sent[0]?.at).toBe(BASELINE_AT + 6 * HOUR);
	});

	test("it resets after the next successful check, and a night outage waits for 8am", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT);
		for (let hour = 1; hour <= 6; hour++) {
			await fail(t, BASELINE_AT + hour * HOUR);
		}
		await settle(t);
		await check(t, BASELINE_AT + 7 * HOUR);
		// 6pm: a new outage; its sixth hour is midnight.
		for (let hour = 8; hour <= 13; hour++) {
			await fail(t, BASELINE_AT + hour * HOUR);
		}
		expect(fakes.sent).toHaveLength(1);

		await settle(t);
		expect(fakes.sent).toHaveLength(2);
		expect(fakes.sent[1]).toMatchObject({
			at: EIGHT_AM,
			payload: {
				body: "No successful check since Sun 6:00 PM. Last error: HTTP 503",
			},
		});
	});

	test("a held failing-checks push is dropped if the checks recover by 8am", async () => {
		const t = setup();
		await turnOn(t);
		await check(t, BASELINE_AT + 7 * HOUR);
		for (let hour = 8; hour <= 13; hour++) {
			await fail(t, BASELINE_AT + hour * HOUR);
		}
		await check(t, BASELINE_AT + 14 * HOUR);
		await settle(t);
		expect(fakes.sent).toEqual([]);
		const [push] = await henryPushes(t);
		expect(push).toMatchObject({
			status: "skipped",
			note: "The checks are working again.",
		});
	});

	test("failures before tracking begins don't push", async () => {
		const t = setup();
		await turnOn(t);
		for (let hour = 0; hour <= 8; hour++) {
			await fail(t, BASELINE_AT + hour * HOUR);
		}
		await settle(t);
		expect(fakes.sent).toEqual([]);
	});
});

describe("devices", () => {
	test("with push off everywhere, nothing is sent", async () => {
		const t = setup();
		await listLater(t, "516");
		expect(fakes.sent).toEqual([]);
		const [push] = await henryPushes(t);
		expect(push?.status).toBe("skipped");
	});
});

test("push deliveries aren't publicly callable", async () => {
	const pushes = (await modules["/convex/henry/pushes.ts"]?.()) as Record<
		string,
		{ isInternal?: boolean; isPublic?: boolean }
	>;
	const delivery = (await modules[
		"/convex/henry/pushDelivery.ts"
	]?.()) as Record<string, { isInternal?: boolean; isPublic?: boolean }>;
	for (const fn of [
		pushes.claimDelivery,
		pushes.recordDelivery,
		pushes.expireDelivery,
		delivery.deliver,
	]) {
		expect(fn?.isInternal).toBe(true);
		expect(fn?.isPublic).not.toBe(true);
	}
});

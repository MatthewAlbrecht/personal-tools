/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import fixture from "./fixtures/sightmap-2026-11-08.json";

const modules = import.meta.glob("/convex/**/*.ts");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASELINE_AT = Date.UTC(2026, 10, 8, 18);

type FixtureUnit = (typeof fixture)["data"]["units"][number];
// Every special in the fixture is null; real ones are strings.
type SightmapUnit = Omit<FixtureUnit, "specials_description"> & {
	specials_description: string | null;
};

/** I-25 side units in the 2026-11-08 response, from the spec's fixed list. */
const I25_IN_FIXTURE = [
	"359",
	"373",
	"381",
	"477",
	"563",
	"571",
	"651",
	"655",
	"673",
	"677",
	"777",
	"779",
];

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** A copy of the real response, edited per test. */
function payload(edit?: (units: SightmapUnit[]) => SightmapUnit[]): string {
	const copy = structuredClone(fixture);
	const units: SightmapUnit[] = copy.data.units;
	return JSON.stringify({
		...copy,
		data: { ...copy.data, units: edit ? edit(units) : units },
	});
}

function withPrice(number: string, price: number) {
	return (units: SightmapUnit[]) =>
		units.map((unit) =>
			unit.unit_number === number
				? { ...unit, price, total_price: [price + 6.06, price + 6.06] }
				: unit,
		);
}

async function check(t: T, now: number, body: string = payload()) {
	await t.mutation(internal.henry.checks.recordCheck, {
		now,
		result: { kind: "response", body },
	});
}

async function ledger(t: T, now: number) {
	return await t.query(api.henry.ledger.getLedger, { now });
}

function row(
	page: Awaited<ReturnType<typeof ledger>>,
	number: string,
): Awaited<ReturnType<typeof ledger>>["units"][number] {
	const found = page.units.find((unit) => unit.number === number);
	if (!found) throw new Error(`Unit ${number} isn't on the Ledger`);
	return found;
}

async function details(t: T, number: string, now: number = BASELINE_AT) {
	const unit = await t.query(api.henry.units.getUnit, { number, now });
	if (!unit) throw new Error(`Unit ${number} not recorded`);
	return unit;
}

async function pricePoints(t: T, number: string) {
	return (await details(t, number)).history;
}

async function timeline(t: T, number: string) {
	return (await details(t, number)).timeline;
}

/** A unit first seen after the baseline: 609, on the 6th floor. */
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
	specials_description: "6 weeks free",
} satisfies SightmapUnit;

function withNewUnit(price: number = NEW_UNIT.price) {
	return (units: SightmapUnit[]) => [
		...units,
		{ ...NEW_UNIT, price, total_price: [price + 6.06, price + 6.06] },
	];
}

describe("before the first check", () => {
	test("the Ledger is empty and says tracking hasn't begun", async () => {
		const t = setup();
		expect(await ledger(t, BASELINE_AT)).toEqual({
			trackingBeganAt: null,
			lastCheckedAt: null,
			lastCheck: null,
			onMarketCount: 0,
			newThisWeekCount: 0,
			goneThisWeekCount: 0,
			checksFailing: false,
			units: [],
			goneThisWeek: [],
		});
	});
});

describe("baseline", () => {
	test("records all 33 units, none new, sorted by price", async () => {
		const t = setup();
		await check(t, BASELINE_AT);

		const page = await ledger(t, BASELINE_AT + 10 * 60 * 1000);
		expect(page.trackingBeganAt).toBe(BASELINE_AT);
		expect(page.lastCheckedAt).toBe(BASELINE_AT);
		expect(page.lastCheck).toEqual({
			at: BASELINE_AT,
			outcome: "success",
			reason: null,
			unitCount: 33,
		});
		expect(page.onMarketCount).toBe(33);
		expect(page.newThisWeekCount).toBe(0);
		expect(page.units).toHaveLength(33);
		expect(page.units.every((unit) => unit.newDays === null)).toBe(true);

		const prices = page.units.map((unit) => unit.price);
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
		expect(page.units[0]?.number).toBe("743");
		expect(page.units.at(-1)?.number).toBe("127");
	});

	test("parses each unit's facts", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const page = await ledger(t, BASELINE_AT);

		expect(row(page, "608")).toMatchObject({
			number: "608",
			floor: 6,
			floorPlan: "B2",
			beds: 2,
			baths: 2,
			sqft: 1091,
			price: 2656,
			totalPrice: 2662.06,
			leaseTermMonths: 16,
			availableOn: "2026-11-08",
			specials: null,
			facesI25: false,
			newDays: null,
		});
		expect(row(page, "733")).toMatchObject({
			floor: 7,
			floorPlan: "U1",
			beds: 0,
			baths: 1,
			leaseTermMonths: 15,
		});
		expect(row(page, "127")).toMatchObject({
			floorPlan: "TH",
			beds: 2,
			baths: 3,
		});
		expect(row(page, "713").availableOn).toBe("2026-11-23");
	});

	test("starts each unit's timeline with Tracking began at its price", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		expect(await timeline(t, "608")).toEqual([
			{ kind: "trackingBegan", at: BASELINE_AT, price: 2656 },
		]);
		expect(await pricePoints(t, "608")).toEqual([
			{
				at: BASELINE_AT,
				price: 2656,
				totalPrice: 2662.06,
				leaseTermMonths: 16,
			},
		]);
	});

	test("marks the I-25 side units from the fixed list", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const page = await ledger(t, BASELINE_AT);
		const i25 = page.units
			.filter((unit) => unit.facesI25)
			.map((unit) => unit.number)
			.sort();
		expect(i25).toEqual(I25_IN_FIXTURE);
		// Corner unit x47 sits back from the highway; 7xx stops at 779.
		expect(row(page, "647").facesI25).toBe(false);
		expect(row(page, "743").facesI25).toBe(false);
	});
});

describe("after the baseline", () => {
	test("an unseen unit is listed and badged New for 7 days", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const listedAt = BASELINE_AT + 2 * HOUR;
		await check(t, listedAt, payload(withNewUnit()));

		const sameDay = await ledger(t, listedAt + HOUR);
		expect(sameDay.onMarketCount).toBe(34);
		expect(sameDay.newThisWeekCount).toBe(1);
		expect(row(sameDay, "609")).toMatchObject({
			newDays: 0,
			price: 2590,
			specials: "6 weeks free",
			availableOn: "2026-12-01",
		});
		expect(await timeline(t, "609")).toEqual([
			{ kind: "listed", at: listedAt, price: 2590 },
		]);

		const threeDaysOn = await ledger(t, listedAt + 3 * DAY + HOUR);
		expect(row(threeDaysOn, "609").newDays).toBe(3);

		const eightDaysOn = await ledger(t, listedAt + 8 * DAY);
		expect(row(eightDaysOn, "609").newDays).toBeNull();
		expect(eightDaysOn.newThisWeekCount).toBe(0);
	});

	test("a changed base rent records a price point", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const changedAt = BASELINE_AT + HOUR;
		await check(t, changedAt, payload(withPrice("608", 2615)));

		const page = await ledger(t, changedAt);
		expect(row(page, "608")).toMatchObject({
			price: 2615,
			totalPrice: 2621.06,
		});
		expect(page.lastCheckedAt).toBe(changedAt);
		expect(await pricePoints(t, "608")).toEqual([
			{
				at: BASELINE_AT,
				price: 2656,
				totalPrice: 2662.06,
				leaseTermMonths: 16,
			},
			{ at: changedAt, price: 2615, totalPrice: 2621.06, leaseTermMonths: 16 },
		]);
	});

	test("an unchanged base rent records no price point", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		// Only the total and move-in date move: not a price change.
		await check(
			t,
			BASELINE_AT + HOUR,
			payload((units) =>
				units.map((unit) =>
					unit.unit_number === "608"
						? {
								...unit,
								total_price: [2670.06, 2670.06],
								available_on: "2026-11-20",
							}
						: unit,
				),
			),
		);

		expect(await pricePoints(t, "608")).toHaveLength(1);
		expect(await pricePoints(t, "101")).toHaveLength(1);
		const page = await ledger(t, BASELINE_AT + HOUR);
		expect(row(page, "608")).toMatchObject({
			price: 2656,
			totalPrice: 2670.06,
			availableOn: "2026-11-20",
		});
		expect(page.newThisWeekCount).toBe(0);
	});
});

describe("price changes", () => {
	// 608 starts at $2,656 in the baseline, then moves three times; 609 lists
	// on day 11 and rises the next day.
	const D2 = BASELINE_AT + 2 * DAY;
	const D9 = BASELINE_AT + 9 * DAY;
	const D10 = BASELINE_AT + 10 * DAY;
	const D11 = BASELINE_AT + 11 * DAY;
	const D12 = BASELINE_AT + 12 * DAY;
	const NOW = D12 + HOUR;

	async function history(t: T): Promise<void> {
		await check(t, BASELINE_AT);
		await check(t, D2, payload(withPrice("608", 2615)));
		await check(t, D9, payload(withPrice("608", 2640)));
		await check(t, D10, payload(withPrice("608", 2600)));
		await check(
			t,
			D11,
			payload((units) => withNewUnit(2590)(withPrice("608", 2600)(units))),
		);
		await check(
			t,
			D12,
			payload((units) => withNewUnit(2625)(withPrice("608", 2600)(units))),
		);
	}

	test("the Ledger has each unit's 3, 7 and 14 day change at now", async () => {
		const t = setup();
		await history(t);
		const page = await ledger(t, NOW);

		// 3 days back: $2,640 (day 9). 7 back: $2,615 (day 2). 14 back is
		// before tracking began, so from the first price, $2,656.
		expect(row(page, "608").changes).toEqual({ d3: -40, d7: -15, d14: -56 });
		// Listed yesterday: every window measures from its listing price.
		expect(row(page, "609").changes).toEqual({ d3: 35, d7: 35, d14: 35 });
		expect(row(page, "101").changes).toEqual({ d3: 0, d7: 0, d14: 0 });
	});

	test("changes move with now: a drop leaves the 3 day window after 3 days", async () => {
		const t = setup();
		await history(t);
		const later = await ledger(t, D10 + 3 * DAY + HOUR);
		// 3 days back is just after the day-10 drop; 7 back is day 6, $2,615.
		expect(row(later, "608").changes).toEqual({ d3: 0, d7: -15, d14: -56 });
	});

	test("the drawer has the changes, the change since tracking began and the history", async () => {
		const t = setup();
		await history(t);
		const unit = await details(t, "608", NOW);

		expect(unit).toMatchObject({
			number: "608",
			floorPlan: "B2",
			beds: 2,
			baths: 2,
			sqft: 1091,
			floor: 6,
			facesI25: false,
			price: 2600,
			totalPrice: 2606.06,
			leaseTermMonths: 16,
			availableOn: "2026-11-08",
			listedAt: null,
			newDays: null,
			changes: { d3: -40, d7: -15, d14: -56 },
			sinceStart: -56,
		});
		expect(unit.history.map(({ at, price }) => ({ at, price }))).toEqual([
			{ at: BASELINE_AT, price: 2656 },
			{ at: D2, price: 2615 },
			{ at: D9, price: 2640 },
			{ at: D10, price: 2600 },
		]);
	});

	test("the timeline runs newest first, each change before and after", async () => {
		const t = setup();
		await history(t);

		expect(await timeline(t, "608")).toEqual([
			{ kind: "priceChange", at: D10, from: 2640, to: 2600 },
			{ kind: "priceChange", at: D9, from: 2615, to: 2640 },
			{ kind: "priceChange", at: D2, from: 2656, to: 2615 },
			{ kind: "trackingBegan", at: BASELINE_AT, price: 2656 },
		]);
		expect(await timeline(t, "609")).toEqual([
			{ kind: "priceChange", at: D12, from: 2590, to: 2625 },
			{ kind: "listed", at: D11, price: 2590 },
		]);
		const listed = await details(t, "609", NOW);
		expect(listed).toMatchObject({ listedAt: D11, newDays: 1, sinceStart: 35 });
	});

	test("an unknown unit has no details", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		expect(
			await t.query(api.henry.units.getUnit, {
				number: "999",
				now: BASELINE_AT,
			}),
		).toBeNull();
	});
});

function without(...numbers: string[]) {
	return (units: SightmapUnit[]) =>
		units.filter((unit) => !numbers.includes(unit.unit_number));
}

describe("off the market", () => {
	const H1 = BASELINE_AT + HOUR;
	const H2 = BASELINE_AT + 2 * HOUR;
	const H3 = BASELINE_AT + 3 * HOUR;

	test("one missed check keeps a unit on the market", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		await check(t, H1, payload(without("608")));

		const page = await ledger(t, H1);
		expect(page.onMarketCount).toBe(33);
		expect(row(page, "608").price).toBe(2656);
		expect(page.goneThisWeek).toEqual([]);
		expect(await details(t, "608", H1)).toMatchObject({
			status: "onMarket",
			offMarketAt: null,
		});
	});

	test("two missed checks in a row take it off the market at its last price", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		await check(t, H1, payload(withPrice("608", 2615)));
		await check(t, H2, payload(without("608")));
		await check(t, H3, payload(without("608")));

		const page = await ledger(t, H3);
		expect(page.onMarketCount).toBe(32);
		expect(page.units.some((unit) => unit.number === "608")).toBe(false);
		expect(page.goneThisWeekCount).toBe(1);
		expect(page.goneThisWeek).toEqual([
			{
				_id: expect.any(String),
				number: "608",
				floorPlan: "B2",
				beds: 2,
				sqft: 1091,
				price: 2615,
				offMarketAt: H3,
			},
		]);

		const unit = await details(t, "608", H3);
		expect(unit).toMatchObject({
			status: "offMarket",
			offMarketAt: H3,
			price: 2615,
		});
		expect(unit.history).toHaveLength(2);
		expect(unit.timeline[0]).toEqual({
			kind: "offMarket",
			at: H3,
			price: 2615,
		});
	});

	test("seen again after one miss resets the misses", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		await check(t, H1, payload(without("608")));
		await check(t, H2);
		await check(t, H3, payload(without("608")));

		const page = await ledger(t, H3);
		expect(row(page, "608").price).toBe(2656);
		expect(page.goneThisWeekCount).toBe(0);
	});

	test("gone this week lists the last 7 days, newest first", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		await check(t, H1, payload(without("608")));
		await check(t, H2, payload(without("608")));
		const D3 = BASELINE_AT + 3 * DAY;
		await check(t, D3, payload(without("608", "101")));
		await check(t, D3 + HOUR, payload(without("608", "101")));

		const soon = await ledger(t, D3 + 2 * HOUR);
		expect(soon.goneThisWeek.map((unit) => unit.number)).toEqual([
			"101",
			"608",
		]);
		expect(soon.goneThisWeekCount).toBe(2);

		// 608 went at H2; eight days on it has left the list, 101 hasn't.
		const later = await ledger(t, H2 + 8 * DAY);
		expect(later.goneThisWeek.map((unit) => unit.number)).toEqual(["101"]);
		expect(later.goneThisWeekCount).toBe(1);
		// Its drawer still opens.
		expect((await details(t, "608", H2 + 8 * DAY)).status).toBe("offMarket");
	});
});

describe("relisting", () => {
	const H1 = BASELINE_AT + HOUR;
	const H2 = BASELINE_AT + 2 * HOUR;
	const BACK = BASELINE_AT + 3 * DAY;

	async function goneThenBack(t: T, body: string = payload()): Promise<void> {
		await check(t, BASELINE_AT);
		await check(t, H1, payload(without("608")));
		await check(t, H2, payload(without("608")));
		await check(t, BACK, body);
	}

	test("a gone unit seen again is relisted with its history kept", async () => {
		const t = setup();
		await goneThenBack(t, payload(withPrice("608", 2599)));

		const page = await ledger(t, BACK + HOUR);
		expect(row(page, "608")).toMatchObject({ price: 2599, newDays: 0 });
		expect(page.onMarketCount).toBe(33);
		expect(page.newThisWeekCount).toBe(1);
		expect(page.goneThisWeek).toEqual([]);

		const unit = await details(t, "608", BACK + HOUR);
		expect(unit).toMatchObject({
			status: "onMarket",
			offMarketAt: null,
			listedAt: BACK,
			firstSeenAt: BASELINE_AT,
			sinceStart: -57,
		});
		expect(unit.history.map(({ at, price }) => ({ at, price }))).toEqual([
			{ at: BASELINE_AT, price: 2656 },
			{ at: BACK, price: 2599 },
		]);
		expect(unit.timeline).toEqual([
			{ kind: "priceChange", at: BACK, from: 2656, to: 2599 },
			{ kind: "relisted", at: BACK, price: 2599 },
			{ kind: "offMarket", at: H2, price: 2656 },
			{ kind: "trackingBegan", at: BASELINE_AT, price: 2656 },
		]);
	});

	test("New counts from the relisting", async () => {
		const t = setup();
		await goneThenBack(t);
		expect(row(await ledger(t, BACK + 2 * DAY), "608").newDays).toBe(2);
		expect(row(await ledger(t, BACK + 8 * DAY), "608").newDays).toBeNull();
	});

	test("a relisted unit can go off the market again", async () => {
		const t = setup();
		await goneThenBack(t);
		await check(t, BACK + HOUR, payload(without("608")));
		await check(t, BACK + 2 * HOUR, payload(without("608")));

		const page = await ledger(t, BACK + 2 * HOUR);
		expect(page.goneThisWeek.map((unit) => unit.offMarketAt)).toEqual([
			BACK + 2 * HOUR,
		]);
		const kinds = (await timeline(t, "608")).map((entry) => entry.kind);
		expect(kinds).toEqual([
			"offMarket",
			"relisted",
			"offMarket",
			"trackingBegan",
		]);
	});
});

describe("short responses", () => {
	const H1 = BASELINE_AT + HOUR;
	const H2 = BASELINE_AT + 2 * HOUR;
	const H3 = BASELINE_AT + 3 * HOUR;

	test("an empty response after the baseline fails and changes nothing", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const before = await ledger(t, H1);
		await check(
			t,
			H1,
			payload(() => []),
		);

		const after = await ledger(t, H1);
		expect(after.lastCheck).toEqual({
			at: H1,
			outcome: "failure",
			reason: "No units in the response",
			unitCount: null,
		});
		expect({ ...after, lastCheck: null }).toEqual({
			...before,
			lastCheck: null,
		});
	});

	test("under half the units on the market fails; half is fine", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		// 33 on the market: 16 is under half, 17 isn't.
		await check(
			t,
			H1,
			payload((units) => units.slice(0, 16)),
		);
		const page = await ledger(t, H1);
		expect(page.lastCheck).toMatchObject({
			outcome: "failure",
			reason: "Only 16 units, under half of the 33 on the market",
		});
		expect(page.lastCheckedAt).toBe(BASELINE_AT);

		await check(
			t,
			H2,
			payload((units) => units.slice(0, 17)),
		);
		expect((await ledger(t, H2)).lastCheck?.outcome).toBe("success");
	});

	test("failed checks don't count as misses", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		await check(t, H1, payload(without("608")));
		await check(
			t,
			H2,
			payload(() => []),
		);
		await check(t, H2 + 10 * 60 * 1000, "<html>down</html>");
		await t.mutation(internal.henry.checks.recordCheck, {
			now: H2 + 20 * 60 * 1000,
			result: { kind: "fetchFailed", reason: "HTTP 503" },
		});
		await check(t, H3);

		const page = await ledger(t, H3);
		expect(row(page, "608").price).toBe(2656);
		expect(page.goneThisWeekCount).toBe(0);

		// The miss before the failures reset when it was seen at H3.
		await check(t, H3 + HOUR, payload(without("608")));
		expect((await ledger(t, H3 + HOUR)).goneThisWeekCount).toBe(0);
	});
});

describe("checks failing", () => {
	test("the Ledger says checks are failing once the last success is over 3 hours old", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		for (const hours of [1, 2, 3]) {
			await check(t, BASELINE_AT + hours * HOUR, "nope");
		}

		expect((await ledger(t, BASELINE_AT + 3 * HOUR)).checksFailing).toBe(false);
		const stale = await ledger(t, BASELINE_AT + 3 * HOUR + 60_000);
		expect(stale.checksFailing).toBe(true);
		expect(stale.lastCheckedAt).toBe(BASELINE_AT);

		await check(t, BASELINE_AT + 4 * HOUR);
		expect((await ledger(t, BASELINE_AT + 4 * HOUR)).checksFailing).toBe(false);
	});
});

describe("failed checks", () => {
	const broken: Array<[string, string, string]> = [
		["invalid JSON", "<html>Service unavailable</html>", "Not JSON"],
		["no units array", JSON.stringify({ data: {} }), "No units array"],
		[
			"a unit on an unknown floor plan",
			payload((units) => [
				...units,
				{ ...units[0], id: "999002", floor_plan_id: "nope" } as SightmapUnit,
			]),
			"Unit 999002: unknown floor plan nope",
		],
	];

	test.each(broken)("%s changes nothing", async (_name, body, reason) => {
		const t = setup();
		await check(t, BASELINE_AT);
		const before = await ledger(t, BASELINE_AT + HOUR);

		const failedAt = BASELINE_AT + HOUR;
		await check(t, failedAt, body);

		const after = await ledger(t, BASELINE_AT + HOUR);
		expect(after.lastCheck).toEqual({
			at: failedAt,
			outcome: "failure",
			reason,
			unitCount: null,
		});
		expect({ ...after, lastCheck: null }).toEqual({
			...before,
			lastCheck: null,
		});
		expect(after.lastCheckedAt).toBe(BASELINE_AT);
	});

	test("a fetch failure is logged and changes nothing", async () => {
		const t = setup();
		await t.mutation(internal.henry.checks.recordCheck, {
			now: BASELINE_AT,
			result: { kind: "fetchFailed", reason: "HTTP 503" },
		});
		expect(await ledger(t, BASELINE_AT)).toMatchObject({
			trackingBeganAt: null,
			lastCheckedAt: null,
			lastCheck: {
				at: BASELINE_AT,
				outcome: "failure",
				reason: "HTTP 503",
				unitCount: null,
			},
			units: [],
		});
	});

	test("a failed first check isn't the baseline", async () => {
		const t = setup();
		await check(t, BASELINE_AT, "nope");
		const firstGood = BASELINE_AT + HOUR;
		await check(t, firstGood);

		const page = await ledger(t, firstGood);
		expect(page.trackingBeganAt).toBe(firstGood);
		expect(page.newThisWeekCount).toBe(0);
	});

	test("an empty first response isn't a baseline", async () => {
		const t = setup();
		await check(
			t,
			BASELINE_AT,
			payload(() => []),
		);
		const page = await ledger(t, BASELINE_AT);
		expect(page.trackingBeganAt).toBeNull();
		expect(page.lastCheck?.outcome).toBe("failure");
	});
});

describe("public surface", () => {
	test("only the page queries are public; the check functions are internal", async () => {
		const checks = (await modules["/convex/henry/checks.ts"]?.()) as Record<
			string,
			{ isPublic?: boolean; isInternal?: boolean }
		>;
		const ledgerModule = (await modules[
			"/convex/henry/ledger.ts"
		]?.()) as Record<string, { isPublic?: boolean }>;
		const unitsModule = (await modules["/convex/henry/units.ts"]?.()) as Record<
			string,
			{ isPublic?: boolean }
		>;
		expect(checks.recordCheck?.isInternal).toBe(true);
		expect(checks.checkSightmap?.isInternal).toBe(true);
		expect(ledgerModule.getLedger?.isPublic).toBe(true);
		expect(unitsModule.getUnit?.isPublic).toBe(true);
	});
});

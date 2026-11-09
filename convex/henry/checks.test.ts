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

// Ticket 03's unit details query will show history and the timeline; until
// then these read what that query will be built on.
async function pricePoints(t: T, number: string) {
	return await t.run(async (ctx) => {
		const unit = await ctx.db
			.query("henryUnits")
			.withIndex("by_status_and_price", (q) => q.eq("status", "onMarket"))
			.take(100)
			.then((units) => units.find((u) => u.number === number));
		if (!unit) throw new Error(`Unit ${number} not recorded`);
		const points = await ctx.db
			.query("henryPricePoints")
			.withIndex("by_unitId_and_at", (q) => q.eq("unitId", unit._id))
			.take(100);
		return points.map(({ at, price, totalPrice, leaseTermMonths }) => ({
			at,
			price,
			totalPrice,
			leaseTermMonths,
		}));
	});
}

async function timeline(t: T, number: string) {
	return await t.run(async (ctx) => {
		const unit = await ctx.db
			.query("henryUnits")
			.withIndex("by_status_and_price", (q) => q.eq("status", "onMarket"))
			.take(100)
			.then((units) => units.find((u) => u.number === number));
		if (!unit) throw new Error(`Unit ${number} not recorded`);
		const events = await ctx.db
			.query("henryUnitEvents")
			.withIndex("by_unitId_and_at", (q) => q.eq("unitId", unit._id))
			.take(100);
		return events.map(({ kind, at, price }) => ({ kind, at, price }));
	});
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
			units: [],
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

	test("an unseen unit is listed and badged New for 7 days", async () => {
		const t = setup();
		await check(t, BASELINE_AT);
		const listedAt = BASELINE_AT + 2 * HOUR;
		await check(
			t,
			listedAt,
			payload((units) => [...units, NEW_UNIT]),
		);

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
	test("only the page query is public; the check functions are internal", async () => {
		const checks = (await modules["/convex/henry/checks.ts"]?.()) as Record<
			string,
			{ isPublic?: boolean; isInternal?: boolean }
		>;
		const ledgerModule = (await modules[
			"/convex/henry/ledger.ts"
		]?.()) as Record<string, { isPublic?: boolean }>;
		expect(checks.recordCheck?.isInternal).toBe(true);
		expect(checks.checkSightmap?.isInternal).toBe(true);
		expect(ledgerModule.getLedger?.isPublic).toBe(true);
	});
});

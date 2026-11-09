import { describe, expect, test } from "vitest";
import {
	checksFailingPushText,
	newUnitPushLabel,
	pushRuleMiss,
	pushesNewUnit,
	unitPushText,
} from "./pushes";

const TWO_BED = { facesI25: false, beds: 2, sqft: 1091, floor: 6 };

describe("pushRuleMiss", () => {
	test("names the rule a unit fails, or null when it passes", () => {
		expect(pushRuleMiss(TWO_BED)).toBeNull();
		expect(pushRuleMiss({ ...TWO_BED, facesI25: true })).toBe("Faces I-25");
		expect(pushRuleMiss({ ...TWO_BED, beds: 1, sqft: 800 })).toBe(
			"1 bed, 800 sq ft or less",
		);
		expect(pushRuleMiss({ ...TWO_BED, beds: 1, sqft: 801 })).toBeNull();
		expect(pushRuleMiss({ ...TWO_BED, beds: 0, floor: 2 })).toBe(
			"Studio on floors 2-6",
		);
		expect(pushRuleMiss({ ...TWO_BED, beds: 0, floor: 6 })).toBe(
			"Studio on floors 2-6",
		);
		expect(pushRuleMiss({ ...TWO_BED, beds: 0, floor: 1 })).toBeNull();
		expect(pushRuleMiss({ ...TWO_BED, beds: 0, floor: 7 })).toBeNull();
	});
});

test("a starred unit pushes whatever the rules say", () => {
	const skipped = { ...TWO_BED, facesI25: true };
	expect(pushesNewUnit(skipped, false)).toBe(false);
	expect(pushesNewUnit(skipped, true)).toBe(true);
	expect(pushesNewUnit(TWO_BED, false)).toBe(true);
});

const UNIT_127 = { number: "127", beds: 2, sqft: 1490, price: 3271 };

test("push text says the unit, layout, size and price", () => {
	expect(
		unitPushText({ ...UNIT_127, news: { kind: "listed", droppedFrom: null } }),
	).toEqual({
		title: "New at The Henry: Apt 127",
		body: "2 bed · 1,490 sq ft · $3,271/mo",
	});
	expect(
		unitPushText({
			number: "733",
			beds: 0,
			sqft: 630,
			price: 1823,
			news: { kind: "relisted", droppedFrom: null },
		}),
	).toEqual({
		title: "Back at The Henry: Apt 733",
		body: "Relisted · Studio · 630 sq ft · $1,823/mo",
	});
});

test("drop push text says how much it dropped and the new price", () => {
	expect(
		unitPushText({ ...UNIT_127, news: { kind: "dropped", droppedFrom: 3300 } }),
	).toEqual({
		title: "Down $29 at The Henry: Apt 127",
		body: "2 bed · 1,490 sq ft · $3,271/mo, was $3,300",
	});
	expect(
		unitPushText({ ...UNIT_127, news: { kind: "listed", droppedFrom: 3300 } }),
	).toEqual({
		title: "New at The Henry: Apt 127",
		body: "Down $29 · 2 bed · 1,490 sq ft · $3,271/mo",
	});
	expect(
		unitPushText({
			...UNIT_127,
			news: { kind: "relisted", droppedFrom: 3300 },
		}),
	).toEqual({
		title: "Back at The Henry: Apt 127",
		body: "Relisted, down $29 · 2 bed · 1,490 sq ft · $3,271/mo",
	});
});

test("the failing-checks push names the last success and the last error", () => {
	const lastSuccessAt = Date.UTC(2026, 10, 8, 18);
	expect(
		checksFailingPushText({
			lastSuccessAt,
			lastError: "HTTP 503",
			timeZone: "America/Denver",
		}),
	).toEqual({
		title: "The Henry checks are failing",
		body: "No successful check since Sun 11:00 AM. Last error: HTTP 503",
	});
	const long = checksFailingPushText({
		lastSuccessAt,
		lastError: "x".repeat(200),
		timeZone: "Not/AZone",
	}).body;
	expect(long).toMatch(
		/^No successful check since Sun 11:00 AM\. Last error: x+…$/,
	);
	expect(long.length).toBeLessThan(140);
});

test("the drawer says whether a unit would push, and why not", () => {
	expect(newUnitPushLabel(TWO_BED, false)).toBe("Yes");
	expect(newUnitPushLabel({ ...TWO_BED, facesI25: true }, false)).toBe(
		"No: faces I-25",
	);
	expect(newUnitPushLabel({ ...TWO_BED, beds: 0, floor: 4 }, false)).toBe(
		"No: studio on floors 2-6",
	);
	expect(newUnitPushLabel({ ...TWO_BED, facesI25: true }, true)).toBe(
		"Yes, starred",
	);
});

import { describe, expect, test } from "vitest";
import {
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

test("push text says the unit, layout, size and price", () => {
	expect(
		unitPushText({
			number: "127",
			beds: 2,
			sqft: 1490,
			price: 3271,
			relisted: false,
		}),
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
			relisted: true,
		}),
	).toEqual({
		title: "Back at The Henry: Apt 733",
		body: "Relisted · Studio · 630 sq ft · $1,823/mo",
	});
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

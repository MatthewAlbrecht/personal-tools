import assert from "node:assert/strict";
import test from "node:test";
import {
	catalogLaunchTime,
	inferEdition,
	makeTitleKey,
	parsePublicationDateToMs,
	seasonFromTimestamp,
} from "./folioCatalogFields";

test("inferEdition limited and signed", () => {
	assert.equal(inferEdition("Carrie (Limited Edition)", true), "limited");
	assert.equal(inferEdition("Say Nothing (signed edition)", true), "signed");
	assert.equal(inferEdition("Carrie", true), "standard");
});

test("inferEdition bundle only without dates", () => {
	assert.equal(inferEdition("The Shirley Jackson Collection", false), "bundle");
	assert.equal(
		inferEdition("The Shirley Jackson Collection", true),
		"standard",
	);
});

test("makeTitleKey requires author to join", () => {
	assert.equal(makeTitleKey("Carrie ", "Stephen King"), "stephen king|carrie");
	assert.notEqual(
		makeTitleKey("Carrie", undefined),
		makeTitleKey("Carrie", "King"),
	);
	assert.match(
		makeTitleKey("Carrie (Limited Edition)", "Stephen King"),
		/\|carrie$/,
	);
});

test("parsePublicationDateToMs accepts DD/MM/YYYY and DD/MM/YY", () => {
	const a = parsePublicationDateToMs("15/09/2026");
	const b = parsePublicationDateToMs("05/05/26");
	assert.ok(a);
	assert.ok(b);
	assert.equal(new Date(a).getUTCFullYear(), 2026);
	assert.equal(new Date(b).getUTCFullYear(), 2026);
});

test("seasonFromTimestamp Fall before Spring and Dec rolls Winter label", () => {
	const fall = seasonFromTimestamp(Date.UTC(2026, 8, 15));
	const spring = seasonFromTimestamp(Date.UTC(2026, 4, 5));
	const dec = seasonFromTimestamp(Date.UTC(2026, 11, 2));
	assert.equal(fall.label, "Fall 2026");
	assert.equal(spring.label, "Spring 2026");
	assert.ok(fall.seasonSortKey > spring.seasonSortKey);
	assert.equal(dec.label, "Winter 2027");
	assert.equal(dec.seasonSortKey, "2026-12");
});

test("seasonFromTimestamp Jan and Feb share December winter", () => {
	const jan = seasonFromTimestamp(Date.UTC(2027, 0, 15));
	const feb = seasonFromTimestamp(Date.UTC(2027, 1, 10));
	assert.equal(jan.seasonSortKey, "2026-12");
	assert.equal(feb.seasonSortKey, "2026-12");
	assert.equal(jan.label, "Winter 2027");
	assert.equal(feb.label, "Winter 2027");
	assert.equal(jan.seasonKey, "2026-winter");
});

test("catalogLaunchTime prefers launch", () => {
	assert.equal(catalogLaunchTime(100, 50), 100);
	assert.equal(catalogLaunchTime(undefined, 50), 50);
	assert.equal(catalogLaunchTime(undefined, undefined), 0);
});

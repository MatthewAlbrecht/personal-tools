import assert from "node:assert/strict";
import test from "node:test";
import { duplicateGroupStartsOnPage } from "./library-for-later-migration";

test("counts a duplicate group only on the page containing its first row", () => {
	const legacyRows = [{ _id: "first" }, { _id: "second" }];

	assert.equal(
		duplicateGroupStartsOnPage(legacyRows, [{ _id: "first" }]),
		true,
	);
	assert.equal(
		duplicateGroupStartsOnPage(legacyRows, [{ _id: "second" }]),
		false,
	);
	assert.equal(duplicateGroupStartsOnPage([], [{ _id: "first" }]), false);
});

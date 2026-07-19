import assert from "node:assert/strict";
import test from "node:test";
import { computeAppearsInForLater } from "./albumLibraryForLaterMembership";

test("null/undefined item is not in for later", () => {
	assert.equal(computeAppearsInForLater(null), false);
	assert.equal(computeAppearsInForLater(undefined), false);
});

test("active item without soft-delete flags is in for later", () => {
	assert.equal(
		computeAppearsInForLater({ isActive: true }),
		true,
	);
});

test("inactive item is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({ isActive: false }),
		false,
	);
});

test("marked as single is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({
			isActive: true,
			markedAsSingle: true,
		}),
		false,
	);
});

test("removed from for later is not in for later", () => {
	assert.equal(
		computeAppearsInForLater({
			isActive: true,
			removedFromForLater: true,
		}),
		false,
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ratingBoundsFromSelection } from "./rating-range";

test("Holy Moly maps to 13-15", () => {
	assert.deepEqual(ratingBoundsFromSelection({ tier: "Holy Moly" }), {
		ratingMin: 13,
		ratingMax: 15,
	});
});

test("Holy Moly High maps to 15-15", () => {
	assert.deepEqual(
		ratingBoundsFromSelection({ tier: "Holy Moly", subTier: "High" }),
		{ ratingMin: 15, ratingMax: 15 },
	);
});

test("Really Enjoyed or above uses min 10 and no max", () => {
	assert.deepEqual(ratingBoundsFromSelection({ minTier: "Really Enjoyed" }), {
		ratingMin: 10,
		ratingMax: undefined,
	});
});

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ELO, eloUpdate } from "./duel-elo";

test("DEFAULT_ELO is 1500", () => {
	assert.equal(DEFAULT_ELO, 1500);
});

test("eloUpdate is symmetric — total rating conserved", () => {
	const { a: newA, b: newB } = eloUpdate(1600, 1400, "a");
	assert.equal(newA + newB, 1600 + 1400);

	const reversed = eloUpdate(1600, 1400, "b");
	assert.equal(reversed.a + reversed.b, 1600 + 1400);
});

test("eloUpdate winner gains and loser loses", () => {
	const { a: newA, b: newB } = eloUpdate(1600, 1400, "a");
	assert.ok(newA > 1600);
	assert.ok(newB < 1400);

	const upset = eloUpdate(1600, 1400, "b");
	assert.ok(upset.a < 1600);
	assert.ok(upset.b > 1400);
});

test("eloUpdate equal ratings shifts ±K/2 rounded", () => {
	const { a: newA, b: newB } = eloUpdate(1500, 1500, "a");
	assert.equal(newA, 1516);
	assert.equal(newB, 1484);
});

test("eloUpdate respects custom K", () => {
	const { a: newA, b: newB } = eloUpdate(1500, 1500, "a", 16);
	assert.equal(newA, 1508);
	assert.equal(newB, 1492);
});

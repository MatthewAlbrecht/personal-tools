import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ELO, eloUpdate } from "./duelElo";

test("DEFAULT_ELO is 1500", () => {
	assert.equal(DEFAULT_ELO, 1500);
});

test("eloUpdate winner gains and loser loses", () => {
	const { a: newA, b: newB } = eloUpdate(1600, 1400, "a");
	assert.ok(newA > 1600);
	assert.ok(newB < 1400);
});

test("eloUpdate equal ratings shifts ±K/2 rounded", () => {
	const { a: newA, b: newB } = eloUpdate(1500, 1500, "a");
	assert.equal(newA, 1516);
	assert.equal(newB, 1484);
});

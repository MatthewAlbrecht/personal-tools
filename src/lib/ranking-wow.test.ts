import assert from "node:assert/strict";
import test from "node:test";
import { wowSignals } from "./ranking-wow";

test("wowSignals returns NEW when entering Top 50 from outside", () => {
	const result = wowSignals({
		currentOrdinal: 42,
		priorOrdinal: 58,
		priorInTop50: false,
	});
	assert.deepEqual(result, { kind: "new" });
});

test("wowSignals returns NEW when absent from prior snapshot", () => {
	const result = wowSignals({
		currentOrdinal: 10,
		priorOrdinal: null,
		priorInTop50: false,
	});
	assert.deepEqual(result, { kind: "new" });
});

test("wowSignals returns delta when present in both Top 50", () => {
	const result = wowSignals({
		currentOrdinal: 20,
		priorOrdinal: 25,
		priorInTop50: true,
	});
	assert.deepEqual(result, { kind: "delta", delta: 5 });
});

test("wowSignals positive delta means moved up (lower ordinal)", () => {
	const result = wowSignals({
		currentOrdinal: 5,
		priorOrdinal: 12,
		priorInTop50: true,
	});
	assert.equal(result?.kind, "delta");
	assert.equal(result?.delta, 7);
});

test("wowSignals negative delta means moved down", () => {
	const result = wowSignals({
		currentOrdinal: 30,
		priorOrdinal: 22,
		priorInTop50: true,
	});
	assert.deepEqual(result, { kind: "delta", delta: -8 });
});

test("wowSignals prefers NEW over delta when both could apply", () => {
	const result = wowSignals({
		currentOrdinal: 30,
		priorOrdinal: 55,
		priorInTop50: false,
	});
	assert.deepEqual(result, { kind: "new" });
});

test("wowSignals returns null when ordinals unchanged", () => {
	const result = wowSignals({
		currentOrdinal: 15,
		priorOrdinal: 15,
		priorInTop50: true,
	});
	assert.equal(result, null);
});

test("wowSignals returns null for edge board above Top 50 without prior", () => {
	const result = wowSignals({
		currentOrdinal: 55,
		priorOrdinal: null,
		priorInTop50: false,
	});
	assert.equal(result, null);
});

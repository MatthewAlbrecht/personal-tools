import assert from "node:assert/strict";
import test from "node:test";
import { resolveAddedWindow } from "./added-window";

const now = Date.UTC(2026, 6, 10, 12, 0, 0); // Jul 10 2026

test("calendar month May 2026", () => {
	const range = resolveAddedWindow(
		{ type: "calendar_month", year: 2026, month: 5 },
		now,
	);
	assert.equal(range?.afterMs, Date.UTC(2026, 4, 1, 0, 0, 0));
	assert.equal(range?.beforeMs, Date.UTC(2026, 5, 1, 0, 0, 0));
});

test("relative last 30 days", () => {
	const range = resolveAddedWindow(
		{ type: "relative", unit: "days", amount: 30 },
		now,
	);
	assert.equal(range?.afterMs, now - 30 * 24 * 60 * 60 * 1000);
	assert.equal(range?.beforeMs, undefined);
});

test("absolute passthrough", () => {
	const range = resolveAddedWindow(
		{ type: "absolute", afterMs: 100, beforeMs: 200 },
		now,
	);
	assert.deepEqual(range, { afterMs: 100, beforeMs: 200 });
});

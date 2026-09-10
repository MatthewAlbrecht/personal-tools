import assert from "node:assert/strict";
import test from "node:test";
import { getListenCountBadgeState } from "./album-listen-count-badge";

test("listenCount 0 shows nothing", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 0 }), {
		showFirst: false,
		showCount: false,
	});
});

test("listenCount 1 without isFirstListen shows only 1x", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 1 }), {
		showFirst: false,
		showCount: true,
	});
});

test("isFirstListen with listenCount 1 shows First and 1x", () => {
	assert.deepEqual(
		getListenCountBadgeState({ listenCount: 1, isFirstListen: true }),
		{ showFirst: true, showCount: true },
	);
});

test("isFirstListen with listenCount 5 shows First and Nx", () => {
	assert.deepEqual(
		getListenCountBadgeState({ listenCount: 5, isFirstListen: true }),
		{ showFirst: true, showCount: true },
	);
});

test("listenCount 5 without first listen shows only Nx", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 5 }), {
		showFirst: false,
		showCount: true,
	});
});

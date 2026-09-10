import assert from "node:assert/strict";
import test from "node:test";
import { getListenCountBadgeState } from "./album-listen-count-badge";

test("listenCount 1 without isFirstListen is not First", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 1 }), {
		showFirst: false,
		showCount: false,
	});
});

test("isFirstListen shows First even when listenCount is 1", () => {
	assert.deepEqual(
		getListenCountBadgeState({ listenCount: 1, isFirstListen: true }),
		{ showFirst: true, showCount: false },
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

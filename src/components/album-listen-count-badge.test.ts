import assert from "node:assert/strict";
import test from "node:test";
import { getListenCountBadgeState } from "./album-listen-count-badge";

test("listenCount 0 shows nothing", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 0 }), {
		showCount: false,
	});
});

test("listenCount 1 shows 1x", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 1 }), {
		showCount: true,
	});
});

test("listenCount 5 shows Nx", () => {
	assert.deepEqual(getListenCountBadgeState({ listenCount: 5 }), {
		showCount: true,
	});
});

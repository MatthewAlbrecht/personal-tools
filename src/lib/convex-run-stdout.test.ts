import assert from "node:assert/strict";
import test from "node:test";
import { parseConvexRunStdout } from "./convex-run-stdout";

test("parseConvexRunStdout strips leading Convex WARN lines", () => {
	const stdout = `[CONVEX Q(spotifyListenRepair:listSyncLogsPage)] [WARN] Large size of the function return value (actual: 16642496 bytes, limit: 16777216 bytes).
{
  "continueCursor": "abc",
  "isDone": true,
  "logs": []
}`;
	assert.deepEqual(parseConvexRunStdout(stdout), {
		continueCursor: "abc",
		isDone: true,
		logs: [],
	});
});

test("parseConvexRunStdout parses plain JSON", () => {
	assert.deepEqual(parseConvexRunStdout('{"ok":true}'), { ok: true });
});

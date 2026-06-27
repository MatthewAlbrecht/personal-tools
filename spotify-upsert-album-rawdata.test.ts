import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("upsertAlbum persists rawData when provided on insert and patch", () => {
	const spotifySource = readFileSync(
		join(process.cwd(), "convex", "spotify.ts"),
		"utf8",
	);

	assert.match(
		spotifySource,
		/\.\.\.\(args\.rawData !== undefined \? \{ rawData: args\.rawData \} : \{\}\)/,
	);
	assert.equal(
		(spotifySource.match(
			/\.\.\.\(args\.rawData !== undefined \? \{ rawData: args\.rawData \} : \{\}\)/g,
		) ?? []).length,
		2,
	);
});

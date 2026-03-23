import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("upsertAlbum does not persist album rawData", () => {
	const spotifySource = readFileSync(
		join(process.cwd(), "convex", "spotify.ts"),
		"utf8",
	);

	assert.equal(spotifySource.includes("rawData: args.rawData"), false);
});

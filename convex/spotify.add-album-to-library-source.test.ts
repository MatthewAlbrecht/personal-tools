import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "spotify.ts"),
	"utf8",
);

test("addAlbumToLibrary mutation exists", () => {
	assert.match(source, /export const addAlbumToLibrary = mutation\(/);
});

test("addAlbumToLibrary upserts Spotify album then library projection", () => {
	const mutationIndex = source.indexOf("export const addAlbumToLibrary = mutation(");
	assert.ok(mutationIndex >= 0, "addAlbumToLibrary must exist");

	const handlerSlice = source.slice(mutationIndex, mutationIndex + 2500);
	assert.match(handlerSlice, /await upsertSpotifyAlbumRecord\(/);
	assert.match(handlerSlice, /await upsertAlbumLibraryProjection\(/);
	assert.match(handlerSlice, /alreadyInLibrary/);
	assert.match(handlerSlice, /requireAuth\(ctx\)/);
});

test("addAlbumToLibrary does not touch for-later tables", () => {
	const mutationIndex = source.indexOf("export const addAlbumToLibrary = mutation(");
	const handlerSlice = source.slice(mutationIndex, mutationIndex + 2500);
	assert.doesNotMatch(handlerSlice, /forLaterAlbumItems/);
	assert.doesNotMatch(handlerSlice, /upsertForLaterAlbumItem/);
});

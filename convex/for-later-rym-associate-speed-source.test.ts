import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/forLaterAlbums.ts", "utf8");

test("for-later manual associate uses fast-path RYM filter sync", () => {
	const body = source.slice(
		source.indexOf(
			"export const associateForLaterAlbumWithRymScrape = mutation({",
		),
		source.indexOf("export const patchForLaterRymMatch = mutation({"),
	);

	assert.match(body, /loadTagsForScrape\(ctx,\s*args\.scrapeId\)/);
	assert.match(body, /loadRymGenreParentKeysByChild\(ctx\)/);
	assert.match(body, /syncForLaterRymLinkFilterProjection\(/);
	assert.match(body, /refreshMode:\s*"rym-slice"/);
	assert.doesNotMatch(
		body,
		/syncForLaterItemFilterProjection\(ctx,\s*args\.itemId\)/,
	);
});

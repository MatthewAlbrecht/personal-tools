import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
	"src/app/albums/_components/all-albums-view.tsx",
	"utf8",
);

test("album library rows can copy album and artist names", () => {
	assert.match(source, /type CopiedField = "album" \| "artist"/);
	assert.match(source, /navigator\.clipboard\.writeText\(text\)/);
	assert.match(source, /title="Copy album name"/);
	assert.match(source, /title="Copy artist name"/);
	assert.match(source, /<CopiedIndicator visible=\{copiedField === "album"\}/);
	assert.match(source, /<CopiedIndicator visible=\{copiedField === "artist"\}/);
});

test("library index backfill uses Convex-safe batch sizes", () => {
	const match = source.match(
		/backfillAlbumLibraryItems\(\{\s*userId,\s*batchSize:\s*(\d+)/,
	);
	assert.ok(match, "expected backfillAlbumLibraryItems batchSize call");
	const batchSize = Number(match[1]);
	assert.ok(
		batchSize > 0 && batchSize <= 100,
		`library index batchSize must be <= 100 to stay under Convex per-mutation read limits, got ${batchSize}`,
	);
});

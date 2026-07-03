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

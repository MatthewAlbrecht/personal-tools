import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(
	"src/app/music-funnel/_components/music-funnel-settings-card.tsx",
	"utf8",
);
const sourcesSource = readFileSync(
	"src/app/music-funnel/_components/music-funnel-sources-card.tsx",
	"utf8",
);

test("configuration sections do not nest card surfaces inside the drawer", () => {
	assert.doesNotMatch(settingsSource, /<Card(?:\s|>)/);
	assert.doesNotMatch(sourcesSource, /<Card(?:\s|>)/);
});

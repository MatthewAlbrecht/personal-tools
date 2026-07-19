import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectionSource = readFileSync(
	join(process.cwd(), "convex", "_utils", "albumLibraryProjection.ts"),
	"utf8",
);
const schemaSource = readFileSync(
	join(process.cwd(), "convex", "schema.ts"),
	"utf8",
);

test("schema defines appearsInForLater on albumLibraryItems", () => {
	// Optional until prod backfill completes; see comment near the field in schema.ts.
	assert.match(
		schemaSource,
		/appearsInForLater:\s*v\.optional\(v\.boolean\(\)\)/,
	);
	assert.match(
		schemaSource,
		/by_userId_appearsInForLater_createdAt/,
	);
});

test("projection build sets appearsInForLater via membership helper", () => {
	assert.match(projectionSource, /computeAppearsInForLater/);
	assert.match(projectionSource, /appearsInForLater:/);
	assert.match(projectionSource, /forLaterAlbumItems/);
});

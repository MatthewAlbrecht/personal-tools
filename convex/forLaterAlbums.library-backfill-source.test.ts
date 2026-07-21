import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);
const script = readFileSync(
	join(process.cwd(), "scripts", "backfill-library-for-later.mjs"),
	"utf8",
);

function sliceExport(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `${exportName} must exist`);
	const next = source.indexOf("\nexport const ", start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

test("backfill batch paginates legacy rows and reconciles duplicate albums", () => {
	const body = sliceExport("backfillLibraryForLaterBatch");

	assert.match(
		body,
		/^export const backfillLibraryForLaterBatch = internalMutation/,
	);
	assert.doesNotMatch(
		body,
		/^export const backfillLibraryForLaterBatch = mutation/,
	);
	assert.match(body, /withIndex\("by_userId"/);
	assert.match(body, /\.paginate\(/);
	assert.match(body, /new Set/);
	assert.match(body, /withIndex\("by_userId_albumId"/);
	assert.match(body, /\.collect\(\)/);
	assert.match(body, /legacyRowsToLibraryForLater/);
	assert.match(body, /upsertAlbumLibraryProjection/);
	assert.match(body, /forLater:/);
	assert.match(body, /isActiveForLater:/);
	assert.match(body, /appearsInForLater:/);
	assert.match(body, /forLaterLastSeenAt:/);
	assert.match(body, /processed:/);
	assert.match(body, /isDone:/);
	assert.match(body, /continueCursor:/);
});

test("verification is cursor-based and returns parity counts", () => {
	const body = sliceExport("verifyLibraryForLaterMigration");

	assert.match(
		body,
		/^export const verifyLibraryForLaterMigration = internalQuery/,
	);
	assert.doesNotMatch(
		body,
		/^export const verifyLibraryForLaterMigration = query/,
	);
	assert.match(body, /\.paginate\(/);
	assert.match(body, /legacyActive:/);
	assert.match(body, /libraryActive:/);
	assert.match(body, /missingLibraryState:/);
	assert.match(body, /mismatchedActivity:/);
	assert.match(body, /isDone:/);
	assert.match(body, /continueCursor:/);
	assert.match(body, /deriveIsActiveForLater/);
});

test("operator script invokes only internal functions through Convex CLI", () => {
	assert.match(
		script,
		/internal\.forLaterAlbums\.backfillLibraryForLaterBatch/,
	);
	assert.match(
		script,
		/internal\.forLaterAlbums\.verifyLibraryForLaterMigration/,
	);
	assert.match(script, /"convex", "run"/);
	assert.doesNotMatch(script, /ConvexHttpClient/);
	assert.doesNotMatch(script, /makeFunctionReference/);
});

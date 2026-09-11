import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "albumDuels.ts"),
	"utf8",
);

function sliceExport(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `${exportName} must exist`);
	const next = source.indexOf("\nexport const ", start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

test("pick must not patch userAlbums rating or position", () => {
	const body = sliceExport("pick");
	assert.match(body, /^export const pick = mutation/);
	assert.doesNotMatch(body, /db\.patch\(\s*[a-zA-Z.]+\.userAlbum\._id/);
	assert.doesNotMatch(body, /db\.patch\(\s*args\.(a|b|winner)UserAlbumId/);
	assert.doesNotMatch(body, /rating:\s*/);
	assert.doesNotMatch(body, /position:\s*/);
	assert.match(body, /albumDuelScores|aScore\._id|bScore\._id/);
});

test("getPair must not contain Date.now", () => {
	const body = sliceExport("getPair");
	assert.match(body, /^export const getPair = query/);
	assert.doesNotMatch(body, /Date\.now/);
	assert.match(body, /seed/);
});

test("pick verifies ownership and winner", () => {
	const body = sliceExport("pick");
	assert.match(body, /Winner must be one of the duel candidates/);
	assert.match(body, /loadRatedYearAlbumOrThrow/);
	assert.match(source, /Unauthorized: album does not belong to user/);
});

test("undoLast sets undoneAt", () => {
	const body = sliceExport("undoLast");
	assert.match(body, /^export const undoLast = mutation/);
	assert.match(body, /undoneAt:\s*now/);
	assert.match(body, /undone:\s*false/);
	assert.match(body, /aBefore/);
	assert.match(body, /bBefore/);
});

test("undoLast paginates through duels instead of take(50)", () => {
	const body = sliceExport("undoLast");
	assert.doesNotMatch(body, /\.take\(50\)/);
	assert.match(body, /\.paginate\(/);
	assert.match(body, /continueCursor/);
	assert.match(body, /isDone/);
});

test("listDuelTop uses rating prior for unscored albums", () => {
	const body = sliceExport("listDuelTop");
	assert.match(body, /seedEloFromRating\(row\.rating\)/);
	assert.doesNotMatch(body, /score\?\.elo \?\? DEFAULT_ELO/);
});

test("getPair does not write duel scores", () => {
	const body = sliceExport("getPair");
	assert.doesNotMatch(body, /db\.insert/);
	assert.doesNotMatch(body, /db\.patch/);
	assert.doesNotMatch(body, /getOrCreateScore/);
});

#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod");
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--prod");
const userId = positionalArgs[0] ?? process.env.USER_ID;
const limitValue = Number(process.env.BACKFILL_LIMIT ?? "25");
const limit = Number.isFinite(limitValue) ? limitValue : 25;

if (!userId) {
	console.error("Usage: pnpm backfill:library-for-later -- <userId> [--prod]");
	process.exit(1);
}

function runFunction(functionName, payload) {
	const args = ["exec", "convex", "run"];
	if (prod) {
		args.push("--prod");
	}
	args.push(functionName, JSON.stringify(payload));
	const stdout = execFileSync("pnpm", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();
	return JSON.parse(stdout);
}

let cursor = null;
let processed = 0;
do {
	const result = runFunction(
		"internal.forLaterAlbums.backfillLibraryForLaterBatch",
		{
			userId,
			cursor,
			limit,
		},
	);
	processed += result.processed;
	cursor = result.continueCursor;
} while (cursor !== null);

const verification = {
	legacyActive: 0,
	libraryActive: 0,
	missingLibraryState: 0,
	mismatchedActivity: 0,
};
cursor = null;
do {
	const result = runFunction(
		"internal.forLaterAlbums.verifyLibraryForLaterMigration",
		{
			userId,
			cursor,
			limit,
		},
	);
	verification.legacyActive += result.legacyActive;
	verification.libraryActive += result.libraryActive;
	verification.missingLibraryState += result.missingLibraryState;
	verification.mismatchedActivity += result.mismatchedActivity;
	cursor = result.continueCursor;
} while (cursor !== null);

console.log(`Backfilled ${processed} album batches.`);
console.log(JSON.stringify(verification, null, 2));

if (
	verification.legacyActive !== verification.libraryActive ||
	verification.missingLibraryState !== 0 ||
	verification.mismatchedActivity !== 0
) {
	process.exitCode = 1;
}

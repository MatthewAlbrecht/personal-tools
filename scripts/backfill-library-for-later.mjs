#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

function loadEnvFile() {
	try {
		const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
		for (const line of envFile.split("\n")) {
			const match = line.match(/^([^#=]+)=(.*)$/);
			if (!match?.[1] || match[2] === undefined) {
				continue;
			}
			let value = match[2].trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			process.env[match[1].trim()] ??= value;
		}
	} catch {
		// Environment variables may already be supplied by the caller.
	}
}

loadEnvFile();

const userId = process.argv[2] ?? process.env.USER_ID;
const convexUrl = process.env.CONVEX_URL;
const limitValue = Number(process.env.BACKFILL_LIMIT ?? "25");
const limit = Number.isFinite(limitValue) ? limitValue : 25;

if (!convexUrl || !userId) {
	console.error(
		"Usage: CONVEX_URL=<url> pnpm backfill:library-for-later -- <userId>",
	);
	process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const backfillLibraryForLaterBatch = makeFunctionReference(
	"forLaterAlbums:backfillLibraryForLaterBatch",
);
const verifyLibraryForLaterMigration = makeFunctionReference(
	"forLaterAlbums:verifyLibraryForLaterMigration",
);

let cursor = null;
let processed = 0;
do {
	const result = await client.mutation(backfillLibraryForLaterBatch, {
		userId,
		cursor,
		limit,
	});
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
	const result = await client.query(verifyLibraryForLaterMigration, {
		userId,
		cursor,
		limit,
	});
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

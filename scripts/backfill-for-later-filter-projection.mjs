#!/usr/bin/env node
/**
 * Runs internal.forLaterAlbums.backfillFilterProjectionBatch until isDone.
 *
 * Usage (dev deployment): pnpm backfill:for-later-projection
 * Production:              pnpm backfill:for-later-projection -- --prod
 *
 * Optional env: BACKFILL_LIMIT (default 100, max 100 enforced server-side).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod");
const limit = Number(process.env.BACKFILL_LIMIT ?? "100");

/** @param {string | null} cursor */
function runBatch(cursor) {
	const payload = JSON.stringify({
		limit: Number.isFinite(limit) ? limit : 100,
		cursor,
	});
	const args = ["exec", "convex", "run"];
	if (prod) {
		args.push("--prod");
	}
	args.push(
		"internal.forLaterAlbums.backfillFilterProjectionBatch",
		payload,
	);

	const stdout = execFileSync("pnpm", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();

	return JSON.parse(stdout);
}

let cursor = null;
let batches = 0;
let total = 0;
console.log(
	prod
		? "Backfill filter projections (--prod)…"
		: "Backfill filter projections (dev)…",
);

for (;;) {
	batches += 1;
	const row = runBatch(cursor);
	total += row.processed;
	console.log(
		`  batch ${batches}: processed ${row.processed} (total ${total}), isDone=${row.isDone}`,
	);
	if (row.isDone) {
		console.log("Done.");
		break;
	}
	cursor = row.continueCursor;
}

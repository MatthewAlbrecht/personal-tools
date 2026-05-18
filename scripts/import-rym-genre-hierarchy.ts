#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	flattenRymGenreHierarchy,
	parseRymGenreHierarchyHtml,
} from "../convex/_utils/rymGenreHierarchy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const prod = args.includes("--prod");
const inputArg = args.find((arg) => arg !== "--prod") ?? "genresfromrym.hml";
const inputPath = resolve(root, inputArg);
const BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function runConvex(functionName: string, payload: unknown): unknown {
	const commandArgs = ["exec", "convex", "run"];
	if (prod) {
		commandArgs.push("--prod");
	}
	commandArgs.push(functionName, JSON.stringify(payload));

	const stdout = execFileSync("pnpm", commandArgs, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();

	return stdout ? JSON.parse(stdout) : null;
}

const html = readFileSync(inputPath, "utf8");
const parsed = flattenRymGenreHierarchy(parseRymGenreHierarchyHtml(html));

console.log(
	`Parsed ${parsed.genres.length} unique genres and ${parsed.relationships.length} parent relationships from ${relative(root, inputPath)}`,
);

let totalDeleted = 0;
for (;;) {
	const clearResult = runConvex(
		"internal.rymGenreHierarchy.clearRateYourMusicGenreRelationships",
		{ limit: BATCH_SIZE },
	) as { deleted: number };
	totalDeleted += clearResult.deleted;
	if (clearResult.deleted === 0) {
		break;
	}
	console.log(`Cleared ${totalDeleted} existing parent relationships`);
}

let totalGenres = 0;
for (const batch of chunk(parsed.genres, BATCH_SIZE)) {
	const result = runConvex(
		"internal.rymGenreHierarchy.upsertRateYourMusicGenreBatch",
		{ genres: batch },
	) as { upserted: number };
	totalGenres += result.upserted;
	console.log(`Upserted ${totalGenres}/${parsed.genres.length} genres`);
}

let totalRelationships = 0;
for (const batch of chunk(parsed.relationships, BATCH_SIZE)) {
	const result = runConvex(
		"internal.rymGenreHierarchy.insertRateYourMusicGenreRelationshipBatch",
		{ relationships: batch },
	) as { inserted: number };
	totalRelationships += result.inserted;
	console.log(
		`Inserted ${totalRelationships}/${parsed.relationships.length} parent relationships`,
	);
}

console.log("Done.");

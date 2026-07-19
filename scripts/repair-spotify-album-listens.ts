#!/usr/bin/env tsx
/**
 * Preview-first repair CLI for missed Spotify album listens.
 *
 * Rebuilds album listen candidates from `spotifySyncLogs`, dedupes against
 * `userAlbumListens` the user already has, and prints a table + a
 * deterministic preview hash. Never mutates anything unless `--apply` is
 * passed together with a `--preview-hash` that matches the freshly
 * recomputed hash, plus `--all` or one or more `--id`.
 *
 * Usage:
 *   pnpm repair:spotify-album-listens -- --user moose
 *   pnpm repair:spotify-album-listens -- --user moose --prod
 *   pnpm repair:spotify-album-listens -- --user moose --prod --apply --preview-hash <hash> --all
 *   pnpm repair:spotify-album-listens -- --user moose --prod --apply --preview-hash <hash> --id <candidateId>
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexRunStdout } from "../src/lib/convex-run-stdout";
import {
	type ExistingListenInterval,
	type RepairCandidate,
	buildRepairCandidates,
	computePreviewHash,
	parseRecentlyPlayedRaw,
} from "../src/lib/spotify-listen-repair";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Flags = {
	user: string;
	prod: boolean;
	apply: boolean;
	previewHash?: string;
	all: boolean;
	ids: string[];
};

function parseFlags(argv: string[]): Flags {
	let user: string | undefined;
	let prod = false;
	let apply = false;
	let previewHash: string | undefined;
	let all = false;
	const ids: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "--":
				break;
			case "--user":
				user = argv[++i];
				break;
			case "--prod":
				prod = true;
				break;
			case "--apply":
				apply = true;
				break;
			case "--preview-hash":
				previewHash = argv[++i];
				break;
			case "--all":
				all = true;
				break;
			case "--id":
				{
					const id = argv[++i];
					if (id) ids.push(id);
				}
				break;
			default:
				console.error(`Unknown flag: ${arg}`);
				process.exit(1);
		}
	}

	if (!user) {
		console.error("Missing required flag: --user <userId>");
		process.exit(1);
	}

	return { user, prod, apply, previewHash, all, ids };
}

/**
 * Runs `pnpm exec convex run ...` and returns its parsed JSON stdout.
 *
 * Large results (raw sync log payloads can be several MB) get silently
 * truncated when captured through a plain Node `pipe` stdio in this
 * environment, so we redirect the child's stdout straight to a temp file
 * and read it back - the same thing a shell `> file` redirect does, which
 * doesn't exhibit the truncation.
 */
function runConvex(
	functionName: string,
	payload: unknown,
	prod: boolean,
): unknown {
	const commandArgs = ["exec", "convex", "run"];
	if (prod) {
		commandArgs.push("--prod");
	}
	commandArgs.push(functionName, JSON.stringify(payload));

	const tmpDir = mkdtempSync(join(tmpdir(), "convex-run-"));
	const outPath = join(tmpDir, "stdout.json");

	try {
		execFileSync("pnpm", commandArgs, {
			cwd: root,
			stdio: ["ignore", openSync(outPath, "w"), "inherit"],
		});

		const stdout = readFileSync(outPath, "utf8");
		return parseConvexRunStdout(stdout);
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

type SyncLog = { id: string; rawResponse: string; createdAt: number };

function fetchAllSyncLogs(userId: string, prod: boolean): SyncLog[] {
	const logs: SyncLog[] = [];
	let cursor: string | undefined;

	for (;;) {
		// Raw recently-played payloads are ~200KB each; keep pages small so
		// Convex stays under the 16MB return limit and avoids CLI WARN banners.
		const page = runConvex(
			"internal.spotifyListenRepair.listSyncLogsPage",
			{ userId, cursor, numItems: 5 },
			prod,
		) as { logs: SyncLog[]; continueCursor: string; isDone: boolean };

		logs.push(...page.logs);
		if (page.isDone) break;
		cursor = page.continueCursor;
	}

	return logs;
}

function fetchExistingListens(
	userId: string,
	prod: boolean,
): ExistingListenInterval[] {
	return runConvex(
		"internal.spotifyListenRepair.listExistingListensForUser",
		{ userId },
		prod,
	) as ExistingListenInterval[];
}

function fetchAlbumMetadata(
	spotifyAlbumIds: string[],
	prod: boolean,
): Map<string, { totalTracks: number; name: string }> {
	const rows = runConvex(
		"internal.spotifyListenRepair.resolveAlbumDbIds",
		{ spotifyAlbumIds },
		prod,
	) as Array<{
		spotifyAlbumId: string;
		dbId: string;
		totalTracks: number;
		name: string;
	}>;

	const map = new Map<string, { totalTracks: number; name: string }>();
	for (const row of rows) {
		map.set(row.spotifyAlbumId, {
			totalTracks: row.totalTracks,
			name: row.name,
		});
	}
	return map;
}

function formatTimestamp(ms: number): string {
	return new Date(ms).toISOString();
}

function printCandidatesTable(candidates: RepairCandidate[]): void {
	if (candidates.length === 0) {
		console.log("No repair candidates found.");
		return;
	}

	console.log(`Found ${candidates.length} repair candidate(s):\n`);
	for (const candidate of candidates) {
		console.log(`- id:        ${candidate.id}`);
		console.log(
			`  album:     ${candidate.albumName ?? "(unknown)"} (${candidate.spotifyAlbumId})`,
		);
		console.log(
			`  window:    ${formatTimestamp(candidate.earliestPlayedAt)} -> ${formatTimestamp(candidate.latestPlayedAt)}`,
		);
		console.log(`  coverage:  ${(candidate.coverage * 100).toFixed(0)}%`);
		console.log(`  ascending: ${(candidate.ascendingRatio * 100).toFixed(0)}%`);
		console.log(`  evidence:  ${candidate.evidenceLogIds.length} sync log(s)`);
		console.log("");
	}
}

async function main(): Promise<void> {
	const flags = parseFlags(process.argv.slice(2));

	console.log(
		`Rebuilding album listen candidates for user "${flags.user}"${flags.prod ? " (--prod)" : " (dev)"}...`,
	);

	const rawLogs = fetchAllSyncLogs(flags.user, flags.prod);
	console.log(`Loaded ${rawLogs.length} sync log(s).`);

	const existingListens = fetchExistingListens(flags.user, flags.prod);
	console.log(`Loaded ${existingListens.length} existing listen(s).`);

	const referencedAlbumIds = new Set<string>();
	for (const log of rawLogs) {
		for (const play of parseRecentlyPlayedRaw(log.rawResponse)) {
			referencedAlbumIds.add(play.albumId);
		}
	}

	const albumMetadata = fetchAlbumMetadata([...referencedAlbumIds], flags.prod);
	const albumTotalTracks = new Map<string, number>();
	for (const [spotifyAlbumId, meta] of albumMetadata) {
		albumTotalTracks.set(spotifyAlbumId, meta.totalTracks);
	}

	const candidates = buildRepairCandidates({
		userId: flags.user,
		logs: rawLogs,
		albumTotalTracks,
		existingListens,
	});

	printCandidatesTable(candidates);

	const previewHash = computePreviewHash(candidates);
	console.log(`previewHash=${previewHash}`);

	if (!flags.apply) {
		console.log("\nDry run only (pass --apply to write). Exiting.");
		return;
	}

	if (!flags.previewHash) {
		console.error("\n--apply requires --preview-hash <hash>");
		process.exit(1);
	}

	if (flags.previewHash !== previewHash) {
		console.error(
			"\nRefusing to apply: --preview-hash does not match the freshly recomputed hash.\n" +
				"The underlying sync logs or existing listens likely changed since preview - re-run without --apply to get a fresh hash.",
		);
		process.exit(1);
	}

	if (!flags.all && flags.ids.length === 0) {
		console.error(
			"\n--apply requires --all or at least one --id <candidateId>",
		);
		process.exit(1);
	}

	let candidatesToApply = candidates;
	if (!flags.all) {
		const candidateById = new Map(candidates.map((c) => [c.id, c]));
		const missingIds = flags.ids.filter((id) => !candidateById.has(id));
		if (missingIds.length > 0) {
			console.error(
				`\nRefusing to apply: unknown --id value(s) not present in the current candidate set: ${missingIds.join(", ")}`,
			);
			process.exit(1);
		}
		candidatesToApply = flags.ids.map((id) => {
			const candidate = candidateById.get(id);
			if (!candidate) throw new Error(`unreachable: missing candidate ${id}`);
			return candidate;
		});
	}

	console.log(`\nApplying ${candidatesToApply.length} candidate(s)...`);

	const result = runConvex(
		"internal.spotifyListenRepair.applyRepairCandidates",
		{
			userId: flags.user,
			previewHash,
			candidates: candidatesToApply.map((c) => ({
				id: c.id,
				spotifyAlbumId: c.spotifyAlbumId,
				trackIds: c.trackIds,
				earliestPlayedAt: c.earliestPlayedAt,
				latestPlayedAt: c.latestPlayedAt,
			})),
		},
		flags.prod,
	) as { applied: number; skipped: number };

	console.log(
		`Applied: ${result.applied}, skipped (overlap/missing): ${result.skipped}`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

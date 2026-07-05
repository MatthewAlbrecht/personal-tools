#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function loadEnvFile() {
	try {
		const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
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
			process.env[match[1].trim()] = value;
		}
	} catch {
		console.warn("Could not load .env.local");
	}
}

function parseJsonlFromZip(zipPath, tableName) {
	const text = execSync(`unzip -p "${zipPath}" "${tableName}/documents.jsonl"`, {
		encoding: "utf-8",
	});
	return text
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function main() {
	loadEnvFile();

	const userId = process.argv[2] ?? "moose";
	if (!process.env.NEXT_PUBLIC_CONVEX_PROD_URL) {
		console.error("Missing NEXT_PUBLIC_CONVEX_PROD_URL in .env.local");
		process.exit(1);
	}

	const zipPath = join(tmpdir(), "personal-tools-prod-export.zip");
	const existingZip = "/tmp/personal-tools-prod-export.zip";
	try {
		readFileSync(existingZip);
		console.log(`Using existing prod export at ${existingZip}`);
		execSync(`cp "${existingZip}" "${zipPath}"`);
	} catch {
		console.log("Exporting prod Convex snapshot...");
		execSync(`npx convex export --prod --path "${zipPath}"`, {
			stdio: "inherit",
			cwd: process.cwd(),
		});
	}

	const tables = [
		"musicFunnelSettings",
		"musicFunnelSources",
		"musicFunnelRuns",
		"musicFunnelSourceRuns",
		"musicFunnelTrackEncounters",
		"musicFunnelPlaylistWrites",
	];

	const bundle = {
		userId,
		settings: null,
		sources: [],
		runs: [],
		sourceRuns: [],
		encounters: [],
		playlistWrites: [],
	};

	for (const table of tables) {
		const rows = parseJsonlFromZip(zipPath, table).filter(
			(row) => row.userId === userId,
		);
		if (table === "musicFunnelSettings") {
			bundle.settings = rows[0] ?? null;
		} else if (table === "musicFunnelSources") {
			bundle.sources = rows;
		} else if (table === "musicFunnelRuns") {
			bundle.runs = rows;
		} else if (table === "musicFunnelSourceRuns") {
			bundle.sourceRuns = rows;
		} else if (table === "musicFunnelTrackEncounters") {
			bundle.encounters = rows;
		} else if (table === "musicFunnelPlaylistWrites") {
			bundle.playlistWrites = rows;
		}
		console.log(`${table}: ${rows.length} rows for ${userId}`);
	}

	const argsPath = join(tmpdir(), "music-funnel-import-args.json");
	writeFileSync(argsPath, JSON.stringify(bundle));

	console.log("\nImporting into dev Convex...");
	const result = execSync(
		`npx convex run migrations/importMusicFunnelFromProd:importUserBundle "$(cat '${argsPath}')" --push`,
		{ encoding: "utf-8", cwd: process.cwd() },
	);
	console.log("Import result:", result.trim());
}

main();

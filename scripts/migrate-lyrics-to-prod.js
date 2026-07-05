#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Load environment variables from .env.local
try {
	const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
	for (const line of envFile.split("\n")) {
		const match = line.match(/^([^#=]+)=(.*)$/);
		if (match?.[1] && match[2] !== undefined) {
			const key = match[1];
			let value = match[2].trim();
			// Remove surrounding quotes if present
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			process.env[key.trim()] = value;
		}
	}
} catch (error) {
	console.warn("Could not load .env.local, using existing env vars");
}

const devUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const prodUrl = process.env.NEXT_PUBLIC_CONVEX_PROD_URL;

if (!devUrl || !prodUrl) {
	console.error(
		"Missing NEXT_PUBLIC_CONVEX_URL or NEXT_PUBLIC_CONVEX_PROD_URL",
	);
	process.exit(1);
}

const devClient = new ConvexHttpClient(devUrl);
const prodClient = new ConvexHttpClient(prodUrl);

async function migrate() {
	console.log("Fetching album lyrics from dev...");
	const albums = await devClient.query(api.geniusAlbums.listAlbumsForSync);

	let albumsSynced = 0;
	let failed = 0;

	for (const { album, songs } of albums) {
		try {
			console.log(`\n📝 Migrating: ${album.artistName} - ${album.albumTitle}`);

			const prodAlbumId = await prodClient.mutation(
				api.geniusAlbums.upsertAlbumForSync,
				album,
			);

			await prodClient.mutation(api.geniusAlbums.replaceSongsForSync, {
				albumId: prodAlbumId,
				songs,
			});

			console.log(`  Synced ${songs.length} songs`);
			albumsSynced++;
		} catch (error) {
			failed++;
			console.error(
				`  Failed to migrate ${album.artistName} - ${album.albumTitle}:`,
				error,
			);
		}
	}

	console.log("\n✅ Migration complete!");
	console.log(`   Synced: ${albumsSynced} albums`);
	if (failed > 0) {
		console.log(`   Failed: ${failed} albums`);
	}
}

migrate().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});

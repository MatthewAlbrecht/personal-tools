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
	console.log("Fetching existing albums from prod...");
	const prodAlbums = await prodClient.query(api.geniusAlbums.listRecent, {
		limit: 1000,
	});
	const prodSlugs = new Set(prodAlbums.map((a) => a.albumSlug));
	console.log(`Found ${prodAlbums.length} albums already in prod\n`);

	console.log("Fetching albums from dev...");
	const devAlbums = await devClient.query(api.geniusAlbums.listRecent, {
		limit: 1000,
	});

	console.log(`Found ${devAlbums.length} albums in dev\n`);

	let skipped = 0;
	let created = 0;

	for (const album of devAlbums) {
		// Check if album already exists in prod
		if (prodSlugs.has(album.albumSlug)) {
			console.log(
				`⏭️  Skipping: ${album.artistName} - ${album.albumTitle} (already exists)`,
			);
			skipped++;
			continue;
		}

		console.log(`\n📝 Migrating: ${album.artistName} - ${album.albumTitle}`);

		// Fetch songs for this album from dev
		const devSongs = await devClient.query(api.geniusAlbums.getAlbumBySlug, {
			slug: album.albumSlug,
		});

		if (!devSongs?.songs) {
			console.log(`  No songs found for ${album.albumSlug}, skipping`);
			continue;
		}

		// Create album in prod
		const prodAlbumId = await prodClient.mutation(
			api.geniusAlbums.createAlbum,
			{
				albumTitle: album.albumTitle,
				artistName: album.artistName,
				albumSlug: album.albumSlug,
				geniusAlbumUrl: album.geniusAlbumUrl,
				totalSongs: album.totalSongs,
			},
		);

		console.log(`  Created album in prod: ${prodAlbumId}`);

		// Create songs in prod
		for (const song of devSongs.songs) {
			await prodClient.mutation(api.geniusAlbums.createSong, {
				albumId: prodAlbumId,
				songTitle: song.songTitle,
				geniusSongUrl: song.geniusSongUrl,
				trackNumber: song.trackNumber,
				lyrics: song.lyrics,
				about: song.about,
			});
		}

		console.log(`  Created ${devSongs.songs.length} songs`);
		created++;
	}

	console.log("\n✅ Migration complete!");
	console.log(`   Created: ${created} albums`);
	console.log("\n   Skipped: ${skipped} albums (already existed)");
}

migrate().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});

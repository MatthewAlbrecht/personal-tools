/**
 * Backfill script to populate spotifyArtists table from canonical tracks.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-artists.ts
 *
 * Requires SPOTIFY_SYNC_USER_ID to be set in .env for auth token refresh.
 */

import "dotenv/config";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type SpotifyArtist = {
	id: string;
	name: string;
	images: Array<{ url: string; height: number; width: number }>;
	genres: string[];
	popularity: number;
};

async function getValidAccessToken(
	convex: ConvexHttpClient,
	userId: string,
): Promise<string> {
	const connection = await convex.query(api.spotify.getConnection, { userId });

	if (!connection) {
		throw new Error(`No Spotify connection found for user: ${userId}`);
	}

	const now = Date.now();
	const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

	if (!isExpired) {
		return connection.accessToken;
	}

	// Refresh token
	console.log("🔑 Refreshing access token...");
	const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${Buffer.from(
				`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
			).toString("base64")}`,
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: connection.refreshToken,
		}),
	});

	if (!tokenResponse.ok) {
		throw new Error(`Failed to refresh token: ${await tokenResponse.text()}`);
	}

	const tokens = await tokenResponse.json();

	await convex.mutation(api.spotify.updateTokens, {
		userId,
		accessToken: tokens.access_token,
		expiresIn: tokens.expires_in,
		refreshToken: tokens.refresh_token,
	});

	return tokens.access_token;
}

async function fetchArtistsBatch(
	accessToken: string,
	artistIds: string[],
): Promise<SpotifyArtist[]> {
	const response = await fetch(
		`${SPOTIFY_API_BASE}/artists?ids=${artistIds.join(",")}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);

	if (!response.ok) {
		throw new Error(`Spotify API error: ${await response.text()}`);
	}

	const data = await response.json();
	return data.artists.filter((a: SpotifyArtist | null) => a !== null);
}

async function main() {
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	const userId = process.env.SPOTIFY_SYNC_USER_ID;

	if (!convexUrl) {
		throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
	}
	if (!userId) {
		throw new Error("SPOTIFY_SYNC_USER_ID not set");
	}

	const convex = new ConvexHttpClient(convexUrl);

	console.log("🎵 Backfilling artists from canonical tracks...\n");

	// Get access token
	const accessToken = await getValidAccessToken(convex, userId);

	// Get all canonical tracks
	console.log("📚 Fetching canonical tracks...");
	const tracks = await convex.query(api.spotify.getAllCanonicalTracks, {});
	console.log(`   Found ${tracks.length} canonical tracks\n`);

	// Extract unique artist IDs from rawData
	const artistMap = new Map<string, { id: string; name: string }>();

	for (const track of tracks) {
		if (!track.rawData) continue;

		try {
			const data = JSON.parse(track.rawData);
			if (data.artists && Array.isArray(data.artists)) {
				for (const artist of data.artists) {
					if (artist.id && artist.name && !artistMap.has(artist.id)) {
						artistMap.set(artist.id, { id: artist.id, name: artist.name });
					}
				}
			}
		} catch {
			// Skip tracks with invalid rawData
		}
	}

	console.log(`🎤 Found ${artistMap.size} unique artists in track data\n`);

	// Check which artists already exist
	console.log("🔍 Checking existing artists...");
	const artistIds = Array.from(artistMap.keys());
	const existingArtists = new Set<string>();

	// Check in batches
	for (let i = 0; i < artistIds.length; i += 50) {
		const batch = artistIds.slice(i, i + 50);
		for (const id of batch) {
			const existing = await convex.query(api.rooleases.getArtistBySpotifyId, {
				spotifyArtistId: id,
			});
			if (existing) {
				existingArtists.add(id);
			}
		}
	}

	const missingArtistIds = artistIds.filter((id) => !existingArtists.has(id));
	console.log(`   ${existingArtists.size} already exist`);
	console.log(`   ${missingArtistIds.length} need to be fetched\n`);

	if (missingArtistIds.length === 0) {
		console.log("✅ All artists already exist. Nothing to do.");
		return;
	}

	// Fetch missing artists from Spotify in batches of 50
	console.log("📡 Fetching artist details from Spotify...");
	const allArtistDetails: SpotifyArtist[] = [];

	for (let i = 0; i < missingArtistIds.length; i += 50) {
		const batch = missingArtistIds.slice(i, i + 50);
		console.log(
			`   Batch ${Math.floor(i / 50) + 1}/${Math.ceil(missingArtistIds.length / 50)}: ${batch.length} artists`,
		);

		try {
			const artists = await fetchArtistsBatch(accessToken, batch);
			allArtistDetails.push(...artists);
		} catch (error) {
			console.error(`   Error fetching batch: ${error}`);
		}

		// Small delay to avoid rate limiting
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	console.log(`\n💾 Saving ${allArtistDetails.length} artists to database...`);

	// Save to database in batches
	const artistsToSave = allArtistDetails.map((artist) => ({
		spotifyArtistId: artist.id,
		name: artist.name,
		imageUrl: artist.images[0]?.url,
		genres: artist.genres,
		popularity: artist.popularity,
		rawData: JSON.stringify(artist),
	}));

	// Batch insert (Convex mutation handles individual upserts)
	const batchSize = 25;
	let saved = 0;

	for (let i = 0; i < artistsToSave.length; i += batchSize) {
		const batch = artistsToSave.slice(i, i + batchSize);
		await convex.mutation(api.rooleases.bulkUpsertArtists, { artists: batch });
		saved += batch.length;
		console.log(`   Saved ${saved}/${artistsToSave.length}`);
	}

	console.log(`\n✅ Done! Added ${allArtistDetails.length} new artists.`);
}

main().catch((error) => {
	console.error("❌ Backfill failed:", error);
	process.exit(1);
});

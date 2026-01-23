import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { env } from "~/env.js";
import { getAllPlaylistTracks, getArtists } from "~/lib/spotify";

type SeedArtistsRequest = {
	playlistId: string;
	yearId: string;
	accessToken: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as SeedArtistsRequest;
		const { playlistId, yearId, accessToken } = body;

		if (!playlistId || !yearId || !accessToken) {
			return NextResponse.json(
				{ error: "Missing required fields: playlistId, yearId, accessToken" },
				{ status: 400 },
			);
		}

		console.log("[API] Fetching playlist tracks for seeding:", playlistId);

		// Fetch all tracks from the playlist
		const tracks = await getAllPlaylistTracks(accessToken, playlistId);
		console.log("[API] Fetched", tracks.length, "tracks from playlist");

		// Extract unique primary artist IDs (first artist on each track)
		const artistIds = new Set<string>();
		for (const track of tracks) {
			const primaryArtist = track.artists[0];
			if (primaryArtist) {
				artistIds.add(primaryArtist.id);
			}
		}

		const uniqueArtistIds = Array.from(artistIds);
		console.log("[API] Found", uniqueArtistIds.length, "unique artists");

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Check which artists already exist in our database
		const existingArtistIds = await convex.query(
			api.rooleases.getExistingArtistIds,
			{ spotifyArtistIds: uniqueArtistIds },
		);
		const existingSet = new Set(existingArtistIds);
		const missingArtistIds = uniqueArtistIds.filter((id) => !existingSet.has(id));

		console.log(
			"[API]",
			existingArtistIds.length,
			"already exist,",
			missingArtistIds.length,
			"need to be fetched",
		);

		// Only fetch details for missing artists
		let upsertResult = { added: 0, updated: 0 };
		if (missingArtistIds.length > 0) {
			console.log("[API] Fetching artist details from Spotify...");
			const artistDetails = await getArtists(accessToken, missingArtistIds);
			console.log("[API] Fetched details for", artistDetails.length, "artists");

			// Map to our format with images and raw data
			const newArtists = artistDetails.map((artist) => ({
				spotifyArtistId: artist.id,
				name: artist.name,
				imageUrl: artist.images[0]?.url,
				genres: artist.genres,
				popularity: artist.popularity,
				rawData: JSON.stringify(artist),
			}));

			// Batch upsert only new artists
			upsertResult = await convex.mutation(api.rooleases.bulkUpsertArtists, {
				artists: newArtists,
			});
			console.log("[API] Upserted artists:", upsertResult);
		}

		// Add all artists to the year (both existing and new)
		const addResult = await convex.mutation(api.rooleases.bulkAddArtistsToYear, {
			yearId: yearId as Id<"rooYears">,
			artistIds: uniqueArtistIds,
		});
		console.log("[API] Added artists to year:", addResult);

		return NextResponse.json({
			success: true,
			tracksScanned: tracks.length,
			uniqueArtistsFound: uniqueArtistIds.length,
			alreadyExisted: existingArtistIds.length,
			newArtistsFetched: missingArtistIds.length,
			artistsUpserted: upsertResult,
			artistsAddedToYear: addResult,
		});
	} catch (error) {
		console.error("[API] Error seeding artists:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: `Failed to seed artists: ${errorMessage}` },
			{ status: 500 },
		);
	}
}

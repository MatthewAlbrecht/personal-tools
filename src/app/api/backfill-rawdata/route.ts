import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { env } from "~/env.js";
import { getTracks } from "~/lib/spotify";

type BackfillRequest = {
	continueFrom?: number;
	maxIterations?: number;
};

/**
 * API route to backfill rawData for spotifyTracksCanonical.
 * This runs in Next.js (not Convex) so it doesn't have Convex's byte limits.
 * Each Convex call is independent, avoiding cumulative memory issues.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as BackfillRequest;
		const maxIterations = body.maxIterations ?? 100;
		let continueFrom = body.continueFrom;

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Get access token from Convex
		const userId = env.SPOTIFY_SYNC_USER_ID;
		if (!userId) {
			return NextResponse.json(
				{ error: "SPOTIFY_SYNC_USER_ID not configured" },
				{ status: 500 },
			);
		}

		const connection = await convex.query(api.spotify.getConnection, { userId });
		if (!connection) {
			return NextResponse.json(
				{ error: `No Spotify connection for user ${userId}` },
				{ status: 500 },
			);
		}

		let accessToken = connection.accessToken;

		// Refresh token if needed
		const now = Date.now();
		if (connection.expiresAt < now + 5 * 60 * 1000) {
			console.log("[Backfill] Refreshing access token...");
			
			// Get base URL from request
			const baseUrl = new URL(request.url).origin;
			const refreshResult = await fetch(
				`${baseUrl}/api/spotify/refresh-token`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userId }),
				},
			);

			if (!refreshResult.ok) {
				return NextResponse.json(
					{ error: "Failed to refresh token" },
					{ status: 500 },
				);
			}

			const refreshData = await refreshResult.json();
			accessToken = refreshData.accessToken;
		}

		let totalScanned = 0;
		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		let iteration = 0;
		let lastCreationTime: number | undefined = continueFrom;
		let done = false;

		console.log(`[Backfill] Starting from ${continueFrom ?? "beginning"}, max ${maxIterations} iterations`);

		while (iteration < maxIterations) {
			iteration++;

			// Get next batch of tracks (small query, no rawData loaded)
			const batch = await convex.query(api.spotify.getTrackIdsBatch, {
				afterTime: lastCreationTime,
			});

			if (batch.length === 0) {
				console.log("[Backfill] Reached end of all tracks!");
				done = true;
				break;
			}

			// Filter to tracks that need rawData
			const needsUpdate = batch.filter((t) => !t.hasRawData);
			totalSkipped += batch.length - needsUpdate.length;
			totalScanned += batch.length;

			if (needsUpdate.length > 0) {
				const spotifyTrackIds = needsUpdate.map((t) => t.spotifyTrackId);

				try {
					// Fetch from Spotify (handles chunking internally)
					const spotifyTracks = await getTracks(accessToken, spotifyTrackIds);
					const trackDataMap = new Map(spotifyTracks.map((t) => [t.id, t]));

					// Update each track
					for (const track of needsUpdate) {
						const spotifyData = trackDataMap.get(track.spotifyTrackId);
						if (spotifyData) {
							await convex.mutation(api.spotify.updateCanonicalTrackRawData, {
								trackId: track._id as Id<"spotifyTracksCanonical">,
								rawData: JSON.stringify(spotifyData),
							});
							totalUpdated++;
						}
					}
				} catch (error) {
					console.error(`[Backfill] Spotify error:`, error);
					totalErrors++;
				}
			}

			lastCreationTime = batch[batch.length - 1]?.creationTime;

			if (iteration % 20 === 0) {
				console.log(
					`[Backfill] Progress: ${totalScanned} scanned, ${totalUpdated} updated, ${totalSkipped} skipped`,
				);
			}
		}

		console.log(
			`[Backfill] Completed: ${totalScanned} scanned, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`,
		);

		return NextResponse.json({
			success: true,
			totalScanned,
			totalUpdated,
			totalSkipped,
			totalErrors,
			done,
			continueFrom: done ? null : lastCreationTime,
		});
	} catch (error) {
		console.error("[Backfill] Error:", error);
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: `Backfill failed: ${errorMessage}` },
			{ status: 500 },
		);
	}
}

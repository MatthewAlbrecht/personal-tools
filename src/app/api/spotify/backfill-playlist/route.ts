import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const backfillResultSchema = z.object({
	matches: z.array(
		z.object({
			trackId: z.string(),
			trackName: z.string(),
			artistName: z.string(),
			confidence: z.enum(["high", "medium", "low"]),
			reason: z.string(),
		}),
	),
});

type BackfillRequest = {
	playlist: {
		id: string;
		name: string;
		description: string;
	};
	categorizations: Array<{
		trackId: string;
		trackName: string;
		artistName: string;
		userInput: string;
	}>;
	accessToken: string;
	dryRun?: boolean;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as BackfillRequest;
		const { playlist, categorizations, accessToken, dryRun = false } = body;

		console.log("[API] Backfill request:", {
			playlistId: playlist?.id,
			playlistName: playlist?.name,
			categorizationCount: categorizations?.length,
			dryRun,
		});

		if (!playlist || !categorizations?.length || !accessToken) {
			console.error("[API] Missing required fields");
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}

		// Process in batches of 10 for better AI performance
		const batchSize = 10;
		const allMatches: Array<{
			trackId: string;
			trackName: string;
			artistName: string;
			confidence: "high" | "medium" | "low";
			reason: string;
		}> = [];

		console.log(
			"[API] Processing",
			categorizations.length,
			"categorizations in batches of",
			batchSize,
		);

		for (let i = 0; i < categorizations.length; i += batchSize) {
			const batch = categorizations.slice(i, i + batchSize);
			const batchNum = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(categorizations.length / batchSize);

			console.log(
				`[API] Processing batch ${batchNum}/${totalBatches} with ${batch.length} items`,
			);

			const songsDescription = batch
				.map(
					(c, idx) =>
						`${idx + 1}. ID: ${c.trackId} - "${c.trackName}" by ${c.artistName} - User notes: "${c.userInput}"`,
				)
				.join("\n");

			const { object } = await generateObject({
				model: openai("gpt-5-nano-2025-08-07"),
				schema: backfillResultSchema,
				system: `You are evaluating whether previously categorized songs belong in a specific playlist.

Playlist: "${playlist.name}"
Description: ${playlist.description}

For each song, determine if it fits this playlist based on the song info and the user's original notes about it.
Only include songs that have at least a "medium" confidence of belonging.
Be selective - only include songs that truly fit the playlist's vibe.

IMPORTANT: You MUST return the trackId exactly as provided for each matching song.`,
				prompt: `Evaluate these songs for the playlist and return matches with their track IDs:\n\n${songsDescription}\n\nFor each matching song, include: trackId (EXACTLY as shown), trackName, artistName, confidence level (high/medium/low), and reason.`,
			});

			console.log(
				`[API] Batch ${batchNum} returned ${object.matches.length} matches`,
			);
			allMatches.push(...object.matches);
		}

		console.log("[API] Total matches found:", allMatches.length);

		// If dry run, return matches without adding to Spotify
		if (dryRun) {
			console.log(
				"[API] Dry run mode - returning matches without adding to Spotify",
			);
			return NextResponse.json({
				matches: allMatches,
				addedCount: 0,
			});
		}

		// Add matching tracks to the playlist
		const trackUris = allMatches
			.filter((m) => m.confidence === "high" || m.confidence === "medium")
			.map((m) => `spotify:track:${m.trackId}`);

		console.log(
			"[API] Filtered to",
			trackUris.length,
			"high/medium confidence tracks",
		);

		if (trackUris.length > 0) {
			console.log("[API] Adding tracks to Spotify playlist in batches of 100");

			// Add tracks to Spotify playlist in batches of 100 (API limit)
			for (let i = 0; i < trackUris.length; i += 100) {
				const batch = trackUris.slice(i, i + 100);
				const batchNum = Math.floor(i / 100) + 1;
				const totalBatches = Math.ceil(trackUris.length / 100);

				console.log(
					`[API] Spotify batch ${batchNum}/${totalBatches} - adding ${batch.length} tracks`,
				);

				const spotifyRes = await fetch(
					`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ uris: batch }),
					},
				);

				console.log(
					`[API] Spotify batch ${batchNum} response status:`,
					spotifyRes.status,
				);

				if (!spotifyRes.ok) {
					const errorText = await spotifyRes.text();
					console.error(`[API] Spotify batch ${batchNum} error:`, errorText);
					throw new Error(
						`Spotify API error: ${spotifyRes.status} - ${errorText}`,
					);
				}

				const spotifyData = await spotifyRes.json();
				console.log(`[API] Spotify batch ${batchNum} response:`, spotifyData);
			}
		} else {
			console.log("[API] No tracks with sufficient confidence to add");
		}

		console.log(
			"[API] Successfully completed - added",
			trackUris.length,
			"tracks",
		);
		return NextResponse.json({
			matches: allMatches,
			addedCount: trackUris.length,
		});
	} catch (error) {
		console.error("[API] Backfill error:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: `Failed to backfill playlist: ${errorMessage}` },
			{ status: 500 },
		);
	}
}

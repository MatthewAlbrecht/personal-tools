import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const playlistSuggestionSchema = z.object({
	suggestedPlaylists: z.array(
		z.object({
			playlistId: z.string().describe("The Spotify playlist ID"),
			playlistName: z.string().describe("The name of the playlist"),
			confidence: z
				.enum(["high", "medium", "low"])
				.describe("How confident the suggestion is"),
			reason: z
				.string()
				.describe("Brief explanation of why this song fits the playlist"),
		}),
	),
});

export type PlaylistSuggestion = z.infer<
	typeof playlistSuggestionSchema
>["suggestedPlaylists"][number];

type CategorizationRequest = {
	trackName: string;
	artistName: string;
	albumName?: string;
	userInput: string;
	playlists: Array<{
		id: string;
		name: string;
		description: string;
	}>;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as CategorizationRequest;
		const { trackName, artistName, albumName, userInput, playlists } = body;

		if (!trackName || !artistName || !userInput || !playlists?.length) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}

		const batchSize = 4;
		const batches = chunkArray(playlists, batchSize);
		const userPrompt = buildUserPrompt(
			trackName,
			artistName,
			albumName,
			userInput,
		);

		console.log(
			`[Categorize] Processing ${playlists.length} playlists in ${batches.length} batches of ${batchSize}`,
		);

		const results = await Promise.allSettled(
			batches.map((batch, index) => {
				console.log(
					`[Categorize] Starting batch ${index + 1}/${batches.length} with ${batch.length} playlists`,
				);
				const systemPrompt = buildSystemPrompt(batch);
				return generateObject({
					model: openai("gpt-5-nano-2025-08-07"),
					schema: playlistSuggestionSchema,
					system: systemPrompt,
					prompt: userPrompt,
				});
			}),
		);

		const allSuggestions: PlaylistSuggestion[] = [];
		let failedBatches = 0;

		results.forEach((result, index) => {
			if (result.status === "fulfilled") {
				console.log(
					`[Categorize] Batch ${index + 1} succeeded: ${result.value.object.suggestedPlaylists.length} suggestions`,
				);
				allSuggestions.push(...result.value.object.suggestedPlaylists);
			} else {
				console.error(`[Categorize] Batch ${index + 1} failed:`, result.reason);
				failedBatches++;
			}
		});

		if (allSuggestions.length === 0 && failedBatches > 0) {
			return NextResponse.json(
				{ error: "All batches failed to categorize song" },
				{ status: 500 },
			);
		}

		if (allSuggestions.length === 0) {
			return NextResponse.json({ suggestedPlaylists: [] });
		}

		if (failedBatches > 0) {
			console.warn(
				`[Categorize] ${failedBatches} out of ${batches.length} batches failed`,
			);
		}

		console.log(`[Categorize] Total suggestions: ${allSuggestions.length}`);

		return NextResponse.json(allSuggestions);
	} catch (error) {
		console.error("Categorization error:", error);
		return NextResponse.json(
			{ error: "Failed to categorize song" },
			{ status: 500 },
		);
	}
}

function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

function buildSystemPrompt(
	playlists: Array<{ id: string; name: string; description: string }>,
): string {
	const playlistList = playlists
		.map((p) => `- "${p.name}" (ID: ${p.id}): ${p.description}`)
		.join("\n");

	return `You are a playlist categorization assistant. Your job is to match songs to playlists based on the user's description of the song's vibe, mood, or when they'd listen to it.

Here are the user's playlists and their mood descriptions:
${playlistList}

Guidelines:
- Only suggest playlists where the song genuinely fits the described mood/vibe
- Consider the user's description of when/where they'd listen to it
- A song can fit multiple playlists if it truly matches their vibes
- If the song doesn't fit any playlist well, return an empty array
- Provide concise but specific reasons for each suggestion
- Use 'high' confidence when there's a strong match, 'medium' for decent fits, 'low' for borderline cases`;
}

function buildUserPrompt(
	trackName: string,
	artistName: string,
	albumName: string | undefined,
	userInput: string,
): string {
	const trackInfo = albumName
		? `"${trackName}" by ${artistName} (from "${albumName}")`
		: `"${trackName}" by ${artistName}`;

	return `Song: ${trackInfo}

User's description of this song: "${userInput}"

Based on the song and the user's description, which playlists should this song be added to?`;
}

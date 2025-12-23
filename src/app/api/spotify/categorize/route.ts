import { type NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const playlistSuggestionSchema = z.object({
  suggestedPlaylists: z.array(
    z.object({
      playlistId: z.string().describe('The Spotify playlist ID'),
      playlistName: z.string().describe('The name of the playlist'),
      confidence: z
        .enum(['high', 'medium', 'low'])
        .describe('How confident the suggestion is'),
      reason: z
        .string()
        .describe('Brief explanation of why this song fits the playlist'),
    })
  ),
});

export type PlaylistSuggestion = z.infer<
  typeof playlistSuggestionSchema
>['suggestedPlaylists'][number];

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
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(playlists);
    const userPrompt = buildUserPrompt(
      trackName,
      artistName,
      albumName,
      userInput
    );

    const { object } = await generateObject({
      model: openai('gpt-5-nano-2025-08-07'),
      schema: playlistSuggestionSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    return NextResponse.json(object);
  } catch (error) {
    console.error('Categorization error:', error);
    return NextResponse.json(
      { error: 'Failed to categorize song' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(
  playlists: Array<{ id: string; name: string; description: string }>
): string {
  const playlistList = playlists
    .map((p) => `- "${p.name}" (ID: ${p.id}): ${p.description}`)
    .join('\n');

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
  userInput: string
): string {
  const trackInfo = albumName
    ? `"${trackName}" by ${artistName} (from "${albumName}")`
    : `"${trackName}" by ${artistName}`;

  return `Song: ${trackInfo}

User's description of this song: "${userInput}"

Based on the song and the user's description, which playlists should this song be added to?`;
}

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { type NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are generating a concise playlist description that captures both the musical essence and the experiential vibe.

Write exactly 3 sentences:
1. First sentence: Describe what songs typically sound like — energy, mood, instrumentation, production style.
2. Second sentence: Paint a vivid scene or situation this playlist evokes.
3. Third sentence: Capture the emotional feeling or when someone would listen.

Be vivid and specific, but extremely concise. No headers or labels — just three flowing sentences.`;

type GenerateDescriptionRequest = {
	userNotes: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as GenerateDescriptionRequest;
		const { userNotes } = body;

		if (!userNotes?.trim()) {
			return NextResponse.json(
				{ error: "Missing user notes" },
				{ status: 400 },
			);
		}

		const { text } = await generateText({
			model: openai("gpt-5-nano-2025-08-07"),
			system: SYSTEM_PROMPT,
			prompt: `User notes: "${userNotes}"\n\nGenerate a 3-sentence description.`,
		});

		return NextResponse.json({ description: text.trim() });
	} catch (error) {
		console.error("Generate description error:", error);
		return NextResponse.json(
			{ error: "Failed to generate description" },
			{ status: 500 },
		);
	}
}

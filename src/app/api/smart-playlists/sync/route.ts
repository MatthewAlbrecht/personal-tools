import { type NextRequest, NextResponse } from "next/server";
import { syncSmartPlaylistRecipe } from "~/lib/smart-playlists-sync";
import type { Id } from "../../../../../convex/_generated/dataModel";

type SyncSmartPlaylistRequest = {
	userId?: string;
	recipeId?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const body = (await request.json()) as SyncSmartPlaylistRequest;
	const { userId, recipeId } = body;

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	if (!userId) {
		return NextResponse.json({ error: "No userId provided" }, { status: 400 });
	}

	if (!recipeId) {
		return NextResponse.json(
			{ error: "No recipeId provided" },
			{ status: 400 },
		);
	}

	try {
		const result = await syncSmartPlaylistRecipe({
			accessToken,
			userId,
			recipeId: recipeId as Id<"smartPlaylists">,
		});

		if (!result.success) {
			return NextResponse.json(
				{
					error: "Failed to sync smart playlist",
					details: result.error,
				},
				{ status: 500 },
			);
		}

		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unknown smart playlist sync error";

		return NextResponse.json(
			{ error: "Failed to sync smart playlist", details: message },
			{ status: 500 },
		);
	}
}

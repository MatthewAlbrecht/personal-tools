import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import type {
	SmartPlaylistFilters,
	SmartPlaylistSource,
	SmartPlaylistSyncMode,
	TrackSelection,
} from "~/lib/smart-playlists/types";
import { syncSmartPlaylistRecipe } from "~/lib/smart-playlists-sync";
import { createPlaylist } from "~/lib/spotify";
import { api } from "../../../../../convex/_generated/api";

type CreateSmartPlaylistRequest = {
	userId?: string;
	name?: string;
	source?: SmartPlaylistSource;
	filters?: SmartPlaylistFilters;
	syncMode?: SmartPlaylistSyncMode;
	trackSelection?: TrackSelection;
	description?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const body = (await request.json()) as CreateSmartPlaylistRequest;
	const {
		userId,
		name,
		source,
		filters,
		syncMode,
		trackSelection = { mode: "allTracks" },
		description,
	} = body;

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	if (!userId) {
		return NextResponse.json({ error: "No userId provided" }, { status: 400 });
	}

	if (!name?.trim()) {
		return NextResponse.json({ error: "No name provided" }, { status: 400 });
	}

	if (source !== "forLater" && source !== "rankings") {
		return NextResponse.json(
			{ error: "source must be forLater or rankings" },
			{ status: 400 },
		);
	}

	if (!filters) {
		return NextResponse.json(
			{ error: "No filters provided" },
			{ status: 400 },
		);
	}

	if (syncMode !== "mirror" && syncMode !== "addOnly") {
		return NextResponse.json(
			{ error: "syncMode must be mirror or addOnly" },
			{ status: 400 },
		);
	}

	try {
		const playlist = await createPlaylist(
			accessToken,
			userId,
			name.trim(),
			description,
			false,
		);

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const recipeId = await convex.mutation(api.smartPlaylists.insertRecipe, {
			userId,
			name: name.trim(),
			spotifyPlaylistId: playlist.id,
			source,
			filters,
			syncMode,
			trackSelection,
		});

		const sync = await syncSmartPlaylistRecipe({
			accessToken,
			userId,
			recipeId,
		});

		return NextResponse.json({ recipeId, playlist, sync });
	} catch (error) {
		console.error("Error creating smart playlist:", error);
		const message =
			error instanceof Error
				? error.message
				: "Failed to create smart playlist";

		return NextResponse.json({ error: message }, { status: 500 });
	}
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
	isDuplicatePlaylistSongError,
	normalizeGeniusSongUrl,
} from "../../../../../convex/_utils/playlistLyrics";
import {
	createPlaylistLyricsConvexClient,
	fetchGeniusSongScrape,
	getFailureStatus,
	getRouteErrorMessage,
} from "../_utils";

type AddSongRequestBody = {
	playlistId?: unknown;
	url?: unknown;
};

export async function POST(request: NextRequest) {
	const cookieStore = await cookies();
	const session = cookieStore.get("session")?.value;

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as AddSongRequestBody;
	if (typeof body.playlistId !== "string" || typeof body.url !== "string") {
		return NextResponse.json(
			{ error: "playlistId and url are required" },
			{ status: 400 },
		);
	}

	const playlistId = body.playlistId as Id<"playlistLyrics">;
	let pendingUrl = body.url.trim();
	if (!pendingUrl) {
		return NextResponse.json(
			{ error: "Paste a Genius song URL first" },
			{ status: 400 },
		);
	}

	const convex = createPlaylistLyricsConvexClient();

	try {
		const canonicalUrl = normalizeGeniusSongUrl(pendingUrl);
		pendingUrl = canonicalUrl;

		const existingScrape = await convex.query(
			api.playlistLyrics.getScrapeByCanonicalUrl,
			{ canonicalUrl },
		);

		if (existingScrape) {
			const itemId = await convex.mutation(
				api.playlistLyrics.addScrapeToPlaylist,
				{
					playlistId,
					lyricScrapeId: existingScrape._id,
					reused: true,
				},
			);

			return NextResponse.json({
				itemId,
				scrapeId: existingScrape._id,
				canonicalUrl,
				reused: true,
			});
		}

		const scrapedSong = await fetchGeniusSongScrape(canonicalUrl);
		const scrapeId = await convex.mutation(
			api.playlistLyrics.upsertScrape,
			scrapedSong,
		);
		const itemId = await convex.mutation(
			api.playlistLyrics.addScrapeToPlaylist,
			{
				playlistId,
				lyricScrapeId: scrapeId,
				reused: false,
			},
		);

		return NextResponse.json({
			itemId,
			scrapeId,
			canonicalUrl,
			reused: false,
		});
	} catch (error) {
		if (isDuplicatePlaylistSongError(error)) {
			return NextResponse.json(
				{ error: getRouteErrorMessage(error) },
				{ status: 409 },
			);
		}

		await recordFailedPlaylistItem(convex, playlistId, pendingUrl);
		return NextResponse.json(
			{ error: getRouteErrorMessage(error) },
			{ status: getFailureStatus(error) },
		);
	}
}

async function recordFailedPlaylistItem(
	convex: ReturnType<typeof createPlaylistLyricsConvexClient>,
	playlistId: Id<"playlistLyrics">,
	pendingUrl: string,
): Promise<void> {
	try {
		await convex.mutation(api.playlistLyrics.createFailedItem, {
			playlistId,
			pendingUrl,
		});
	} catch (error) {
		console.error("Failed to record failed playlist item", error);
	}
}

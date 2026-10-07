import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionUserId } from "~/server/session-user";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { normalizeGeniusSongUrl } from "../../../../../convex/_utils/playlistLyrics";
import {
	createPlaylistLyricsConvexClient,
	fetchGeniusSongScrape,
	getFailureStatus,
	getRouteErrorMessage,
} from "../_utils";

type RescrapeSongRequestBody = {
	itemId?: unknown;
};

export async function POST(request: NextRequest) {
	if (!(await getSessionUserId(request))) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as RescrapeSongRequestBody;
	if (typeof body.itemId !== "string") {
		return NextResponse.json({ error: "itemId is required" }, { status: 400 });
	}

	const itemId = body.itemId as Id<"playlistLyricsItems">;
	const convex = createPlaylistLyricsConvexClient();
	const item = await convex.query(api.playlistLyrics.getItemForRescrape, {
		itemId,
	});

	if (!item) {
		return NextResponse.json(
			{ error: "Playlist item not found" },
			{ status: 404 },
		);
	}

	let pendingUrl = item.scrape?.canonicalUrl ?? item.pendingUrl?.trim() ?? "";
	if (!pendingUrl) {
		return NextResponse.json(
			{ error: "Playlist item does not have a Genius URL to scrape" },
			{ status: 400 },
		);
	}

	try {
		const canonicalUrl = item.scrape?.canonicalUrl
			? item.scrape.canonicalUrl
			: normalizeGeniusSongUrl(pendingUrl);
		pendingUrl = canonicalUrl;

		const scrapedSong = await fetchGeniusSongScrape(canonicalUrl);
		const scrapeId = await convex.mutation(
			api.playlistLyrics.upsertScrape,
			scrapedSong,
		);

		await convex.mutation(api.playlistLyrics.markItemScrapeReady, {
			itemId,
			lyricScrapeId: scrapeId,
		});

		return NextResponse.json({
			itemId,
			scrapeId,
			canonicalUrl: scrapedSong.canonicalUrl,
		});
	} catch (error) {
		await markPlaylistItemScrapeFailed(convex, itemId, pendingUrl);
		return NextResponse.json(
			{ error: getRouteErrorMessage(error) },
			{ status: getFailureStatus(error) },
		);
	}
}

async function markPlaylistItemScrapeFailed(
	convex: ReturnType<typeof createPlaylistLyricsConvexClient>,
	itemId: Id<"playlistLyricsItems">,
	pendingUrl: string,
): Promise<void> {
	try {
		await convex.mutation(api.playlistLyrics.markItemScrapeFailed, {
			itemId,
			pendingUrl,
		});
	} catch (error) {
		console.error("Failed to mark playlist item scrape failed", error);
	}
}

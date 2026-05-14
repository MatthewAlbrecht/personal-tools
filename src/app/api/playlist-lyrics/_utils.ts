import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env.js";
import {
	buildGeniusSongScrape,
	getGeniusAlbumArtDebugInfo,
} from "../../../../convex/_utils/playlistLyrics";
import type { GeniusSongScrapeInput } from "../../../../convex/_utils/playlistLyrics";

const geniusFetchHeaders = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br",
	Referer: "https://www.google.com/",
	DNT: "1",
	Connection: "keep-alive",
	"Upgrade-Insecure-Requests": "1",
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "cross-site",
	"Sec-Fetch-User": "?1",
	"Sec-Ch-Ua":
		'"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
	"Sec-Ch-Ua-Mobile": "?0",
	"Sec-Ch-Ua-Platform": '"macOS"',
	"Cache-Control": "max-age=0",
};

export function createPlaylistLyricsConvexClient(): ConvexHttpClient {
	return new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
}

export async function fetchGeniusSongScrape(
	canonicalUrl: string,
): Promise<GeniusSongScrapeInput> {
	const response = await fetch(canonicalUrl, {
		headers: geniusFetchHeaders,
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch Genius page: ${response.status} ${response.statusText}`,
		);
	}

	const html = await response.text();
	const scrapedSong = buildGeniusSongScrape({ canonicalUrl, html });
	const albumArtDebugInfo = getGeniusAlbumArtDebugInfo(html);

	console.info("[playlist-lyrics] Genius album art scrape debug", {
		canonicalUrl,
		albumArtUrl: scrapedSong.albumArtUrl ?? null,
		...albumArtDebugInfo,
	});

	return scrapedSong;
}

export function getRouteErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Playlist lyrics request failed";
}

export function getFailureStatus(error: unknown): number {
	if (
		error instanceof Error &&
		error.message.startsWith("Failed to fetch Genius page:")
	) {
		return 502;
	}

	return 400;
}

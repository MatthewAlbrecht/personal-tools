import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parse as parseHTML } from "node-html-parser";
import {
	type GeniusAlbumTrackInfo,
	buildAlbumSongRecordInput,
} from "../../../../convex/_utils/geniusAlbumLyrics";
import {
	type GeniusCredit,
	extractAlbumTracklistItems,
	extractCredits,
} from "../../../../convex/_utils/geniusParser";

type SongData = {
	songTitle: string;
	geniusSongUrl: string;
	trackNumber: number;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
	scrapeState?: "ready" | "failed";
	scrapeError?: string;
};

type AlbumData = {
	albumTitle: string;
	artistName: string;
	geniusAlbumUrl: string;
	songs: SongData[];
};

type HtmlParserNode = {
	nodeType?: unknown;
	textContent?: unknown;
	tagName?: unknown;
	childNodes?: unknown;
	getAttribute?: unknown;
};

function extractLyricsFromHTML(html: string): string {
	const root = parseHTML(html);
	const lyrics: string[] = [];

	// Find all lyrics containers
	const containers = root.querySelectorAll('[data-lyrics-container="true"]');

	for (const container of containers) {
		const lines: string[] = [];

		// Recursively process nodes to preserve formatting
		function processNode(node: unknown, depth = 0): void {
			const parserNode = getHtmlParserNode(node);
			if (!parserNode) return;

			if (parserNode.nodeType === 3) {
				// Text node
				const text =
					typeof parserNode.textContent === "string"
						? parserNode.textContent.trim()
						: "";
				if (text) {
					lines.push(text);
				}
			} else if (parserNode.nodeType === 1) {
				// Element node
				const tagName =
					typeof parserNode.tagName === "string"
						? parserNode.tagName.toLowerCase()
						: undefined;
				const className = getNodeAttribute(parserNode, "class") ?? "";
				const excludeFromSelection = getNodeAttribute(
					parserNode,
					"data-exclude-from-selection",
				);

				// Skip elements marked as excluded or containing header/UI content
				if (
					excludeFromSelection === "true" ||
					className.includes("LyricsHeader") ||
					className.includes("LyricsFooter") ||
					className.includes("SongHeader") ||
					className.includes("Contributors") ||
					tagName === "h1" ||
					tagName === "h2" ||
					tagName === "h3" ||
					tagName === "header"
				) {
					return;
				}

				if (tagName === "br") {
					lines.push("\n");
				} else if (tagName === "i") {
					// Wrap italic content with asterisks
					const italicText =
						typeof parserNode.textContent === "string"
							? parserNode.textContent.trim()
							: "";
					if (italicText) {
						lines.push(`*${italicText}*`);
					}
				} else if (tagName === "b") {
					// Wrap bold content with double asterisks
					const boldText =
						typeof parserNode.textContent === "string"
							? parserNode.textContent.trim()
							: "";
					if (boldText) {
						lines.push(`**${boldText}**`);
					}
				} else {
					// For other elements, recursively process children
					for (const child of getNodeChildren(parserNode)) {
						processNode(child, depth + 1);
					}
				}
			}
		}

		processNode(container);

		// Join lines and clean up
		let sectionText = lines.join("").trim();

		// Remove any remaining header-like patterns at the start
		// Pattern: "X Contributors<song name> Lyrics"
		sectionText = sectionText.replace(/^\d+\s*Contributors.*?Lyrics\s*/i, "");

		// Replace multiple consecutive newlines with double newline
		sectionText = sectionText.replace(/\n{3,}/g, "\n\n");

		if (sectionText) {
			lyrics.push(sectionText);
		}
	}

	return lyrics.join("\n\n").trim();
}

function getHtmlParserNode(node: unknown): HtmlParserNode | undefined {
	if (!node || typeof node !== "object") return undefined;

	return node;
}

function getNodeAttribute(
	node: HtmlParserNode,
	attribute: string,
): string | undefined {
	if (typeof node.getAttribute !== "function") return undefined;

	const value = node.getAttribute(attribute);
	return typeof value === "string" ? value : undefined;
}

function getNodeChildren(node: HtmlParserNode): unknown[] {
	return Array.isArray(node.childNodes) ? node.childNodes : [];
}

function extractAboutFromHTML(html: string): string | undefined {
	const root = parseHTML(html);
	const content = root.querySelector('[class*="SongDescription__Content"]');
	if (!content) return undefined;

	const aboutText = content.textContent.trim();
	if (!aboutText) return undefined;

	return aboutText;
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { geniusAlbumUrl } = body;

		if (!geniusAlbumUrl || !geniusAlbumUrl.includes("genius.com")) {
			return NextResponse.json(
				{ error: "Invalid Genius URL" },
				{ status: 400 },
			);
		}

		console.log("Fetching album page:", geniusAlbumUrl);

		// Enhanced headers to appear as a real browser
		const headers = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			Referer: "https://www.google.com/",
			DNT: "1",
			"Upgrade-Insecure-Requests": "1",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "cross-site",
			"Sec-Fetch-User": "?1",
		};

		// Fetch album page directly
		const albumResponse = await fetch(geniusAlbumUrl, { headers });

		if (!albumResponse.ok) {
			const errorText = await albumResponse.text();
			console.error(
				"Failed to fetch:",
				albumResponse.status,
				errorText.substring(0, 200),
			);
			return NextResponse.json(
				{ error: `Failed to fetch album page: ${albumResponse.status}` },
				{ status: albumResponse.status },
			);
		}

		const albumHtml = await albumResponse.text();
		const albumRoot = parseHTML(albumHtml);

		// Extract album title - look for h1 with album name
		const albumTitleElem = albumRoot.querySelector(
			'h1[class*="header_with_cover_art"]',
		);
		let albumTitle = albumTitleElem ? albumTitleElem.textContent.trim() : "";

		// Clean up title (remove "Album" label if present)
		albumTitle = albumTitle.replace(/^Album\s+/i, "");

		// Extract artist name from h2 link
		const artistElem = albumRoot.querySelector('h2 a[href*="/artists/"]');
		const artistName = artistElem ? artistElem.textContent.trim() : "";

		if (!albumTitle || !artistName) {
			return NextResponse.json(
				{ error: "Could not extract album metadata" },
				{ status: 400 },
			);
		}

		console.log("Found album:", albumTitle, "by", artistName);

		// Extract tracklist - supports old chart_row and new AlbumTracklist markup
		type TrackInfo = GeniusAlbumTrackInfo;
		const tracklistInfo: TrackInfo[] = extractAlbumTracklistItems(albumHtml);

		if (tracklistInfo.length === 0) {
			return NextResponse.json(
				{ error: "Could not find any songs in album" },
				{ status: 400 },
			);
		}

		console.log(
			"Track order:",
			tracklistInfo.map((t) => `Track ${t.trackNumber}`).join(", "),
		);

		console.log(`Final tracklist: ${tracklistInfo.length} songs`);

		// Fetch each song
		const songs: SongData[] = [];

		for (let i = 0; i < tracklistInfo.length; i++) {
			const trackInfo = tracklistInfo[i];
			if (!trackInfo) continue;

			const songUrl = trackInfo.url;
			const trackNumber = trackInfo.trackNumber;
			let songData = buildAlbumSongRecordInput({ track: trackInfo });

			console.log(`Fetching song ${trackNumber}/${tracklistInfo.length}`);

			try {
				// Small delay to be respectful
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				const songResponse = await fetch(songUrl, { headers });
				if (!songResponse.ok) {
					throw new Error(
						`Failed to fetch song page: ${songResponse.status} ${songResponse.statusText}`,
					);
				}

				const songHtml = await songResponse.text();
				const songRoot = parseHTML(songHtml);

				// Extract song title
				const songTitleElem = songRoot.querySelector(
					'h1[class*="SongHeader"][class*="Title"] span',
				);
				const songTitle = songTitleElem ? songTitleElem.textContent.trim() : "";

				// Extract lyrics
				const lyrics = extractLyricsFromHTML(songHtml);

				// Extract about
				const about = extractAboutFromHTML(songHtml);
				const credits = extractCredits(songHtml);

				if (!songTitle) {
					throw new Error("Could not extract song title");
				}

				songData = buildAlbumSongRecordInput({
					track: trackInfo,
					scrape: {
						songTitle,
						lyrics,
						about,
						credits,
					},
				});
				console.log(`Prepared song ${trackNumber}: ${songTitle}`);
			} catch (error) {
				console.error(`Error processing song ${trackNumber}:`, error);
				songData = buildAlbumSongRecordInput({
					track: trackInfo,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to scrape song page",
				});
			}

			songs.push(songData);
			console.log(`Stored song ${trackNumber}: ${songData.songTitle}`);
		}

		const albumData: AlbumData = {
			albumTitle,
			artistName,
			geniusAlbumUrl,
			songs,
		};

		return NextResponse.json(albumData);
	} catch (error) {
		console.error("Scraping error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to scrape album",
			},
			{ status: 500 },
		);
	}
}

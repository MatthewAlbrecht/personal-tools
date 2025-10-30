import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parse as parseHTML } from "node-html-parser";

type SongData = {
	songTitle: string;
	geniusSongUrl: string;
	trackNumber: number;
	lyrics: string;
	about?: string;
};

type AlbumData = {
	albumTitle: string;
	artistName: string;
	geniusAlbumUrl: string;
	songs: SongData[];
};

function extractLyricsFromHTML(html: string): string {
	const root = parseHTML(html);
	const lyrics: string[] = [];

	// Find all lyrics containers
	const containers = root.querySelectorAll('[data-lyrics-container="true"]');

	for (const container of containers) {
		const lines: string[] = [];

		// Recursively process nodes to preserve formatting
		// biome-ignore lint/suspicious/noExplicitAny: node-html-parser doesn't export proper types for DOM nodes
		function processNode(node: any, depth = 0): void {
			if (node.nodeType === 3) {
				// Text node
				const text = node.textContent.trim();
				if (text) {
					lines.push(text);
				}
			} else if (node.nodeType === 1) {
				// Element node
				const tagName = node.tagName?.toLowerCase();
				const className = node.getAttribute?.("class") || "";
				const excludeFromSelection = node.getAttribute?.(
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
					const italicText = node.textContent.trim();
					if (italicText) {
						lines.push(`*${italicText}*`);
					}
				} else if (tagName === "b") {
					// Wrap bold content with double asterisks
					const boldText = node.textContent.trim();
					if (boldText) {
						lines.push(`**${boldText}**`);
					}
				} else {
					// For other elements, recursively process children
					for (const child of node.childNodes || []) {
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

		// Extract tracklist - look for chart_row or album-tracklist-row elements
		type TrackInfo = { url: string; trackNumber: number };
		const tracklistInfo: TrackInfo[] = [];

		// Try old Angular version first (chart_row)
		const chartRows = albumRoot.querySelectorAll(".chart_row");

		if (chartRows.length > 0) {
			console.log(`Found ${chartRows.length} chart rows (old Genius format)`);
			for (const row of chartRows) {
				// Get track number from chart_row-number_container
				const numberElem = row.querySelector(
					".chart_row-number_container span",
				);
				const trackNumber = numberElem
					? Number.parseInt(numberElem.textContent.trim()) || 0
					: 0;

				// Get song URL
				const link = row.querySelector('a[href*="-lyrics"]');
				if (link && trackNumber > 0) {
					const href = link.getAttribute("href");
					if (href) {
						const url = href.startsWith("http")
							? href
							: `https://genius.com${href}`;
						tracklistInfo.push({ url, trackNumber });
					}
				}
			}
		} else {
			// Try new React version (AlbumTracklist__Container)
			console.log("Trying new Genius format (AlbumTracklist)");
			const tracklistContainer = albumRoot.querySelector(
				'[class*="AlbumTracklist__Container"]',
			);

			if (tracklistContainer) {
				const trackItems = tracklistContainer.querySelectorAll(
					'li[class*="AlbumTracklist__Track"]',
				);

				for (const trackItem of trackItems) {
					const trackNumberElem = trackItem.querySelector(
						'[class*="AlbumTracklist__TrackNumber"]',
					);
					const trackNumberText = trackNumberElem?.textContent.trim() || "";
					const trackNumber =
						Number.parseInt(trackNumberText.replace(".", "")) || 0;

					const link = trackItem.querySelector('a[href*="-lyrics"]');
					if (link && trackNumber > 0) {
						const href = link.getAttribute("href");
						if (href) {
							const url = href.startsWith("http")
								? href
								: `https://genius.com${href}`;
							tracklistInfo.push({ url, trackNumber });
						}
					}
				}
			}
		}

		if (tracklistInfo.length === 0) {
			return NextResponse.json(
				{ error: "Could not find any songs in album" },
				{ status: 400 },
			);
		}

		// Sort by track number
		tracklistInfo.sort((a, b) => a.trackNumber - b.trackNumber);

		console.log(
			"Track order:",
			tracklistInfo.map((t) => `Track ${t.trackNumber}`).join(", "),
		);

		// Extract URLs in correct order
		const tracklistUrls = tracklistInfo.map((t) => t.url);
		console.log(`Final tracklist: ${tracklistUrls.length} songs`);

		// Fetch each song
		const songs: SongData[] = [];

		for (let i = 0; i < tracklistInfo.length; i++) {
			const trackInfo = tracklistInfo[i];
			if (!trackInfo) continue;

			const songUrl = trackInfo.url;
			if (!songUrl) continue;

			const trackNumber = trackInfo.trackNumber;

			console.log(`Fetching song ${trackNumber}/${tracklistInfo.length}`);

			try {
				// Small delay to be respectful
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				const songResponse = await fetch(songUrl, { headers });
				if (!songResponse.ok) {
					console.warn(
						`Failed to fetch song ${trackNumber}: ${songResponse.status}`,
					);
					continue;
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

				if (songTitle && lyrics) {
					songs.push({
						songTitle,
						geniusSongUrl: songUrl || "",
						trackNumber,
						lyrics,
						about,
					});
					console.log(`Stored song ${trackNumber}: ${songTitle}`);
				}
			} catch (error) {
				console.error(`Error processing song ${trackNumber}:`, error);
			}
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

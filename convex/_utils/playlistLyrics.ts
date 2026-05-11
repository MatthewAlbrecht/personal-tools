import { NodeType, parse as parseHTML } from "node-html-parser";
import type { HTMLElement, Node } from "node-html-parser";
import { extractAlbumMetadata, extractSongTitle } from "./geniusParser";

export type ScrapeDisplayFields = {
	songTitle: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
};

export type PlaylistDisplayOverrides = {
	songTitleOverride?: string;
	artistNameOverride?: string;
	albumTitleOverride?: string;
	albumArtUrlOverride?: string;
};

export type PlaylistSongDisplay = {
	songTitle: string;
	artistName: string;
	albumTitle: string;
	albumYear: string;
};

export type GeniusSongScrapeInput = {
	canonicalUrl: string;
	songTitle: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	lyrics: string;
	about?: string;
};

export function normalizeGeniusSongUrl(input: string): string {
	let url: URL;

	try {
		url = new URL(input.trim());
	} catch {
		throw new Error("Enter a valid URL");
	}

	const hostname = url.hostname.toLowerCase();
	if (hostname !== "genius.com" && hostname !== "www.genius.com") {
		throw new Error("URL must be from genius.com");
	}

	const pathname = url.pathname.replace(/\/+$/, "");

	if (!pathname.endsWith("-lyrics")) {
		throw new Error("URL must be a Genius song lyrics page");
	}

	return `https://genius.com${pathname}`;
}

export function buildGeniusSongScrape({
	canonicalUrl,
	html,
}: {
	canonicalUrl: string;
	html: string;
}): GeniusSongScrapeInput {
	const songTitle = extractSongTitle(html);
	const metadata = extractAlbumMetadata(html);
	const lyrics = extractLyricsFromHTML(html);
	const about = extractAboutFromHTML(html);
	const albumArtUrl = extractAlbumArtUrlFromHTML(html);

	if (!songTitle || !metadata?.artistName || !lyrics) {
		throw new Error("Could not extract song metadata and lyrics from Genius");
	}

	const album = splitAlbumTitleAndYear(metadata.albumTitle);

	return {
		canonicalUrl,
		songTitle,
		artistName: metadata.artistName,
		albumTitle: album.albumTitle,
		albumYear: album.albumYear,
		...(albumArtUrl ? { albumArtUrl } : {}),
		lyrics,
		about,
	};
}

function extractLyricsFromHTML(html: string): string {
	const root = parseHTML(html);
	const lyrics: string[] = [];
	const containers = root.querySelectorAll('[data-lyrics-container="true"]');

	for (const container of containers) {
		const lines: string[] = [];

		processLyricsNode(container, lines);

		let sectionText = lines.join("").trim();
		sectionText = sectionText.replace(/^\d+\s*Contributors.*?Lyrics\s*/i, "");
		sectionText = sectionText.replace(/\n{3,}/g, "\n\n");

		if (sectionText) {
			lyrics.push(sectionText);
		}
	}

	return lyrics.join("\n\n").trim();
}

function processLyricsNode(node: Node, lines: string[]): void {
	if (node.nodeType === NodeType.TEXT_NODE) {
		const text = node.textContent.trim();
		if (text) {
			lines.push(text);
		}
		return;
	}

	if (node.nodeType !== NodeType.ELEMENT_NODE) {
		return;
	}

	const element = node as HTMLElement;
	const tagName = element.tagName?.toLowerCase();
	const className = element.getAttribute("class") || "";
	const excludeFromSelection = element.getAttribute(
		"data-exclude-from-selection",
	);

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
		return;
	}

	if (tagName === "i") {
		const italicText = element.textContent.trim();
		if (italicText) {
			lines.push(`*${italicText}*`);
		}
		return;
	}

	if (tagName === "b") {
		const boldText = element.textContent.trim();
		if (boldText) {
			lines.push(`**${boldText}**`);
		}
		return;
	}

	for (const child of element.childNodes) {
		processLyricsNode(child, lines);
	}
}

function extractAboutFromHTML(html: string): string | undefined {
	const root = parseHTML(html);
	const content = root.querySelector('[class*="SongDescription__Content"]');
	if (!content) return undefined;

	const aboutText = content.textContent.trim();
	if (!aboutText) return undefined;

	return aboutText;
}

function extractAlbumArtUrlFromHTML(html: string): string | undefined {
	const root = parseHTML(html);
	const coverArt = root.querySelector(
		'[class*="SongHeader-desktop__CoverArt"]',
	);
	const image = coverArt?.querySelector("img");
	const src = normalizeOptionalString(image?.getAttribute("src"));
	const dataSrc = normalizeOptionalString(image?.getAttribute("data-src"));

	return normalizeGeniusImageProxyUrl(src ?? dataSrc);
}

export function isDuplicatePlaylistSongError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes("Song is already in this playlist")
	);
}

export function isPublicPlaylistStatus(status: "draft" | "ready"): boolean {
	return status === "ready";
}

export function getPlaylistSongAlbumArtUrl({
	scrape,
	item,
}: {
	scrape: Pick<ScrapeDisplayFields, "albumArtUrl">;
	item: Pick<PlaylistDisplayOverrides, "albumArtUrlOverride">;
}): string | undefined {
	return (
		normalizeOptionalString(item.albumArtUrlOverride) ??
		normalizeOptionalString(scrape.albumArtUrl)
	);
}

export function shouldRefreshScrapeBeforePlaylistReuse(
	scrape: Pick<ScrapeDisplayFields, "albumArtUrl">,
): boolean {
	return !normalizeOptionalString(scrape.albumArtUrl);
}

export function buildPlaylistSongDisplay({
	scrape,
	item,
}: {
	scrape: ScrapeDisplayFields;
	item: PlaylistDisplayOverrides;
}): PlaylistSongDisplay {
	return {
		songTitle: item.songTitleOverride?.trim() || scrape.songTitle,
		artistName: item.artistNameOverride?.trim() || scrape.artistName,
		albumTitle: item.albumTitleOverride?.trim() || scrape.albumTitle || "",
		albumYear: scrape.albumYear || "",
	};
}

export function sortPlaylistItems<T extends { position: number }>(
	items: T[],
): T[] {
	return [...items].sort((a, b) => a.position - b.position);
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function normalizeGeniusImageProxyUrl(
	value: string | undefined,
): string | undefined {
	if (!value) return undefined;

	try {
		const url = new URL(value);
		const encodedImageUrl = url.pathname
			.split("/")
			.find(
				(segment) =>
					segment.startsWith("https%3A%2F%2F") ||
					segment.startsWith("http%3A%2F%2F"),
			);

		if (!encodedImageUrl) return value;

		return new URL(decodeURIComponent(encodedImageUrl)).href;
	} catch {
		return value;
	}
}

function splitAlbumTitleAndYear(albumTitle: string | undefined): {
	albumTitle?: string;
	albumYear?: string;
} {
	if (!albumTitle) {
		return {};
	}

	let albumYear: string | undefined;
	const cleanedTitle = albumTitle
		.replace(/\(([^)]*)\)/g, (_match, parenthetical: string) => {
			const trimmedParenthetical = parenthetical.trim();
			if (!albumYear && /^\d{4}$/.test(trimmedParenthetical)) {
				albumYear = trimmedParenthetical;
			}

			return "";
		})
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		albumTitle: cleanedTitle || undefined,
		albumYear,
	};
}

import type { GeniusCredit } from "./geniusParser";
import {
	type CreditVisibilityState,
	filterVisibleCredits as filterCreditsByVisibility,
} from "./geniusCreditVisibility";

export {
	filterVisibleCredits,
	isCreditLabelVisible,
	normalizeCreditLabelKey,
} from "./geniusCreditVisibility";

export type GeniusAlbumTrackInfo = {
	trackNumber: number;
	title: string;
	url: string;
};

export type GeniusAlbumSongScrape = {
	songTitle?: string;
	lyrics?: string;
	about?: string;
	credits?: GeniusCredit[];
};

export type GeniusAlbumSongRecordInput = {
	trackNumber: number;
	songTitle: string;
	geniusSongUrl: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
	scrapeState: "ready" | "failed";
	scrapeError?: string;
};

type BuildAlbumSongRecordInputArgs = {
	track: GeniusAlbumTrackInfo;
	scrape?: GeniusAlbumSongScrape;
	errorMessage?: string;
};

type DisplayAlbumInput = {
	albumTitle: string;
	artistName: string;
	zineCoverImageUrl?: string;
	summary?: string;
	albumTitleOverride?: string;
	artistNameOverride?: string;
	frontPageImageUrlOverride?: string;
	summaryOverride?: string;
};

type DisplayAlbum = {
	albumTitle: string;
	artistName: string;
	summary?: string;
	frontPageImageUrl?: string;
};

type DisplaySongInput = {
	songTitle: string;
	lyrics: string;
	about?: string;
	credits?: GeniusCredit[];
	songTitleOverride?: string;
	lyricsOverride?: string;
	aboutOverride?: string;
	durationSecondsOverride?: number;
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
	siteWideHiddenLabelKeys?: string[];
	ignoredLabelKeys?: string[];
};

type DisplaySong = {
	songTitle: string;
	lyrics: string;
	about?: string;
	durationSeconds?: number;
	credits?: GeniusCredit[];
};

export function buildAlbumSongRecordInput({
	track,
	scrape,
	errorMessage,
}: BuildAlbumSongRecordInputArgs): GeniusAlbumSongRecordInput {
	if (!scrape) {
		return {
			trackNumber: track.trackNumber,
			songTitle: track.title,
			geniusSongUrl: track.url,
			lyrics: "",
			about: undefined,
			credits: undefined,
			scrapeState: "failed",
			scrapeError:
				normalizeOptionalString(errorMessage) ?? "Failed to scrape song page",
		};
	}

	const credits = normalizeCredits(scrape.credits);

	return {
		trackNumber: track.trackNumber,
		songTitle: normalizeOptionalString(scrape.songTitle) ?? track.title,
		geniusSongUrl: track.url,
		lyrics: normalizeOptionalString(scrape.lyrics) ?? "",
		about: normalizeOptionalString(scrape.about),
		credits,
		scrapeState: "ready",
		scrapeError: undefined,
	};
}

export function buildDisplayAlbum(album: DisplayAlbumInput): DisplayAlbum {
	return {
		albumTitle:
			normalizeOptionalString(album.albumTitleOverride) ?? album.albumTitle,
		artistName:
			normalizeOptionalString(album.artistNameOverride) ?? album.artistName,
		frontPageImageUrl:
			normalizeOptionalString(album.frontPageImageUrlOverride) ??
			normalizeOptionalString(album.zineCoverImageUrl),
		summary:
			normalizeOptionalString(album.summaryOverride) ??
			normalizeOptionalString(album.summary),
	};
}

export function buildDisplaySong(song: DisplaySongInput): DisplaySong {
	return {
		songTitle:
			normalizeOptionalString(song.songTitleOverride) ?? song.songTitle,
		lyrics: normalizeOptionalString(song.lyricsOverride) ?? song.lyrics,
		about:
			normalizeOptionalString(song.aboutOverride) ??
			normalizeOptionalString(song.about),
		durationSeconds: song.durationSecondsOverride,
		credits: filterCreditsByVisibility(song.credits, {
			hiddenCreditLabels: song.hiddenCreditLabels,
			shownCreditLabels: song.shownCreditLabels,
			siteWideHiddenLabelKeys: song.siteWideHiddenLabelKeys,
			ignoredLabelKeys: song.ignoredLabelKeys,
		}),
	};
}

export function buildCreditVisibilityState(input: {
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
	siteWideHiddenLabelKeys?: string[];
	ignoredLabelKeys?: string[];
}): CreditVisibilityState {
	return {
		hiddenCreditLabels: input.hiddenCreditLabels,
		shownCreditLabels: input.shownCreditLabels,
		siteWideHiddenLabelKeys: input.siteWideHiddenLabelKeys,
		ignoredLabelKeys: input.ignoredLabelKeys,
	};
}

export function hasRenderableLyrics(
	lyrics: string,
	options?: { showSectionLabels?: boolean },
): boolean {
	const showSectionLabels = options?.showSectionLabels ?? true;
	if (lyrics.trim().length === 0) return false;

	for (const line of lyrics.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		if (/^\[.*\]$/.test(trimmed)) {
			const inner = trimmed.slice(1, -1).trim();
			if (/^instrumental\b/i.test(inner)) continue;
			if (!showSectionLabels) continue;
		}

		return true;
	}

	return false;
}

export function hasDisplayLyrics(lyrics: string): boolean {
	return hasRenderableLyrics(lyrics, { showSectionLabels: true });
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const normalized = value?.trim();

	return normalized ? normalized : undefined;
}

function normalizeCredits(
	credits: GeniusCredit[] | undefined,
): GeniusCredit[] | undefined {
	return credits && credits.length > 0 ? credits : undefined;
}

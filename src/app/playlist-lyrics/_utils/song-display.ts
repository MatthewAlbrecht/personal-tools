import type { ZineSongDisplayInput } from "~/lib/zine/zine-types";

export type { ZineSongDisplayInput } from "~/lib/zine/zine-types";

/** 1-based track number from sorted playlist index (not stored DB position). */
export function getPlaylistDisplayTrackNumber(sortedIndex: number): number {
	return sortedIndex + 1;
}

export function getZineSongMetadataParts(
	song: Pick<ZineSongDisplayInput, "artistName" | "albumTitle" | "albumYear">,
	options: {
		showArtist: boolean;
		showAlbum: boolean;
		showYear: boolean;
	},
): string[] {
	const parts: string[] = [];

	if (options.showArtist && song.artistName) {
		parts.push(song.artistName);
	}

	if (options.showAlbum && song.albumTitle) {
		parts.push(song.albumTitle);
	}

	if (options.showYear && song.albumYear) {
		parts.push(song.albumYear);
	}

	return parts;
}

export function buildZineSongDisplayInput({
	id,
	position,
	songTitleOverride,
	artistNameOverride,
	albumTitleOverride,
	albumArtUrlOverride,
	userNote,
	introContent,
	durationSecondsOverride,
	hiddenCreditLabels,
	shownCreditLabels,
	scrape,
}: {
	id: string;
	position: number;
	songTitleOverride?: string;
	artistNameOverride?: string;
	albumTitleOverride?: string;
	albumArtUrlOverride?: string;
	userNote?: string;
	introContent?: string;
	durationSecondsOverride?: number;
	scrape?: {
		songTitle: string;
		artistName: string;
		albumTitle?: string;
		albumYear?: string;
		albumArtUrl?: string;
		lyrics: string;
		about?: string;
		credits?: ZineSongDisplayInput["credits"];
	};
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
}): ZineSongDisplayInput {
	const albumMetadata = splitAlbumTitleAndYear(
		albumTitleOverride ?? scrape?.albumTitle,
	);

	return {
		id,
		position,
		title: songTitleOverride ?? scrape?.songTitle ?? "Untitled song",
		artistName: artistNameOverride ?? scrape?.artistName ?? "Unknown artist",
		albumTitle: albumMetadata.title,
		albumYear: scrape?.albumYear ?? albumMetadata.year,
		albumArtUrl: albumArtUrlOverride?.trim() || scrape?.albumArtUrl?.trim(),
		durationSeconds: durationSecondsOverride,
		userNote,
		introContent,
		about: scrape?.about,
		lyrics: scrape?.lyrics ?? "",
		credits: scrape?.credits,
		hiddenCreditLabels,
		shownCreditLabels,
	};
}

function splitAlbumTitleAndYear(albumTitle: string | undefined): {
	title: string | undefined;
	year: string | undefined;
} {
	if (!albumTitle) {
		return { title: undefined, year: undefined };
	}

	let year: string | undefined;
	const title = albumTitle
		.replace(/\(([^)]*)\)/g, (_match, parenthetical: string) => {
			const trimmedParenthetical = parenthetical.trim();
			if (!year && /^\d{4}$/.test(trimmedParenthetical)) {
				year = trimmedParenthetical;
			}

			return "";
		})
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		title: title || undefined,
		year,
	};
}

import type { ZineInsideBackLayoutSettings } from "./zine-inside-back-layout";
import { resolveZineInsideBackLayoutSettings } from "./zine-inside-back-layout";
import {
	type ZineInsideBackSection,
	hasInsideBackContent,
} from "./zine-inside-back-sections";
import { buildCollapsedSongPages } from "./zine-instrumental-pages";
import type { ZineIntroSettings } from "./zine-intro-layout";
import type { ZineSongDisplayInput } from "./zine-types";

export type ZineSongInput = ZineSongDisplayInput;

export type ZineCoverPage = {
	kind: "cover";
	playlistTitle: string;
	artistName?: string;
};

export type ZineSongPageData = {
	songId: string;
	position: number;
	title: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	durationSeconds?: number;
	userNote?: string;
	introContent?: string;
	about?: string;
	lyrics: string;
	credits?: ZineSongDisplayInput["credits"];
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
	collapseWithPrevious?: boolean;
};

export type ZineSongPage = {
	kind: "song";
} & ZineSongPageData;

export type ZineInstrumentalGroupPage = {
	kind: "instrumental-group";
	songs: ZineSongPageData[];
};

export type ZineSongGroupPage = {
	kind: "song-group";
	songs: ZineSongPageData[];
};

export type ZineIntroPageModel = {
	kind: "intro";
	content: string;
	settings: ZineIntroSettings;
};

export type ZineBlankPage = {
	kind: "blank";
};

export type ZineBackCoverPage = {
	kind: "back-cover";
};

export type ZineInsideBackPage = {
	kind: "inside-back";
	sections: ZineInsideBackSection[];
	settings: ZineInsideBackLayoutSettings;
};

export type ZinePage =
	| ZineCoverPage
	| ZineIntroPageModel
	| ZineSongPage
	| ZineInstrumentalGroupPage
	| ZineSongGroupPage
	| ZineBlankPage
	| ZineInsideBackPage
	| ZineBackCoverPage;

function mapSongInputToPageData(song: ZineSongInput): ZineSongPageData {
	return {
		songId: song.id,
		position: song.position,
		title: song.title,
		artistName: song.artistName,
		albumTitle: song.albumTitle,
		albumYear: song.albumYear,
		albumArtUrl: song.albumArtUrl,
		durationSeconds: song.durationSeconds,
		userNote: song.userNote,
		introContent: song.introContent,
		about: song.about,
		lyrics: song.lyrics,
		credits: song.credits,
		hiddenCreditLabels: song.hiddenCreditLabels,
		shownCreditLabels: song.shownCreditLabels,
		collapseWithPrevious: song.collapseWithPrevious,
	};
}

export function buildZinePages({
	playlistTitle,
	coverArtistName,
	songs,
	intro,
	insideBack,
	collapseInstrumentalTracks = true,
	showSectionLabels = false,
}: {
	playlistTitle: string;
	coverArtistName?: string;
	songs: ZineSongInput[];
	intro?: {
		content: string;
		settings: ZineIntroSettings;
		includeWhenEmpty?: boolean;
	};
	insideBack?: {
		sections: ZineInsideBackSection[];
		settings?: Partial<ZineInsideBackLayoutSettings>;
		includeWhenEmpty?: boolean;
	};
	collapseInstrumentalTracks?: boolean;
	showSectionLabels?: boolean;
}): ZinePage[] {
	const resolvedCoverArtistName = coverArtistName?.trim() || undefined;
	const sortedSongs = [...songs].sort(
		(left, right) => left.position - right.position,
	);

	const pages: ZinePage[] = [
		{
			kind: "cover",
			playlistTitle,
			artistName: resolvedCoverArtistName,
		},
	];

	if (
		intro &&
		(intro.content.trim() !== "" || intro.includeWhenEmpty === true)
	) {
		pages.push({
			kind: "intro",
			content: intro.content,
			settings: intro.settings,
		});
	}

	const collapsedSongPages = buildCollapsedSongPages(
		sortedSongs.map(mapSongInputToPageData),
		{
			collapseInstrumentalTracks,
			showSectionLabels,
		},
	);

	for (const songPage of collapsedSongPages) {
		if (songPage.kind === "song") {
			pages.push({ kind: "song", ...songPage.data });
			continue;
		}

		if (songPage.kind === "song-group") {
			pages.push({
				kind: "song-group",
				songs: songPage.songs,
			});
			continue;
		}

		pages.push({
			kind: "instrumental-group",
			songs: songPage.songs,
		});
	}

	const shouldIncludeInsideBack =
		insideBack &&
		(hasInsideBackContent(insideBack.sections) ||
			insideBack.includeWhenEmpty === true);

	const endPageCount = (shouldIncludeInsideBack ? 1 : 0) + 1;
	const blanksNeeded = (4 - ((pages.length + endPageCount) % 4)) % 4;

	for (let index = 0; index < blanksNeeded; index += 1) {
		pages.push({ kind: "blank" });
	}

	if (shouldIncludeInsideBack) {
		pages.push({
			kind: "inside-back",
			sections: insideBack.sections,
			settings: resolveZineInsideBackLayoutSettings(insideBack.settings),
		});
	}

	pages.push({ kind: "back-cover" });

	return pages;
}

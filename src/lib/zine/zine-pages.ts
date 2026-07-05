import type { ZineIntroSettings } from "./zine-intro-layout";
import type { ZineSongDisplayInput } from "./zine-types";

export type ZineSongInput = ZineSongDisplayInput;

export type ZineCoverPage = {
	kind: "cover";
	playlistTitle: string;
	artistName?: string;
};

export type ZineSongPage = {
	kind: "song";
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

export type ZinePage =
	| ZineCoverPage
	| ZineIntroPageModel
	| ZineSongPage
	| ZineBlankPage
	| ZineBackCoverPage;

export function buildZinePages({
	playlistTitle,
	coverArtistName,
	songs,
	intro,
}: {
	playlistTitle: string;
	coverArtistName?: string;
	songs: ZineSongInput[];
	intro?: {
		content: string;
		settings: ZineIntroSettings;
		includeWhenEmpty?: boolean;
	};
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

	pages.push(
		...sortedSongs.map((song) => ({
			kind: "song" as const,
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
		})),
		{ kind: "back-cover" as const },
	);

	while (pages.length % 4 !== 0) {
		pages.splice(pages.length - 1, 0, { kind: "blank" });
	}

	return pages;
}

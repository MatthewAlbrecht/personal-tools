import type { ZineSongDisplayInput } from "./zine-types";

export type ZineSongInput = ZineSongDisplayInput;

export type ZineCoverPage = {
	kind: "cover";
	playlistTitle: string;
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
};

export type ZineBlankPage = {
	kind: "blank";
};

export type ZineBackCoverPage = {
	kind: "back-cover";
};

export type ZinePage =
	| ZineCoverPage
	| ZineSongPage
	| ZineBlankPage
	| ZineBackCoverPage;

export function buildZinePages({
	playlistTitle,
	songs,
}: {
	playlistTitle: string;
	songs: ZineSongInput[];
}): ZinePage[] {
	const sortedSongs = [...songs].sort(
		(left, right) => left.position - right.position,
	);

	const pages: ZinePage[] = [
		{
			kind: "cover",
			playlistTitle,
		},
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
		})),
		{ kind: "back-cover" },
	];

	while (pages.length % 4 !== 0) {
		pages.splice(pages.length - 1, 0, { kind: "blank" });
	}

	return pages;
}

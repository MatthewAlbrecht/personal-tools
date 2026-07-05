import type { ZineCredit, ZineSongDisplayInput } from "./zine-types";

export function buildAlbumZineSongInput({
	album,
	song,
}: {
	album: { albumTitle: string; artistName: string };
	song: {
		id: string;
		trackNumber: number;
		songTitle: string;
		lyrics: string;
		about?: string;
		credits?: ZineCredit[];
		songTitleOverride?: string;
		lyricsOverride?: string;
		aboutOverride?: string;
		durationSecondsOverride?: number;
		hiddenCreditLabels?: string[];
		shownCreditLabels?: string[];
	};
}): ZineSongDisplayInput {
	const trackIntro =
		song.aboutOverride?.trim() || song.about?.trim() || undefined;

	return {
		id: song.id,
		position: song.trackNumber,
		title: song.songTitleOverride?.trim() || song.songTitle || "Untitled song",
		artistName: album.artistName || "Unknown artist",
		albumTitle: album.albumTitle || undefined,
		albumYear: undefined,
		albumArtUrl: undefined,
		durationSeconds: song.durationSecondsOverride,
		userNote: undefined,
		introContent: trackIntro,
		lyrics: (song.lyricsOverride?.trim() || song.lyrics) ?? "",
		credits: song.credits,
		hiddenCreditLabels: song.hiddenCreditLabels,
		shownCreditLabels: song.shownCreditLabels,
	};
}

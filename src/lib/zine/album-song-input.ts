import type { ZinePageRecommendation } from "./zine-page-recommendations";
import type { ZineCredit, ZineSongDisplayInput } from "./zine-types";

export function buildAlbumZineSongInput({
	album,
	song,
}: {
	album: { albumTitle: string; artistName: string; albumArtUrl?: string };
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
		zinePageRecommendations?: ZinePageRecommendation[];
		albumArtUrlOverride?: string;
		trackImageUrl?: string | null;
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
		albumArtUrl: resolveAlbumSongArtUrl({
			albumArtUrl: album.albumArtUrl,
			albumArtUrlOverride: song.albumArtUrlOverride,
			trackImageUrl: song.trackImageUrl,
		}),
		durationSeconds: song.durationSecondsOverride,
		userNote: undefined,
		introContent: trackIntro,
		lyrics: (song.lyricsOverride?.trim() || song.lyrics) ?? "",
		credits: song.credits,
		hiddenCreditLabels: song.hiddenCreditLabels,
		shownCreditLabels: song.shownCreditLabels,
		pageRecommendations: song.zinePageRecommendations,
	};
}

// A picked override wins, then the generated track image, then the album cover.
// An override that only repeats the cover (the editor used to save it) counts as none.
export function resolveAlbumSongArtUrl({
	albumArtUrl,
	albumArtUrlOverride,
	trackImageUrl,
}: {
	albumArtUrl?: string;
	albumArtUrlOverride?: string;
	trackImageUrl?: string | null;
}): string | undefined {
	return (
		resolvePickedArtOverride(albumArtUrlOverride, albumArtUrl) ||
		trackImageUrl?.trim() ||
		albumArtUrl?.trim() ||
		undefined
	);
}

export function resolvePickedArtOverride(
	albumArtUrlOverride: string | undefined,
	albumArtUrl: string | undefined,
): string | undefined {
	const override = albumArtUrlOverride?.trim();
	if (!override || override === albumArtUrl?.trim()) return undefined;
	return override;
}

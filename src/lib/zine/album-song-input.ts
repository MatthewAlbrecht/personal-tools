import type { ZineSongDisplayInput } from "./zine-types";

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
	};
}): ZineSongDisplayInput {
	return {
		id: song.id,
		position: song.trackNumber,
		title: song.songTitle || "Untitled song",
		artistName: album.artistName || "Unknown artist",
		albumTitle: album.albumTitle || undefined,
		albumYear: undefined,
		albumArtUrl: undefined,
		durationSeconds: undefined,
		userNote: undefined,
		about: song.about,
		lyrics: song.lyrics ?? "",
	};
}

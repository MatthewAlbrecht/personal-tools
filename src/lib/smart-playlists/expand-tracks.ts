import type { TrackSelection } from "./types";

export function expandAlbumsToTrackUris(
	albums: Array<{ albumId: string; trackUris: string[] }>,
	trackSelection: TrackSelection,
): string[] {
	if (trackSelection.mode === "allTracks") {
		return albums.flatMap((album) => album.trackUris);
	}

	throw new Error(
		`Unknown track selection mode: ${(trackSelection as { mode: string }).mode}`,
	);
}

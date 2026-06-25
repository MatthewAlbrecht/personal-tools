const MAX_ALBUMS = 50;

export type PlaylistTrackAlbumRef = {
	albumId: string | undefined;
};

export type ExtractAlbumIdsResult = {
	albumIds: string[];
	duplicatesSkipped: number;
	totalTracks: number;
	truncated: number;
};

export function extractOrderedUniqueAlbumIds(
	tracks: PlaylistTrackAlbumRef[],
): ExtractAlbumIdsResult {
	const seen = new Set<string>();
	const albumIds: string[] = [];
	let duplicatesSkipped = 0;

	for (const track of tracks) {
		const albumId = track.albumId;
		if (!albumId) continue;
		if (seen.has(albumId)) {
			duplicatesSkipped += 1;
			continue;
		}
		seen.add(albumId);
		albumIds.push(albumId);
	}

	const truncated = Math.max(0, albumIds.length - MAX_ALBUMS);
	const capped = albumIds.slice(0, MAX_ALBUMS);

	return {
		albumIds: capped,
		duplicatesSkipped,
		totalTracks: tracks.length,
		truncated,
	};
}

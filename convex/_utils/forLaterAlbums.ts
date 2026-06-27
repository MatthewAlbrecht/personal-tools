export type ForLaterPlaylistTrackInput = {
	added_at: string;
	track: {
		id: string;
		duration_ms?: number;
		album: {
			id: string;
		};
	} | null;
};

export type ForLaterPlaylistAlbumInput = {
	spotifyAlbumId: string;
	sourceTrackIds: string[];
	totalDurationMs: number;
	playlistAddedAt?: number;
};

export function normalizeForLaterAlbumTitle(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/\s+\((deluxe|explicit|clean|remaster(ed)?|bonus).*\)$/i, "");
}

export function normalizeForLaterArtistName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getForLaterArtistKeys(
	artists: Array<{ name: string }>,
): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();

	for (const artist of artists) {
		const key = normalizeForLaterArtistName(artist.name);
		if (!key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		keys.push(key);
	}

	return keys;
}

export function buildForLaterPlaylistAlbums(
	items: ForLaterPlaylistTrackInput[],
): ForLaterPlaylistAlbumInput[] {
	const albums = new Map<string, ForLaterPlaylistAlbumInput>();

	for (const item of items) {
		if (!item.track) {
			continue;
		}

		const spotifyAlbumId = item.track.album.id;
		const trackDurationMs = item.track.duration_ms ?? 0;
		const addedAt = Date.parse(item.added_at);
		const playlistAddedAt = Number.isNaN(addedAt) ? undefined : addedAt;
		const existing = albums.get(spotifyAlbumId);

		if (existing) {
			existing.sourceTrackIds.push(item.track.id);
			existing.totalDurationMs += trackDurationMs;
			if (
				playlistAddedAt !== undefined &&
				(existing.playlistAddedAt === undefined ||
					playlistAddedAt < existing.playlistAddedAt)
			) {
				existing.playlistAddedAt = playlistAddedAt;
			}
			continue;
		}

		albums.set(spotifyAlbumId, {
			spotifyAlbumId,
			sourceTrackIds: [item.track.id],
			totalDurationMs: trackDurationMs,
			playlistAddedAt,
		});
	}

	return [...albums.values()]
		.map((album) => ({
			...album,
			sourceTrackIds: [...new Set(album.sourceTrackIds)].sort(),
		}))
		.sort((a, b) => a.spotifyAlbumId.localeCompare(b.spotifyAlbumId));
}

export function findRemovedSpotifyAlbumIds({
	activeSpotifyAlbumIds,
	seenSpotifyAlbumIds,
}: {
	activeSpotifyAlbumIds: string[];
	seenSpotifyAlbumIds: string[];
}): string[] {
	const seen = new Set(seenSpotifyAlbumIds);
	return activeSpotifyAlbumIds.filter(
		(spotifyAlbumId) => !seen.has(spotifyAlbumId),
	);
}

export type PlaylistSpotifySyncItem = {
	itemId: string;
	title: string;
};

export type PlaylistSpotifySyncTrack = {
	name: string;
	durationMs: number;
	albumArtUrl?: string;
};

export type PlaylistSpotifySyncMatch = {
	itemId: string;
	durationSeconds: number;
	albumArtUrl?: string;
};

export type PlaylistSpotifySyncResult = {
	matches: PlaylistSpotifySyncMatch[];
	unmatchedItemCount: number;
	unmatchedTrackCount: number;
};

export function normalizePlaylistTrackTitleForMatch(title: string): string {
	return title.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

/** Strip remaster / live / feat. parentheticals for a second-pass title match. */
export function stripTrackTitleDecorations(title: string): string {
	return normalizePlaylistTrackTitleForMatch(
		title
			.replace(/\([^)]*\)/g, " ")
			.replace(/\[[^\]]*]/g, " ")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

export function matchPlaylistItemsToSpotifyTracks({
	items,
	tracks,
}: {
	items: PlaylistSpotifySyncItem[];
	tracks: PlaylistSpotifySyncTrack[];
}): PlaylistSpotifySyncResult {
	const available = tracks
		.filter(
			(track) =>
				track.name.trim().length > 0 &&
				Number.isFinite(track.durationMs) &&
				track.durationMs > 0,
		)
		.map((track) => ({
			normalized: normalizePlaylistTrackTitleForMatch(track.name),
			stripped: stripTrackTitleDecorations(track.name),
			durationSeconds: Math.round(track.durationMs / 1000),
			albumArtUrl: track.albumArtUrl?.trim() || undefined,
			used: false,
		}));

	const matches: PlaylistSpotifySyncMatch[] = [];

	for (const item of items) {
		const title = item.title.trim();
		if (!title) continue;

		const normalized = normalizePlaylistTrackTitleForMatch(title);
		const stripped = stripTrackTitleDecorations(title);

		const exact = available.find(
			(track) => !track.used && track.normalized === normalized,
		);
		const loose =
			exact ??
			available.find((track) => !track.used && track.stripped === stripped);

		if (!loose) continue;

		loose.used = true;
		matches.push({
			itemId: item.itemId,
			durationSeconds: loose.durationSeconds,
			albumArtUrl: loose.albumArtUrl,
		});
	}

	return {
		matches,
		unmatchedItemCount: items.length - matches.length,
		unmatchedTrackCount: available.filter((track) => !track.used).length,
	};
}

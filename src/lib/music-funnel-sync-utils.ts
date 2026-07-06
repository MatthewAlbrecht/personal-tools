import type { PlaylistTrackItem } from "~/lib/spotify";

export type MusicFunnelArtist = {
	spotifyArtistId: string;
	name: string;
};

export type NormalizedMusicFunnelTrack = {
	spotifyTrackId: string;
	trackName: string;
	trackUri: string;
	primaryArtistName: string;
	artists: MusicFunnelArtist[];
	spotifyAlbumId: string;
	albumName: string;
	albumImageUrl?: string;
	playlistAddedAt?: number;
};

export type MusicFunnelEncounterLike = NormalizedMusicFunnelTrack & {
	sourceId: string;
	firstSeenAt: number;
};

export type RepeatSummary = {
	sourceIds: string[];
	sourceCount: number;
	firstSeenAt: number;
	latestSeenAt: number;
};

export type TrackRepeatSummary = RepeatSummary & {
	spotifyTrackId: string;
	trackName: string;
	primaryArtistName: string;
	albumName: string;
	albumImageUrl?: string;
};

export type AlbumRepeatSummary = RepeatSummary & {
	spotifyAlbumId: string;
	albumName: string;
	primaryArtistName: string;
	albumImageUrl?: string;
	contributingTrackCount: number;
};

export type ArtistRepeatSummary = RepeatSummary & {
	spotifyArtistId: string;
	name: string;
	contributingTrackCount: number;
};

export type PlannedPlaylistWrite = {
	spotifyTrackId: string;
	trackUri: string;
	reason: "first_seen" | "second_source_repeat";
};

type RepeatTiming = {
	firstSeenAt: number;
	latestSeenAt: number;
};

type ArtistEncounterRow = {
	name: string;
	sourceId: string;
	spotifyTrackId: string;
	firstSeenAt: number;
};

export function normalizePlaylistTrack(
	item: PlaylistTrackItem,
): NormalizedMusicFunnelTrack | null {
	if (!item.track?.id) {
		return null;
	}

	const artists = item.track.artists.map((artist) => ({
		spotifyArtistId: artist.id,
		name: artist.name,
	}));
	const parsedAddedAt = Date.parse(item.added_at);
	const normalized: NormalizedMusicFunnelTrack = {
		spotifyTrackId: item.track.id,
		trackName: item.track.name,
		trackUri: `spotify:track:${item.track.id}`,
		primaryArtistName: artists[0]?.name ?? "Unknown Artist",
		artists,
		spotifyAlbumId: item.track.album.id,
		albumName: item.track.album.name,
	};
	const albumImageUrl = item.track.album.images[0]?.url;
	if (albumImageUrl) {
		normalized.albumImageUrl = albumImageUrl;
	}
	if (!Number.isNaN(parsedAddedAt)) {
		normalized.playlistAddedAt = parsedAddedAt;
	}

	return normalized;
}

export function computeTrackRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): TrackRepeatSummary[] {
	const rowsByTrackId = new Map<string, MusicFunnelEncounterLike[]>();
	for (const encounter of encounters) {
		const rows = rowsByTrackId.get(encounter.spotifyTrackId) ?? [];
		rows.push(encounter);
		rowsByTrackId.set(encounter.spotifyTrackId, rows);
	}

	return [...rowsByTrackId.entries()]
		.map(([spotifyTrackId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			const first = rows[0];
			if (!first || sourceIds.length < 2) {
				return null;
			}

			const summary: TrackRepeatSummary = {
				spotifyTrackId,
				trackName: first.trackName,
				primaryArtistName: first.primaryArtistName,
				albumName: first.albumName,
				sourceIds,
				sourceCount: sourceIds.length,
				...getRepeatTiming(rows),
			};
			if (first.albumImageUrl) {
				summary.albumImageUrl = first.albumImageUrl;
			}
			return summary;
		})
		.filter((summary): summary is TrackRepeatSummary => summary !== null)
		.sort(sortRepeatSummaries);
}

export function computeAlbumRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): AlbumRepeatSummary[] {
	const rowsByAlbumId = new Map<string, MusicFunnelEncounterLike[]>();
	for (const encounter of encounters) {
		const rows = rowsByAlbumId.get(encounter.spotifyAlbumId) ?? [];
		rows.push(encounter);
		rowsByAlbumId.set(encounter.spotifyAlbumId, rows);
	}

	return [...rowsByAlbumId.entries()]
		.map(([spotifyAlbumId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			const first = rows[0];
			if (!first || sourceIds.length < 2) {
				return null;
			}

			const summary: AlbumRepeatSummary = {
				spotifyAlbumId,
				albumName: first.albumName,
				primaryArtistName: first.primaryArtistName,
				sourceIds,
				sourceCount: sourceIds.length,
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId))
					.size,
				...getRepeatTiming(rows),
			};
			if (first.albumImageUrl) {
				summary.albumImageUrl = first.albumImageUrl;
			}
			return summary;
		})
		.filter((summary): summary is AlbumRepeatSummary => summary !== null)
		.sort(sortRepeatSummaries);
}

export function computeArtistRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): ArtistRepeatSummary[] {
	const rowsByArtistId = new Map<string, ArtistEncounterRow[]>();
	for (const encounter of encounters) {
		for (const artist of encounter.artists) {
			const rows = rowsByArtistId.get(artist.spotifyArtistId) ?? [];
			rows.push({
				name: artist.name,
				sourceId: encounter.sourceId,
				spotifyTrackId: encounter.spotifyTrackId,
				firstSeenAt: encounter.firstSeenAt,
			});
			rowsByArtistId.set(artist.spotifyArtistId, rows);
		}
	}

	return [...rowsByArtistId.entries()]
		.map(([spotifyArtistId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			const first = rows[0];
			if (!first || sourceIds.length < 2) {
				return null;
			}

			return {
				spotifyArtistId,
				name: first.name,
				sourceIds,
				sourceCount: sourceIds.length,
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId))
					.size,
				...getRepeatTiming(rows),
			};
		})
		.filter((summary): summary is ArtistRepeatSummary => summary !== null)
		.sort(sortRepeatSummaries);
}

export function excludeAlreadyWrittenPlaylistWrites(
	writes: PlannedPlaylistWrite[],
	alreadyWrittenTrackIds: ReadonlySet<string>,
): PlannedPlaylistWrite[] {
	return writes.filter(
		(write) => !alreadyWrittenTrackIds.has(write.spotifyTrackId),
	);
}

export function planPlaylistWrites({
	candidateEncounters,
	totalSourceCountsByTrackId,
	alreadyWrittenMainTrackIds,
	alreadyWrittenRepeatTrackIds,
}: {
	candidateEncounters: MusicFunnelEncounterLike[];
	totalSourceCountsByTrackId: Map<string, number>;
	alreadyWrittenMainTrackIds: Set<string>;
	alreadyWrittenRepeatTrackIds: Set<string>;
}): {
	mainWrites: PlannedPlaylistWrite[];
	repeatWrites: PlannedPlaylistWrite[];
} {
	const mainWrites: PlannedPlaylistWrite[] = [];
	const repeatWrites: PlannedPlaylistWrite[] = [];
	const plannedMainTrackIds = new Set<string>();
	const plannedRepeatTrackIds = new Set<string>();

	for (const encounter of candidateEncounters) {
		const totalSourceCount =
			totalSourceCountsByTrackId.get(encounter.spotifyTrackId) ?? 0;

		if (
			totalSourceCount >= 1 &&
			!alreadyWrittenMainTrackIds.has(encounter.spotifyTrackId) &&
			!plannedMainTrackIds.has(encounter.spotifyTrackId)
		) {
			mainWrites.push({
				spotifyTrackId: encounter.spotifyTrackId,
				trackUri: encounter.trackUri,
				reason: "first_seen",
			});
			plannedMainTrackIds.add(encounter.spotifyTrackId);
		}

		if (
			totalSourceCount >= 2 &&
			!alreadyWrittenRepeatTrackIds.has(encounter.spotifyTrackId) &&
			!plannedRepeatTrackIds.has(encounter.spotifyTrackId)
		) {
			repeatWrites.push({
				spotifyTrackId: encounter.spotifyTrackId,
				trackUri: encounter.trackUri,
				reason: "second_source_repeat",
			});
			plannedRepeatTrackIds.add(encounter.spotifyTrackId);
		}
	}

	return { mainWrites, repeatWrites };
}

export function chunkSpotifyUris(uris: string[], chunkSize = 100): string[][] {
	const chunks: string[][] = [];
	for (let index = 0; index < uris.length; index += chunkSize) {
		chunks.push(uris.slice(index, index + chunkSize));
	}
	return chunks;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}

function getRepeatTiming(rows: Array<{ firstSeenAt: number }>): RepeatTiming {
	const seenAtValues = rows.map((row) => row.firstSeenAt);
	return {
		firstSeenAt: Math.min(...seenAtValues),
		latestSeenAt: Math.max(...seenAtValues),
	};
}

function sortRepeatSummaries(a: RepeatSummary, b: RepeatSummary): number {
	return b.sourceCount - a.sourceCount || b.latestSeenAt - a.latestSeenAt;
}

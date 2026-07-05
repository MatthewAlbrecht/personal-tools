import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type SpotifyAlbumTrackDuration = {
	trackNumber?: number;
	trackName: string;
	durationSeconds: number;
};

export type SyncTrackDurationsResult = {
	updatedCount: number;
	skippedCount: number;
	unmatchedCount: number;
	reason: string;
	updatedSongs: Array<{
		songId: Id<"geniusSongs">;
		durationSeconds: number;
	}>;
	matchedSongs: Array<{
		songId: Id<"geniusSongs">;
		durationSeconds: number;
	}>;
};

type GeniusSongForDurationMatch = {
	_id: Id<"geniusSongs">;
	trackNumber: number;
	songTitle: string;
	songTitleOverride?: string;
	durationSecondsOverride?: number;
};

export function normalizeTrackTitleForMatch(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[’']/g, "'")
		.replace(/\s+/g, " ");
}

export function trackDurationKey(track: SpotifyAlbumTrackDuration): string {
	if (track.trackNumber != null) {
		return `n:${track.trackNumber}`;
	}

	return `t:${normalizeTrackTitleForMatch(track.trackName)}`;
}

export function mergeSpotifyAlbumTrackDurations(
	fromCanonical: SpotifyAlbumTrackDuration[],
	fromRawData: SpotifyAlbumTrackDuration[],
): SpotifyAlbumTrackDuration[] {
	const byKey = new Map<string, SpotifyAlbumTrackDuration>();

	for (const track of fromRawData) {
		byKey.set(trackDurationKey(track), track);
	}

	for (const track of fromCanonical) {
		byKey.set(trackDurationKey(track), track);
	}

	return [...byKey.values()].sort(
		(left, right) =>
			(left.trackNumber ?? Number.MAX_SAFE_INTEGER) -
			(right.trackNumber ?? Number.MAX_SAFE_INTEGER),
	);
}

export function matchGeniusSongToSpotifyTrack(
	song: Pick<
		GeniusSongForDurationMatch,
		"trackNumber" | "songTitle" | "songTitleOverride"
	>,
	spotifyTracks: SpotifyAlbumTrackDuration[],
): SpotifyAlbumTrackDuration | null {
	const displayTitle =
		song.songTitleOverride?.trim() || song.songTitle.trim() || song.songTitle;
	const normalizedTitle = normalizeTrackTitleForMatch(displayTitle);

	const byTrackNumber = spotifyTracks.find(
		(track) => track.trackNumber === song.trackNumber,
	);
	if (byTrackNumber) {
		return byTrackNumber;
	}

	for (const track of spotifyTracks) {
		if (normalizeTrackTitleForMatch(track.trackName) === normalizedTitle) {
			return track;
		}
	}

	return null;
}

export function parseSpotifyAlbumRawDataTracks(
	rawData: string | undefined,
): SpotifyAlbumTrackDuration[] {
	if (!rawData) {
		return [];
	}

	try {
		const parsed = JSON.parse(rawData) as {
			tracks?: {
				items?: Array<{
					name?: string;
					track_number?: number;
					duration_ms?: number;
				}>;
			};
		};

		return (parsed.tracks?.items ?? [])
			.filter(
				(item) =>
					typeof item.name === "string" &&
					item.name.length > 0 &&
					typeof item.duration_ms === "number" &&
					item.duration_ms > 0,
			)
			.map((item) => ({
				trackNumber: item.track_number,
				trackName: item.name as string,
				durationSeconds: Math.round(item.duration_ms as number / 1000),
			}));
	} catch {
		return [];
	}
}

export async function loadSpotifyAlbumTrackDurations(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
	spotifyAlbum: Doc<"spotifyAlbums">,
): Promise<SpotifyAlbumTrackDuration[]> {
	const canonicalTracks = await ctx.db
		.query("spotifyTracksCanonical")
		.withIndex("by_spotifyAlbumId", (q) =>
			q.eq("spotifyAlbumId", spotifyAlbum.spotifyAlbumId),
		)
		.collect();

	const fromCanonical = canonicalTracks
		.filter(
			(track) =>
				typeof track.durationMs === "number" && track.durationMs > 0,
		)
		.map((track) => ({
			trackNumber: track.trackNumber,
			trackName: track.trackName,
			durationSeconds: Math.round(track.durationMs as number / 1000),
		}));

	const fromRawData = parseSpotifyAlbumRawDataTracks(spotifyAlbum.rawData);

	return mergeSpotifyAlbumTrackDurations(fromCanonical, fromRawData);
}

export async function syncGeniusAlbumTrackDurationsFromSpotify(
	ctx: MutationCtx,
	args: { albumId: Id<"geniusAlbums"> },
): Promise<SyncTrackDurationsResult> {
	const album = await ctx.db.get(args.albumId);
	if (!album?.spotifyAlbumConvexId) {
		return emptySyncResult("No Spotify album is mapped to this lyrics album.");
	}

	const spotifyAlbum = await ctx.db.get(album.spotifyAlbumConvexId);
	if (!spotifyAlbum) {
		return emptySyncResult("Mapped Spotify album was not found.");
	}

	const spotifyTracks = await loadSpotifyAlbumTrackDurations(ctx, spotifyAlbum);
	if (spotifyTracks.length === 0) {
		return emptySyncResult(
			"No Spotify track durations are available for this album. Fetch track details from Spotify first.",
		);
	}

	const songs = await ctx.db
		.query("geniusSongs")
		.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
		.collect();
	songs.sort((left, right) => left.trackNumber - right.trackNumber);

	let updatedCount = 0;
	let skippedCount = 0;
	let unmatchedCount = 0;
	const updatedSongs: SyncTrackDurationsResult["updatedSongs"] = [];
	const matchedSongs: SyncTrackDurationsResult["matchedSongs"] = [];

	for (const song of songs) {
		const match = matchGeniusSongToSpotifyTrack(song, spotifyTracks);
		if (!match) {
			unmatchedCount += 1;
			continue;
		}

		matchedSongs.push({
			songId: song._id,
			durationSeconds: match.durationSeconds,
		});

		if (
			typeof song.durationSecondsOverride === "number" &&
			song.durationSecondsOverride === match.durationSeconds
		) {
			skippedCount += 1;
			continue;
		}

		await ctx.db.patch(song._id, {
			durationSecondsOverride: match.durationSeconds,
		});
		updatedCount += 1;
		updatedSongs.push({
			songId: song._id,
			durationSeconds: match.durationSeconds,
		});
	}

	return {
		updatedCount,
		skippedCount,
		unmatchedCount,
		reason: buildSyncTrackDurationsReason({
			updatedCount,
			skippedCount,
			unmatchedCount,
			totalSongs: songs.length,
		}),
		updatedSongs,
		matchedSongs,
	};
}

function emptySyncResult(reason: string): SyncTrackDurationsResult {
	return {
		updatedCount: 0,
		skippedCount: 0,
		unmatchedCount: 0,
		reason,
		updatedSongs: [],
		matchedSongs: [],
	};
}

function buildSyncTrackDurationsReason(args: {
	updatedCount: number;
	skippedCount: number;
	unmatchedCount: number;
	totalSongs: number;
}): string {
	if (args.updatedCount > 0) {
		const trackLabel = args.updatedCount === 1 ? "track" : "tracks";
		let reason = `Updated track times for ${args.updatedCount} ${trackLabel}.`;
		if (args.unmatchedCount > 0) {
			const unmatchedLabel = args.unmatchedCount === 1 ? "track" : "tracks";
			reason += ` ${args.unmatchedCount} ${unmatchedLabel} could not be matched.`;
		}
		return reason;
	}

	if (args.totalSongs === 0) {
		return "This album has no tracks to update.";
	}

	if (args.unmatchedCount === args.totalSongs) {
		return "No lyrics tracks could be matched to Spotify track durations.";
	}

	if (args.skippedCount === args.totalSongs) {
		return "Track times are already up to date.";
	}

	if (args.skippedCount > 0 && args.unmatchedCount > 0) {
		return `${args.skippedCount} track times are already set. ${args.unmatchedCount} tracks could not be matched.`;
	}

	if (args.skippedCount > 0) {
		return "Track times are already up to date.";
	}

	if (args.unmatchedCount > 0) {
		const unmatchedLabel = args.unmatchedCount === 1 ? "track" : "tracks";
		return `${args.unmatchedCount} ${unmatchedLabel} could not be matched to Spotify track durations.`;
	}

	return "No track times were updated.";
}

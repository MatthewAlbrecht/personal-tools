/**
 * Shared Spotify sync logic used by both the manual sync route and cron job.
 */

import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env";
import {
	type PlayEvent,
	detectAlbumListenSessions,
	groupPlaysByAlbum,
} from "~/lib/album-detection";
import {
	type RecentlyPlayedItem,
	type SpotifyAlbum,
	getAlbum,
	getRecentlyPlayed,
} from "~/lib/spotify";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const LOOKBACK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type SyncStats = {
	tracksFromApi: number;
	uniqueTracksFromApi: number;
	newTracksAdded: number;
	existingTracksUpdated: number;
	uniqueAlbumsFromApi: number;
	albumsAlreadyInDb: number;
	newAlbumsDiscovered: number;
	albumsFetchFailed: number;
	albumsCheckedForListens: number;
	albumListensRecorded: number;
	tracksBackfilledFromAlbums: number;
	newAlbumNames: string[];
	recordedListenAlbumNames: string[];
	playEventsInserted: number;
	playEventsDuplicates: number;
	listenCandidates: number;
	listensDeduped: number;
	historyGapWarning: boolean;
};

export type SyncResult = {
	success: boolean;
	durationMs: number;
	error?: string;
} & SyncStats;

/**
 * Syncs Spotify listening history for a user.
 * Fetches recently played tracks, detects album listens, and saves to Convex.
 */
export async function syncSpotifyHistory(
	accessToken: string,
	userId: string,
	source: "manual" | "cron",
): Promise<SyncResult> {
	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	let syncLogId: Id<"spotifySyncLogs"> | null = null;
	const stats: SyncStats = {
		tracksFromApi: 0,
		uniqueTracksFromApi: 0,
		newTracksAdded: 0,
		existingTracksUpdated: 0,
		uniqueAlbumsFromApi: 0,
		albumsAlreadyInDb: 0,
		newAlbumsDiscovered: 0,
		albumsFetchFailed: 0,
		albumsCheckedForListens: 0,
		albumListensRecorded: 0,
		tracksBackfilledFromAlbums: 0,
		newAlbumNames: [],
		recordedListenAlbumNames: [],
		playEventsInserted: 0,
		playEventsDuplicates: 0,
		listenCandidates: 0,
		listensDeduped: 0,
		historyGapWarning: false,
	};

	try {
		// Fetch recently played
		const recentlyPlayed = await getRecentlyPlayed(accessToken, 50);
		stats.tracksFromApi = recentlyPlayed.length;

		// Calculate unique tracks and albums
		const uniqueTrackIds = new Set(recentlyPlayed.map((item) => item.track.id));
		const uniqueAlbumIds = [
			...new Set(recentlyPlayed.map((item) => item.track.album.id)),
		];
		stats.uniqueTracksFromApi = uniqueTrackIds.size;
		stats.uniqueAlbumsFromApi = uniqueAlbumIds.length;

		// Store raw response in sync log
		syncLogId = await convex.mutation(api.spotify.createSyncLog, {
			userId,
			syncType: "recently_played",
			rawResponse: JSON.stringify(recentlyPlayed),
		});

		// Check which tracks already exist
		for (const trackId of uniqueTrackIds) {
			const existing = await convex.query(
				api.spotify.getTrackByUserAndTrackId,
				{
					userId,
					trackId,
				},
			);
			if (existing) {
				stats.existingTracksUpdated++;
			} else {
				stats.newTracksAdded++;
			}
		}

		// Process tracks
		const trackItems = recentlyPlayed.map((item) => ({
			trackId: item.track.id,
			trackName: item.track.name,
			artistName: item.track.artists.map((a) => a.name).join(", "),
			albumName: item.track.album.name,
			albumImageUrl: item.track.album.images?.[0]?.url,
			spotifyAlbumId: item.track.album.id,
			trackData: JSON.stringify(item.track),
			playedAt: Date.parse(item.played_at),
		}));

		await convex.mutation(api.spotify.upsertTracksFromRecentlyPlayed, {
			userId,
			items: trackItems,
		});

		// Check whether the ledger already has entries for these albums before
		// ingesting this batch, so we can flag a possible history gap below.
		const priorEventsForBatchAlbums = uniqueAlbumIds.length
			? await convex.query(api.spotifyPlayEvents.listPlayEventsForAlbumsSince, {
					userId,
					spotifyAlbumIds: uniqueAlbumIds,
					sinceMs: 0,
				})
			: [];

		// Ingest into the durable play-event ledger before detection so this
		// batch's own plays are visible to the lookback query in detectAlbumListens.
		const playEventItems = recentlyPlayed.map((item) => ({
			spotifyTrackId: item.track.id,
			spotifyAlbumId: item.track.album.id,
			trackNumber: item.track.track_number,
			discNumber: item.track.disc_number ?? 1,
			playedAt: Date.parse(item.played_at),
		}));

		const upsertResult = await convex.mutation(
			api.spotifyPlayEvents.upsertPlayEvents,
			{ userId, events: playEventItems },
		);
		stats.playEventsInserted = upsertResult.inserted;
		stats.playEventsDuplicates = upsertResult.duplicates;
		stats.historyGapWarning =
			recentlyPlayed.length === 50 &&
			upsertResult.duplicates === 0 &&
			priorEventsForBatchAlbums.length > 0;

		// Detect album listens
		await detectAlbumListens(
			convex,
			accessToken,
			userId,
			recentlyPlayed,
			stats,
			source,
		);

		// Mark sync as processed
		if (syncLogId) {
			await convex.mutation(api.spotify.updateSyncLogStatus, {
				syncLogId,
				status: "processed",
			});
		}

		const completedAt = Date.now();
		const durationMs = completedAt - startedAt;

		// Save sync run stats
		await convex.mutation(api.spotify.saveSyncRun, {
			userId,
			source,
			status: "success",
			startedAt,
			completedAt,
			durationMs,
			...stats,
		});

		return {
			success: true,
			durationMs,
			...stats,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Mark sync as failed
		if (syncLogId) {
			await convex.mutation(api.spotify.updateSyncLogStatus, {
				syncLogId,
				status: "failed",
				error: errorMessage,
			});
		}

		const completedAt = Date.now();
		const durationMs = completedAt - startedAt;

		// Save failed sync run
		await convex.mutation(api.spotify.saveSyncRun, {
			userId,
			source,
			status: "failed",
			startedAt,
			completedAt,
			durationMs,
			error: errorMessage,
			...stats,
		});

		console.error("Sync history error:", error);

		return {
			success: false,
			durationMs,
			error: errorMessage,
			...stats,
		};
	}
}

async function detectAlbumListens(
	convex: ConvexHttpClient,
	accessToken: string,
	userId: string,
	recentlyPlayed: RecentlyPlayedItem[],
	stats: SyncStats,
	source: "manual" | "cron",
): Promise<void> {
	if (recentlyPlayed.length === 0) return;

	const albumIdsInBatch = [
		...new Set(recentlyPlayed.map((item) => item.track.album.id)),
	];
	const albumMetadata = new Map<
		string,
		{ name: string; totalTracks: number; dbId: Id<"spotifyAlbums"> }
	>();

	stats.albumsCheckedForListens = albumIdsInBatch.length;

	// First pass: ensure all albums exist in DB and get their totalTracks
	for (const spotifyAlbumId of albumIdsInBatch) {
		// Get album name from recentlyPlayed data
		const albumName =
			recentlyPlayed.find((item) => item.track.album.id === spotifyAlbumId)
				?.track.album.name ?? "Unknown Album";

		// Check if we already have this album in the DB
		const existingAlbum = (await convex.query(api.spotify.getAlbumBySpotifyId, {
			spotifyAlbumId,
		})) as { _id: Id<"spotifyAlbums">; totalTracks: number } | null;

		if (existingAlbum) {
			stats.albumsAlreadyInDb++;
			albumMetadata.set(spotifyAlbumId, {
				name: albumName,
				totalTracks: existingAlbum.totalTracks,
				dbId: existingAlbum._id,
			});
		} else {
			// Fetch album details from Spotify
			let spotifyAlbum: SpotifyAlbum;
			try {
				spotifyAlbum = await getAlbum(accessToken, spotifyAlbumId);
			} catch (error) {
				console.warn(
					`Failed to fetch album ${spotifyAlbumId}:`,
					error instanceof Error ? error.message : error,
				);
				stats.albumsFetchFailed++;
				continue;
			}

			// Create album in DB
			const albumDbId = await convex.mutation(api.spotify.upsertAlbum, {
				spotifyAlbumId,
				name: spotifyAlbum.name,
				artistName: spotifyAlbum.artists.map((a) => a.name).join(", "),
				imageUrl: spotifyAlbum.images?.[0]?.url,
				releaseDate: spotifyAlbum.release_date,
				totalTracks: spotifyAlbum.total_tracks,
				genres: spotifyAlbum.genres,
				rawData: JSON.stringify(spotifyAlbum),
			});

			// Backfill tracks from the album
			const albumTracksToAdd = spotifyAlbum.tracks.items.map((t) => ({
				trackId: t.id,
				trackName: t.name,
				artistName: t.artists.map((a) => a.name).join(", "),
				artists: t.artists.map((artist) => ({
					id: artist.id,
					name: artist.name,
				})),
			}));

			const backfillResult = await convex.mutation(
				api.spotify.backfillTracksFromAlbum,
				{
					userId,
					spotifyAlbumId,
					albumName: spotifyAlbum.name,
					albumImageUrl: spotifyAlbum.images?.[0]?.url,
					tracks: albumTracksToAdd,
				},
			);

			stats.newAlbumsDiscovered++;
			stats.newAlbumNames.push(spotifyAlbum.name);
			stats.tracksBackfilledFromAlbums += backfillResult.addedCount;

			albumMetadata.set(spotifyAlbumId, {
				name: spotifyAlbum.name,
				totalTracks: spotifyAlbum.total_tracks,
				dbId: albumDbId,
			});
		}
	}

	// Second pass: pull a 24h lookback window from the durable ledger (which
	// now includes this batch's own plays) so sessions that cross sync
	// boundaries are still detected, then evaluate each touched album.
	const newestPlayedAtInBatch = Math.max(
		...recentlyPlayed.map((item) => Date.parse(item.played_at)),
	);
	const sinceMs = newestPlayedAtInBatch - LOOKBACK_WINDOW_MS;

	const lookbackRows = await convex.query(
		api.spotifyPlayEvents.listPlayEventsForAlbumsSince,
		{
			userId,
			spotifyAlbumIds: albumIdsInBatch,
			sinceMs,
		},
	);

	const playEvents: PlayEvent[] = lookbackRows.map((row) => ({
		trackId: row.spotifyTrackId,
		trackNumber: row.trackNumber,
		discNumber: row.discNumber,
		playedAt: row.playedAt,
		albumId: row.spotifyAlbumId,
	}));

	const albumsById = groupPlaysByAlbum(playEvents);
	const recordSource = source === "cron" ? "cron_sync" : "manual_sync";

	for (const [spotifyAlbumId, plays] of albumsById) {
		const metadata = albumMetadata.get(spotifyAlbumId);
		if (!metadata) continue; // Album fetch failed, skip

		// Detect valid listen sessions using the new algorithm
		const sessions = detectAlbumListenSessions(plays, metadata.totalTracks);
		stats.listenCandidates += sessions.length;

		// Record each valid session
		for (const session of sessions) {
			const result = await convex.mutation(api.spotify.recordAlbumListen, {
				userId,
				albumId: metadata.dbId,
				trackIds: session.trackIds,
				earliestPlayedAt: session.earliestPlayedAt,
				latestPlayedAt: session.latestPlayedAt,
				source: recordSource,
			});

			if (result.recorded) {
				stats.albumListensRecorded++;
				stats.recordedListenAlbumNames.push(metadata.name);
			} else {
				stats.listensDeduped++;
			}
		}
	}
}

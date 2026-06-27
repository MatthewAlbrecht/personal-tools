import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env.js";
import {
	type PlaylistTrackItem,
	type SpotifyAlbum,
	getAlbum,
	getAllPlaylistTrackItems,
	getPlaylistTrackItemsFromOffset,
	getPlaylistTracksTotalHead,
} from "~/lib/spotify";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
	buildArtistKeys,
	normalizeAlbumTitle,
} from "../../convex/_utils/albumMatchingCore";
import { buildForLaterPlaylistAlbums } from "../../convex/_utils/forLaterAlbums";

export type ForLaterSyncStats = {
	tracksFromPlaylist: number;
	uniqueAlbumsFromPlaylist: number;
	newAlbumsAdded: number;
	existingAlbumsSeen: number;
	albumsMarkedRemoved: number;
	rymMatchesCreated: number;
	rymDiscoveryQueued: number;
	playlistTrackPageRequests: number;
	/** True when backlog rows are limited to playlist rows newer than stored max Spotify {@literal added_at}. */
	usedIncrementalPlaylistScan: boolean;
	/** All playlist rows retrieved from Spotify this run (before incremental {@literal added_at} filter). */
	playlistRowsTotalFetched: number;
};

/** Stats stored on `forLaterSyncRuns` (Convex schema). */
export type ForLaterConvexPersistStats = Omit<
	ForLaterSyncStats,
	| "playlistTrackPageRequests"
	| "usedIncrementalPlaylistScan"
	| "playlistRowsTotalFetched"
>;

function persistableStats(
	stats: ForLaterSyncStats,
): ForLaterConvexPersistStats {
	const {
		playlistTrackPageRequests: _pages,
		usedIncrementalPlaylistScan: _inc,
		playlistRowsTotalFetched: _totalFetched,
		...rest
	} = stats;
	return rest;
}

/** Largest parseable Spotify {@literal added_at} among playlist rows in {@literal items}. */
function maxPlaylistRowAddedAtMs(
	items: PlaylistTrackItem[],
): number | undefined {
	let max = Number.NEGATIVE_INFINITY;
	for (const item of items) {
		const t = Date.parse(item.added_at);
		if (!Number.isNaN(t)) {
			max = Math.max(max, t);
		}
	}
	return max === Number.NEGATIVE_INFINITY ? undefined : max;
}

/** Advances watermark after this sync run (incremental safe across empty batches). */
function computePlaylistNewestAddedAtMsAfterSync(args: {
	prevWatermarkMs: number | undefined;
	batchMaxAddedMs: number | undefined;
}): number | undefined {
	const { prevWatermarkMs, batchMaxAddedMs } = args;
	if (prevWatermarkMs !== undefined && batchMaxAddedMs !== undefined) {
		return Math.max(prevWatermarkMs, batchMaxAddedMs);
	}
	if (batchMaxAddedMs !== undefined) {
		return batchMaxAddedMs;
	}
	return prevWatermarkMs;
}

/** Backlog artist keys from a canonical row: Spotify JSON in rawData when present, else artistName (same join order as upsert). */
function artistKeysFromStoredCanonical(doc: Doc<"spotifyAlbums">): string[] {
	if (doc.rawData) {
		try {
			const parsed = JSON.parse(doc.rawData) as {
				artists?: Array<{ name?: string }>;
			};
			const names =
				parsed.artists
					?.map((a) => a.name)
					.filter((n): n is string => Boolean(n)) ?? [];
			if (names.length > 0) {
				return buildArtistKeys(names);
			}
		} catch {
			// fall through to artistName
		}
	}

	const segments = doc.artistName
		.split(", ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments.length > 0) {
		return buildArtistKeys(segments);
	}

	return buildArtistKeys([doc.artistName]);
}

export type ForLaterSyncResult = {
	success: boolean;
	durationMs: number;
	spotifyPlaylistId: string;
	spotifySnapshotId?: string;
	error?: string;
} & ForLaterSyncStats;

export async function syncForLaterAlbums({
	accessToken,
	userId,
	source,
	fullPlaylist = false,
}: {
	accessToken: string;
	userId: string;
	source: "manual" | "cron";
	/** When true, fetch every playlist row (ignores last-sync cutoff). */
	fullPlaylist?: boolean;
}): Promise<ForLaterSyncResult> {
	const spotifyPlaylistId = env.FOR_LATER_SPOTIFY_PLAYLIST_ID;
	if (!spotifyPlaylistId) {
		throw new Error("FOR_LATER_SPOTIFY_PLAYLIST_ID is not configured");
	}

	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const stats: ForLaterSyncStats = {
		tracksFromPlaylist: 0,
		uniqueAlbumsFromPlaylist: 0,
		newAlbumsAdded: 0,
		existingAlbumsSeen: 0,
		albumsMarkedRemoved: 0,
		rymMatchesCreated: 0,
		rymDiscoveryQueued: 0,
		playlistTrackPageRequests: 0,
		usedIncrementalPlaylistScan: false,
		playlistRowsTotalFetched: 0,
	};
	let spotifySnapshotId: string | undefined;

	try {
		const lastSuccessfulSync = await convex.query(
			api.forLaterAlbums.getForLaterLastSuccessfulSync,
			{ userId },
		);
		const prevPlaylistWatermarkMs = lastSuccessfulSync?.playlistNewestAddedAtMs;
		const incrementalCutoffMs =
			fullPlaylist || prevPlaylistWatermarkMs === undefined
				? null
				: prevPlaylistWatermarkMs;

		const playlist = await getPlaylistTracksTotalHead(
			accessToken,
			spotifyPlaylistId,
		);
		spotifySnapshotId = playlist.snapshot_id;
		const playlistTrackTotal = playlist.tracks.total;

		const tailCap = env.FOR_LATER_INCREMENTAL_TAIL_TRACKS;
		const tailWindow = Math.min(tailCap, playlistTrackTotal);
		const tailStartOffset = Math.max(0, playlistTrackTotal - tailWindow);

		const trackCollection =
			incrementalCutoffMs !== null && playlistTrackTotal > 0
				? await getPlaylistTrackItemsFromOffset(
						accessToken,
						spotifyPlaylistId,
						tailStartOffset,
					)
				: await getAllPlaylistTrackItems(accessToken, spotifyPlaylistId);

		const rawPlaylistRows = trackCollection.items;
		const playlistGlobalMaxAddedMs = maxPlaylistRowAddedAtMs(rawPlaylistRows);

		const playlistItems =
			incrementalCutoffMs !== null
				? rawPlaylistRows.filter((item) => {
						const t = Date.parse(item.added_at);
						if (Number.isNaN(t)) {
							return false;
						}
						return t > incrementalCutoffMs;
					})
				: rawPlaylistRows;

		stats.usedIncrementalPlaylistScan = incrementalCutoffMs !== null;
		stats.playlistTrackPageRequests = trackCollection.playlistTrackPageRequests;
		stats.playlistRowsTotalFetched = rawPlaylistRows.length;

		stats.tracksFromPlaylist = playlistItems.filter(
			(item) => item.track,
		).length;
		const playlistAlbums = buildForLaterPlaylistAlbums(playlistItems);
		stats.uniqueAlbumsFromPlaylist = playlistAlbums.length;

		const canonicalAlbumRows = await convex.query(
			api.spotify.getSpotifyAlbumsBySpotifyIds,
			{
				spotifyAlbumIds: playlistAlbums.map((a) => a.spotifyAlbumId),
			},
		);
		const canonicalAlbumBySpotifyId = new Map(
			canonicalAlbumRows.map((row) => [row.spotifyAlbumId, row.album]),
		);

		for (const playlistAlbum of playlistAlbums) {
			const canonicalAlbum = canonicalAlbumBySpotifyId.get(
				playlistAlbum.spotifyAlbumId,
			);

			let albumId: Id<"spotifyAlbums">;
			let albumNameForTitleKey: string;
			let artistKeys: string[];

			if (canonicalAlbum !== undefined) {
				albumId = canonicalAlbum._id;
				albumNameForTitleKey = canonicalAlbum.name;
				artistKeys = artistKeysFromStoredCanonical(canonicalAlbum);
			} else {
				const spotifyAlbum = await getAlbum(
					accessToken,
					playlistAlbum.spotifyAlbumId,
				);
				albumId = await upsertCanonicalAlbum(convex, spotifyAlbum);
				albumNameForTitleKey = spotifyAlbum.name;
				artistKeys = buildArtistKeys(
					spotifyAlbum.artists.map((artist) => artist.name),
				);
			}

			const upsertResult = await convex.mutation(
				api.forLaterAlbums.upsertForLaterAlbumItem,
				{
					userId,
					albumId,
					spotifyAlbumId: playlistAlbum.spotifyAlbumId,
					albumTitleKey: normalizeAlbumTitle(albumNameForTitleKey),
					artistKeys,
					sourceTrackIds: playlistAlbum.sourceTrackIds,
					playlistAddedAt: playlistAlbum.playlistAddedAt,
					totalDurationMs: playlistAlbum.totalDurationMs,
					seenAt: startedAt,
				},
			);

			if (upsertResult.isNew) {
				stats.newAlbumsAdded++;
			} else {
				stats.existingAlbumsSeen++;
			}

			if (upsertResult.rymMatchCreated) {
				stats.rymMatchesCreated++;
			}
		}

		stats.albumsMarkedRemoved = 0;

		const completedAt = Date.now();
		const durationMs = completedAt - startedAt;

		const playlistNewestAddedAtMs = computePlaylistNewestAddedAtMsAfterSync({
			prevWatermarkMs: prevPlaylistWatermarkMs,
			batchMaxAddedMs: playlistGlobalMaxAddedMs,
		});

		await convex.mutation(api.forLaterAlbums.saveForLaterSyncRun, {
			userId,
			spotifyPlaylistId,
			source,
			status: "success",
			startedAt,
			completedAt,
			durationMs,
			spotifySnapshotId,
			...(playlistNewestAddedAtMs !== undefined
				? { playlistNewestAddedAtMs }
				: {}),
			...persistableStats(stats),
		});

		return {
			success: true,
			durationMs,
			spotifyPlaylistId,
			spotifySnapshotId,
			...stats,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown For Later sync error";
		const completedAt = Date.now();
		const durationMs = completedAt - startedAt;

		await convex.mutation(api.forLaterAlbums.saveForLaterSyncRun, {
			userId,
			spotifyPlaylistId,
			source,
			status: "failed",
			startedAt,
			completedAt,
			durationMs,
			spotifySnapshotId,
			error: errorMessage,
			...persistableStats(stats),
		});

		console.error("For Later Albums sync error:", error);

		return {
			success: false,
			durationMs,
			spotifyPlaylistId,
			spotifySnapshotId,
			error: errorMessage,
			...stats,
		};
	}
}

async function upsertCanonicalAlbum(
	convex: ConvexHttpClient,
	spotifyAlbum: SpotifyAlbum,
): Promise<Id<"spotifyAlbums">> {
	return await convex.mutation(api.spotify.upsertAlbum, {
		spotifyAlbumId: spotifyAlbum.id,
		name: spotifyAlbum.name,
		artistName: spotifyAlbum.artists.map((artist) => artist.name).join(", "),
		imageUrl: spotifyAlbum.images[0]?.url,
		releaseDate: spotifyAlbum.release_date,
		totalTracks: spotifyAlbum.total_tracks,
		genres: spotifyAlbum.genres,
		rawData: JSON.stringify(spotifyAlbum),
	});
}

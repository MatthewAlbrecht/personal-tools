import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env.js";
import {
	chunkSpotifyUris,
	computeAlbumRepeatSummaries,
	computeArtistRepeatSummaries,
	computeTrackRepeatSummaries,
	excludeAlreadyWrittenPlaylistWrites,
	normalizePlaylistTrack,
	planPlaylistWrites,
} from "~/lib/music-funnel-sync-utils";
import {
	addTracksToPlaylist,
	getAllPlaylistTrackItems,
	getPlaylist,
} from "~/lib/spotify";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type MusicFunnelSyncResult = {
	success: boolean;
	status: "success" | "partial" | "failed";
	runId?: Id<"musicFunnelRuns">;
	durationMs: number;
	sourcesScanned: number;
	tracksSeen: number;
	newEncounters: number;
	newTracksAddedToMain: number;
	repeatTracksAdded: number;
	trackRepeatsFound: number;
	albumRepeatsFound: number;
	artistRepeatsFound: number;
	errors: string[];
};

export async function syncMusicFunnel({
	accessToken,
	userId,
	source,
}: {
	accessToken: string;
	userId: string;
	source: "manual" | "cron";
}): Promise<MusicFunnelSyncResult> {
	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const runId = await convex.mutation(api.musicFunnel.startRun, {
		userId,
		source,
		startedAt,
	});

	const errors: string[] = [];
	let sourcesScanned = 0;
	let tracksSeen = 0;
	let newEncounters = 0;
	let newTracksAddedToMain = 0;
	let repeatTracksAdded = 0;

	try {
		const settings = await convex.query(api.musicFunnel.getSettings, {
			userId,
		});
		const activeSources = await convex.query(api.musicFunnel.listSources, {
			userId,
			activeOnly: true,
		});
		const sources = activeSources.filter(
			(source) => (source.kind ?? "recurring") !== "one_off",
		);

		if (sources.length === 0) {
			errors.push(
				"No active source playlists configured. Open Config and add at least one source.",
			);
		}

		for (const musicFunnelSource of sources) {
			const result = await syncSourcePlaylist({
				convex,
				accessToken,
				userId,
				runId,
				source: musicFunnelSource,
				mainPlaylistId: settings?.mainPlaylistId,
				repeatsPlaylistId: settings?.repeatsPlaylistId,
			});
			sourcesScanned += result.sourceSucceeded ? 1 : 0;
			tracksSeen += result.tracksSeen;
			newEncounters += result.newEncounters;
			newTracksAddedToMain += result.newTracksAddedToMain;
			repeatTracksAdded += result.repeatTracksAdded;
			errors.push(...result.errors);
		}

		const allEncounters = await convex.query(
			api.musicFunnel.listEncounterRowsForAnalytics,
			{
				userId,
				limit: 5000,
			},
		);
		const trackRepeatsFound = computeTrackRepeatSummaries(allEncounters).length;
		const albumRepeatsFound = computeAlbumRepeatSummaries(allEncounters).length;
		const artistRepeatsFound =
			computeArtistRepeatSummaries(allEncounters).length;
		const status =
			sources.length === 0
				? "failed"
				: errors.length > 0
					? sourcesScanned > 0
						? "partial"
						: "failed"
					: "success";
		const completedAt = Date.now();

		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status,
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		});

		return {
			success: status !== "failed",
			status,
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		};
	} catch (error) {
		const completedAt = Date.now();
		const message =
			error instanceof Error
				? error.message
				: "Unknown music funnel sync error";
		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status: "failed",
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		});
		return {
			success: false,
			status: "failed",
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		};
	}
}

export async function syncMusicFunnelSource({
	accessToken,
	userId,
	sourceId,
}: {
	accessToken: string;
	userId: string;
	sourceId: Id<"musicFunnelSources">;
}): Promise<MusicFunnelSyncResult> {
	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const runId = await convex.mutation(api.musicFunnel.startRun, {
		userId,
		source: "manual",
		startedAt,
	});

	const errors: string[] = [];
	let sourcesScanned = 0;
	let tracksSeen = 0;
	let newEncounters = 0;
	let newTracksAddedToMain = 0;
	let repeatTracksAdded = 0;

	try {
		const settings = await convex.query(api.musicFunnel.getSettings, {
			userId,
		});
		const sources = await convex.query(api.musicFunnel.listSources, {
			userId,
		});
		const musicFunnelSource = sources.find((source) => source._id === sourceId);

		if (!musicFunnelSource) {
			errors.push("Source playlist not found.");
		} else {
			const result = await syncSourcePlaylist({
				convex,
				accessToken,
				userId,
				runId,
				source: musicFunnelSource,
				mainPlaylistId: settings?.mainPlaylistId,
				repeatsPlaylistId: settings?.repeatsPlaylistId,
			});
			sourcesScanned += result.sourceSucceeded ? 1 : 0;
			tracksSeen += result.tracksSeen;
			newEncounters += result.newEncounters;
			newTracksAddedToMain += result.newTracksAddedToMain;
			repeatTracksAdded += result.repeatTracksAdded;
			errors.push(...result.errors);

			if (
				result.sourceSucceeded &&
				(musicFunnelSource.kind ?? "recurring") === "one_off"
			) {
				await convex.mutation(api.musicFunnel.setSourceActive, {
					sourceId: musicFunnelSource._id,
					isActive: false,
				});
			}
		}

		const allEncounters = await convex.query(
			api.musicFunnel.listEncounterRowsForAnalytics,
			{
				userId,
				limit: 5000,
			},
		);
		const trackRepeatsFound = computeTrackRepeatSummaries(allEncounters).length;
		const albumRepeatsFound = computeAlbumRepeatSummaries(allEncounters).length;
		const artistRepeatsFound =
			computeArtistRepeatSummaries(allEncounters).length;
		const status = !musicFunnelSource
			? "failed"
			: errors.length > 0
				? sourcesScanned > 0
					? "partial"
					: "failed"
				: "success";
		const completedAt = Date.now();

		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status,
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		});

		return {
			success: status !== "failed",
			status,
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		};
	} catch (error) {
		const completedAt = Date.now();
		const message =
			error instanceof Error
				? error.message
				: "Unknown music funnel sync error";
		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status: "failed",
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		});
		return {
			success: false,
			status: "failed",
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		};
	}
}

async function syncSourcePlaylist({
	convex,
	accessToken,
	userId,
	runId,
	source,
	mainPlaylistId,
	repeatsPlaylistId,
}: {
	convex: ConvexHttpClient;
	accessToken: string;
	userId: string;
	runId: Id<"musicFunnelRuns">;
	source: {
		_id: Id<"musicFunnelSources">;
		spotifyPlaylistId: string;
		displayName: string;
	};
	mainPlaylistId?: string;
	repeatsPlaylistId?: string;
}): Promise<{
	sourceSucceeded: boolean;
	tracksSeen: number;
	newEncounters: number;
	newTracksAddedToMain: number;
	repeatTracksAdded: number;
	errors: string[];
}> {
	const sourceStartedAt = Date.now();
	const sourceRunId = await convex.mutation(api.musicFunnel.startSourceRun, {
		userId,
		runId,
		sourceId: source._id,
		spotifyPlaylistId: source.spotifyPlaylistId,
		sourceDisplayName: source.displayName,
		startedAt: sourceStartedAt,
	});

	try {
		const [playlist, trackCollection] = await Promise.all([
			getPlaylist(accessToken, source.spotifyPlaylistId),
			getAllPlaylistTrackItems(accessToken, source.spotifyPlaylistId),
		]);
		const normalizedTracks = trackCollection.items
			.map((item) => normalizePlaylistTrack(item))
			.filter((track): track is NonNullable<typeof track> => track !== null);

		const encounterResult = await convex.mutation(
			api.musicFunnel.recordTrackEncounters,
			{
				userId,
				runId,
				sourceRunId,
				sourceId: source._id,
				spotifyPlaylistId: source.spotifyPlaylistId,
				seenAt: sourceStartedAt,
				tracks: normalizedTracks,
			},
		);

		const mainAlreadyWritten = await convex.query(
			api.musicFunnel.getWrittenTrackIds,
			{
				userId,
				kind: "main",
				spotifyTrackIds: encounterResult.writeCandidateTrackIds,
			},
		);
		const repeatAlreadyWritten = await convex.query(
			api.musicFunnel.getWrittenTrackIds,
			{
				userId,
				kind: "repeat",
				spotifyTrackIds: encounterResult.writeCandidateTrackIds,
			},
		);
		const plannedWrites = planPlaylistWrites({
			candidateEncounters: encounterResult.writeCandidateEncounters,
			totalSourceCountsByTrackId: new Map(
				encounterResult.totalSourceCounts.map((row) => [
					row.spotifyTrackId,
					row.sourceCount,
				]),
			),
			alreadyWrittenMainTrackIds: new Set(mainAlreadyWritten),
			alreadyWrittenRepeatTrackIds: new Set(repeatAlreadyWritten),
		});

		const mainWrites = mainPlaylistId
			? await writeTracksToSpotifyPlaylist({
					convex,
					accessToken,
					userId,
					runId,
					sourceRunId,
					playlistId: mainPlaylistId,
					kind: "main",
					writes: plannedWrites.mainWrites,
				})
			: 0;
		const repeatWrites = repeatsPlaylistId
			? await writeTracksToSpotifyPlaylist({
					convex,
					accessToken,
					userId,
					runId,
					sourceRunId,
					playlistId: repeatsPlaylistId,
					kind: "repeat",
					writes: plannedWrites.repeatWrites,
				})
			: 0;

		await convex.mutation(api.musicFunnel.updateSourceSnapshot, {
			sourceId: source._id,
			spotifyPlaylistName: playlist.name,
			spotifyOwnerId: playlist.owner.id,
			spotifyOwnerName: playlist.owner.display_name,
			imageUrl: playlist.images[0]?.url,
			lastSnapshotId: playlist.snapshot_id,
			lastTrackCount: playlist.tracks.total,
			lastScannedAt: sourceStartedAt,
		});

		const newEncounterCount = encounterResult.insertedEncounters.length;
		if (newEncounterCount === 0) {
			await convex.mutation(api.musicFunnel.deleteSourceRun, { sourceRunId });
			return {
				sourceSucceeded: false,
				tracksSeen: normalizedTracks.length,
				newEncounters: 0,
				newTracksAddedToMain: mainWrites,
				repeatTracksAdded: repeatWrites,
				errors: [],
			};
		}

		await convex.mutation(api.musicFunnel.finishSourceRun, {
			sourceRunId,
			status: "success",
			completedAt: Date.now(),
			durationMs: Date.now() - sourceStartedAt,
			spotifySnapshotId: playlist.snapshot_id,
			tracksFetched: normalizedTracks.length,
			newEncounters: newEncounterCount,
			alreadySeenFromSource: normalizedTracks.length - newEncounterCount,
			newTracksAddedToMain: mainWrites,
			repeatTracksAdded: repeatWrites,
			trackRepeatsFound: plannedWrites.repeatWrites.length,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		});

		return {
			sourceSucceeded: true,
			tracksSeen: normalizedTracks.length,
			newEncounters: newEncounterCount,
			newTracksAddedToMain: mainWrites,
			repeatTracksAdded: repeatWrites,
			errors: [],
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown source sync error";
		await convex.mutation(api.musicFunnel.finishSourceRun, {
			sourceRunId,
			status: "failed",
			completedAt: Date.now(),
			durationMs: Date.now() - sourceStartedAt,
			tracksFetched: 0,
			newEncounters: 0,
			alreadySeenFromSource: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			error: message,
		});

		return {
			sourceSucceeded: false,
			tracksSeen: 0,
			newEncounters: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			errors: [`${source.displayName}: ${message}`],
		};
	}
}

async function writeTracksToSpotifyPlaylist({
	convex,
	userId,
	runId,
	sourceRunId,
	playlistId,
	kind,
	writes,
	accessToken,
}: {
	convex: ConvexHttpClient;
	accessToken: string;
	userId: string;
	runId: Id<"musicFunnelRuns">;
	sourceRunId: Id<"musicFunnelSourceRuns">;
	playlistId: string;
	kind: "main" | "repeat";
	writes: Array<{
		spotifyTrackId: string;
		trackUri: string;
		reason: "first_seen" | "second_source_repeat";
	}>;
}): Promise<number> {
	if (writes.length === 0) {
		return 0;
	}

	const alreadyWritten = await convex.query(
		api.musicFunnel.getWrittenTrackIds,
		{
			userId,
			kind,
			spotifyTrackIds: writes.map((write) => write.spotifyTrackId),
		},
	);
	const pendingWrites = excludeAlreadyWrittenPlaylistWrites(
		writes,
		new Set(alreadyWritten),
	);

	let written = 0;
	for (const chunk of chunkSpotifyUris(
		pendingWrites.map((write) => write.trackUri),
	)) {
		const response = await addTracksToPlaylist(accessToken, playlistId, chunk);
		const chunkWrites = pendingWrites.filter((write) =>
			chunk.includes(write.trackUri),
		);
		const insertedCount = await convex.mutation(
			api.musicFunnel.recordPlaylistWrites,
			{
				userId,
				runId,
				sourceRunId,
				kind,
				spotifyPlaylistId: playlistId,
				spotifySnapshotId: response.snapshot_id,
				writes: chunkWrites,
				writtenAt: Date.now(),
			},
		);
		written += insertedCount;
	}
	return written;
}

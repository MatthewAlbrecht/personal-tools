import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	computeBecameRepeatAt,
	sortUnifiedRepeatsByLatestSeenAt,
} from "./_utils/musicFunnelRepeats";

const syncSourceValidator = v.union(v.literal("manual"), v.literal("cron"));
const runStatusValidator = v.union(
	v.literal("success"),
	v.literal("partial"),
	v.literal("failed"),
);
const sourceRunStatusValidator = v.union(
	v.literal("success"),
	v.literal("failed"),
);
const writeKindValidator = v.union(v.literal("main"), v.literal("repeat"));
const writeReasonValidator = v.union(
	v.literal("first_seen"),
	v.literal("second_source_repeat"),
);

const artistValidator = v.object({
	spotifyArtistId: v.string(),
	name: v.string(),
});

const settingsReturnValidator = v.object({
	_id: v.id("musicFunnelSettings"),
	_creationTime: v.number(),
	userId: v.string(),
	mainPlaylistId: v.optional(v.string()),
	repeatsPlaylistId: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const sourceReturnValidator = v.object({
	_id: v.id("musicFunnelSources"),
	_creationTime: v.number(),
	userId: v.string(),
	spotifyPlaylistId: v.string(),
	displayName: v.string(),
	curatorName: v.string(),
	notes: v.optional(v.string()),
	scheduleHint: v.optional(v.string()),
	isActive: v.boolean(),
	spotifyPlaylistName: v.optional(v.string()),
	spotifyOwnerId: v.optional(v.string()),
	spotifyOwnerName: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	lastSnapshotId: v.optional(v.string()),
	lastTrackCount: v.optional(v.number()),
	lastScannedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const runReturnValidator = v.object({
	_id: v.id("musicFunnelRuns"),
	_creationTime: v.number(),
	userId: v.string(),
	source: syncSourceValidator,
	status: runStatusValidator,
	startedAt: v.number(),
	completedAt: v.optional(v.number()),
	durationMs: v.optional(v.number()),
	sourcesScanned: v.number(),
	tracksSeen: v.number(),
	newEncounters: v.number(),
	newTracksAddedToMain: v.number(),
	repeatTracksAdded: v.number(),
	trackRepeatsFound: v.number(),
	albumRepeatsFound: v.number(),
	artistRepeatsFound: v.number(),
	errors: v.array(v.string()),
});

const sourceRunReturnValidator = v.object({
	_id: v.id("musicFunnelSourceRuns"),
	_creationTime: v.number(),
	userId: v.string(),
	runId: v.id("musicFunnelRuns"),
	sourceId: v.id("musicFunnelSources"),
	spotifyPlaylistId: v.string(),
	sourceDisplayName: v.string(),
	status: sourceRunStatusValidator,
	startedAt: v.number(),
	completedAt: v.optional(v.number()),
	durationMs: v.optional(v.number()),
	spotifySnapshotId: v.optional(v.string()),
	tracksFetched: v.number(),
	newEncounters: v.number(),
	alreadySeenFromSource: v.number(),
	newTracksAddedToMain: v.number(),
	repeatTracksAdded: v.number(),
	trackRepeatsFound: v.number(),
	albumRepeatsFound: v.number(),
	artistRepeatsFound: v.number(),
	error: v.optional(v.string()),
});

const encounterInputValidator = v.object({
	spotifyTrackId: v.string(),
	trackName: v.string(),
	trackUri: v.string(),
	primaryArtistName: v.string(),
	artists: v.array(artistValidator),
	spotifyAlbumId: v.string(),
	albumName: v.string(),
	albumImageUrl: v.optional(v.string()),
	playlistAddedAt: v.optional(v.number()),
});

const encounterLikeValidator = v.object({
	sourceId: v.id("musicFunnelSources"),
	spotifyTrackId: v.string(),
	trackName: v.string(),
	trackUri: v.string(),
	primaryArtistName: v.string(),
	artists: v.array(artistValidator),
	spotifyAlbumId: v.string(),
	albumName: v.string(),
	albumImageUrl: v.optional(v.string()),
	playlistAddedAt: v.optional(v.number()),
	firstSeenAt: v.number(),
});

const sourceLabelValidator = v.object({
	sourceId: v.id("musicFunnelSources"),
	displayName: v.string(),
	curatorName: v.string(),
});

const trackRepeatValidator = v.object({
	spotifyTrackId: v.string(),
	trackName: v.string(),
	primaryArtistName: v.string(),
	albumName: v.string(),
	albumImageUrl: v.optional(v.string()),
	sourceCount: v.number(),
	sources: v.array(sourceLabelValidator),
	firstSeenAt: v.number(),
	latestSeenAt: v.number(),
	becameRepeatAt: v.number(),
	addedToRepeatPlaylistAt: v.optional(v.number()),
});

const albumRepeatValidator = v.object({
	spotifyAlbumId: v.string(),
	albumName: v.string(),
	primaryArtistName: v.string(),
	albumImageUrl: v.optional(v.string()),
	sourceCount: v.number(),
	sources: v.array(sourceLabelValidator),
	contributingTrackCount: v.number(),
	firstSeenAt: v.number(),
	latestSeenAt: v.number(),
	becameRepeatAt: v.number(),
});

const artistRepeatValidator = v.object({
	spotifyArtistId: v.string(),
	name: v.string(),
	sourceCount: v.number(),
	sources: v.array(sourceLabelValidator),
	contributingTrackCount: v.number(),
	firstSeenAt: v.number(),
	latestSeenAt: v.number(),
	becameRepeatAt: v.number(),
});

const unifiedRepeatValidator = v.union(
	v.object({
		type: v.literal("track"),
		spotifyTrackId: v.string(),
		trackName: v.string(),
		primaryArtistName: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
		addedToRepeatPlaylistAt: v.optional(v.number()),
	}),
	v.object({
		type: v.literal("album"),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		primaryArtistName: v.string(),
		albumImageUrl: v.optional(v.string()),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		contributingTrackCount: v.number(),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
	}),
	v.object({
		type: v.literal("artist"),
		spotifyArtistId: v.string(),
		name: v.string(),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		contributingTrackCount: v.number(),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
	}),
);

type EncounterLike = {
	sourceId: Id<"musicFunnelSources">;
	spotifyTrackId: string;
	trackName: string;
	trackUri: string;
	primaryArtistName: string;
	artists: Array<{ spotifyArtistId: string; name: string }>;
	spotifyAlbumId: string;
	albumName: string;
	albumImageUrl?: string;
	playlistAddedAt?: number;
	firstSeenAt: number;
};

type SourceLabel = {
	sourceId: Id<"musicFunnelSources">;
	displayName: string;
	curatorName: string;
};

export const getSettings = query({
	args: { userId: v.string() },
	returns: v.union(v.null(), settingsReturnValidator),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("musicFunnelSettings")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();
	},
});

export const upsertSettings = mutation({
	args: {
		userId: v.string(),
		mainPlaylistId: v.optional(v.string()),
		repeatsPlaylistId: v.optional(v.string()),
	},
	returns: v.id("musicFunnelSettings"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSettings">> => {
		const now = Date.now();
		const existing = await ctx.db
			.query("musicFunnelSettings")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		const patch = {
			mainPlaylistId: emptyToUndefined(args.mainPlaylistId),
			repeatsPlaylistId: emptyToUndefined(args.repeatsPlaylistId),
			updatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return existing._id;
		}

		return await ctx.db.insert("musicFunnelSettings", {
			userId: args.userId,
			...patch,
			createdAt: now,
		});
	},
});

export const listSources = query({
	args: {
		userId: v.string(),
		activeOnly: v.optional(v.boolean()),
	},
	returns: v.array(sourceReturnValidator),
	handler: async (ctx, args): Promise<Array<Doc<"musicFunnelSources">>> => {
		if (args.activeOnly) {
			return await ctx.db
				.query("musicFunnelSources")
				.withIndex("by_userId_active", (q) =>
					q.eq("userId", args.userId).eq("isActive", true),
				)
				.collect();
		}

		return await ctx.db
			.query("musicFunnelSources")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const upsertSource = mutation({
	args: {
		userId: v.string(),
		sourceId: v.optional(v.id("musicFunnelSources")),
		spotifyPlaylistId: v.string(),
		displayName: v.string(),
		curatorName: v.string(),
		notes: v.optional(v.string()),
		scheduleHint: v.optional(v.string()),
		isActive: v.boolean(),
	},
	returns: v.id("musicFunnelSources"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSources">> => {
		const now = Date.now();
		const patch = {
			spotifyPlaylistId: args.spotifyPlaylistId.trim(),
			displayName: args.displayName.trim(),
			curatorName: args.curatorName.trim(),
			notes: emptyToUndefined(args.notes),
			scheduleHint: emptyToUndefined(args.scheduleHint),
			isActive: args.isActive,
			updatedAt: now,
		};

		if (args.sourceId) {
			await ctx.db.patch(args.sourceId, patch);
			return args.sourceId;
		}

		return await ctx.db.insert("musicFunnelSources", {
			userId: args.userId,
			...patch,
			createdAt: now,
		});
	},
});

export const setSourceActive = mutation({
	args: {
		sourceId: v.id("musicFunnelSources"),
		isActive: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.sourceId, {
			isActive: args.isActive,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const startRun = mutation({
	args: {
		userId: v.string(),
		source: syncSourceValidator,
		startedAt: v.number(),
	},
	returns: v.id("musicFunnelRuns"),
	handler: async (ctx, args): Promise<Id<"musicFunnelRuns">> => {
		return await ctx.db.insert("musicFunnelRuns", {
			userId: args.userId,
			source: args.source,
			status: "failed",
			startedAt: args.startedAt,
			sourcesScanned: 0,
			tracksSeen: 0,
			newEncounters: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [],
		});
	},
});

export const finishRun = mutation({
	args: {
		runId: v.id("musicFunnelRuns"),
		status: runStatusValidator,
		completedAt: v.number(),
		durationMs: v.number(),
		sourcesScanned: v.number(),
		tracksSeen: v.number(),
		newEncounters: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		errors: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.runId, {
			status: args.status,
			completedAt: args.completedAt,
			durationMs: args.durationMs,
			sourcesScanned: args.sourcesScanned,
			tracksSeen: args.tracksSeen,
			newEncounters: args.newEncounters,
			newTracksAddedToMain: args.newTracksAddedToMain,
			repeatTracksAdded: args.repeatTracksAdded,
			trackRepeatsFound: args.trackRepeatsFound,
			albumRepeatsFound: args.albumRepeatsFound,
			artistRepeatsFound: args.artistRepeatsFound,
			errors: args.errors,
		});
		return null;
	},
});

export const startSourceRun = mutation({
	args: {
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		sourceDisplayName: v.string(),
		startedAt: v.number(),
	},
	returns: v.id("musicFunnelSourceRuns"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSourceRuns">> => {
		return await ctx.db.insert("musicFunnelSourceRuns", {
			userId: args.userId,
			runId: args.runId,
			sourceId: args.sourceId,
			spotifyPlaylistId: args.spotifyPlaylistId,
			sourceDisplayName: args.sourceDisplayName,
			status: "failed",
			startedAt: args.startedAt,
			tracksFetched: 0,
			newEncounters: 0,
			alreadySeenFromSource: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		});
	},
});

export const deleteSourceRun = mutation({
	args: {
		sourceRunId: v.id("musicFunnelSourceRuns"),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.delete(args.sourceRunId);
		return null;
	},
});

export const finishSourceRun = mutation({
	args: {
		sourceRunId: v.id("musicFunnelSourceRuns"),
		status: sourceRunStatusValidator,
		completedAt: v.number(),
		durationMs: v.number(),
		spotifySnapshotId: v.optional(v.string()),
		tracksFetched: v.number(),
		newEncounters: v.number(),
		alreadySeenFromSource: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		error: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.sourceRunId, {
			status: args.status,
			completedAt: args.completedAt,
			durationMs: args.durationMs,
			spotifySnapshotId: args.spotifySnapshotId,
			tracksFetched: args.tracksFetched,
			newEncounters: args.newEncounters,
			alreadySeenFromSource: args.alreadySeenFromSource,
			newTracksAddedToMain: args.newTracksAddedToMain,
			repeatTracksAdded: args.repeatTracksAdded,
			trackRepeatsFound: args.trackRepeatsFound,
			albumRepeatsFound: args.albumRepeatsFound,
			artistRepeatsFound: args.artistRepeatsFound,
			error: args.error,
		});
		return null;
	},
});

export const updateSourceSnapshot = mutation({
	args: {
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistName: v.string(),
		spotifyOwnerId: v.string(),
		spotifyOwnerName: v.string(),
		imageUrl: v.optional(v.string()),
		lastSnapshotId: v.optional(v.string()),
		lastTrackCount: v.number(),
		lastScannedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.sourceId, {
			spotifyPlaylistName: args.spotifyPlaylistName,
			spotifyOwnerId: args.spotifyOwnerId,
			spotifyOwnerName: args.spotifyOwnerName,
			imageUrl: args.imageUrl,
			lastSnapshotId: args.lastSnapshotId,
			lastTrackCount: args.lastTrackCount,
			lastScannedAt: args.lastScannedAt,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const recordTrackEncounters = mutation({
	args: {
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.id("musicFunnelSourceRuns"),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		seenAt: v.number(),
		tracks: v.array(encounterInputValidator),
	},
	returns: v.object({
		insertedEncounters: v.array(encounterLikeValidator),
		insertedTrackIds: v.array(v.string()),
		writeCandidateEncounters: v.array(encounterLikeValidator),
		writeCandidateTrackIds: v.array(v.string()),
		totalSourceCounts: v.array(
			v.object({
				spotifyTrackId: v.string(),
				sourceCount: v.number(),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const insertedEncounters: EncounterLike[] = [];
		const insertedTrackIds: string[] = [];
		const writeCandidateEncounters: EncounterLike[] = [];

		for (const track of args.tracks) {
			const existing = await ctx.db
				.query("musicFunnelTrackEncounters")
				.withIndex("by_userId_sourceId_spotifyTrackId", (q) =>
					q
						.eq("userId", args.userId)
						.eq("sourceId", args.sourceId)
						.eq("spotifyTrackId", track.spotifyTrackId),
				)
				.first();

			if (existing) {
				writeCandidateEncounters.push(encounterDocToLike(existing));
				continue;
			}

			const encounterId = await ctx.db.insert("musicFunnelTrackEncounters", {
				userId: args.userId,
				sourceId: args.sourceId,
				spotifyPlaylistId: args.spotifyPlaylistId,
				runId: args.runId,
				sourceRunId: args.sourceRunId,
				spotifyTrackId: track.spotifyTrackId,
				trackName: track.trackName,
				trackUri: track.trackUri,
				primaryArtistName: track.primaryArtistName,
				artists: track.artists,
				spotifyAlbumId: track.spotifyAlbumId,
				albumName: track.albumName,
				albumImageUrl: track.albumImageUrl,
				playlistAddedAt: track.playlistAddedAt,
				firstSeenAt: args.seenAt,
				createdAt: args.seenAt,
			});

			const inserted = await ctx.db.get(encounterId);
			if (!inserted) {
				throw new Error("Failed to read inserted music funnel encounter");
			}

			const like = encounterDocToLike(inserted);
			insertedEncounters.push(like);
			insertedTrackIds.push(track.spotifyTrackId);
			writeCandidateEncounters.push(like);
		}

		const writeCandidateTrackIds = uniqueStrings(
			writeCandidateEncounters.map((row) => row.spotifyTrackId),
		);
		const totalSourceCounts: Array<{
			spotifyTrackId: string;
			sourceCount: number;
		}> = [];

		for (const spotifyTrackId of writeCandidateTrackIds) {
			const rows = await ctx.db
				.query("musicFunnelTrackEncounters")
				.withIndex("by_userId_spotifyTrackId", (q) =>
					q.eq("userId", args.userId).eq("spotifyTrackId", spotifyTrackId),
				)
				.collect();
			const sourceCount = new Set(rows.map((row) => row.sourceId)).size;
			totalSourceCounts.push({ spotifyTrackId, sourceCount });
		}

		return {
			insertedEncounters,
			insertedTrackIds,
			writeCandidateEncounters,
			writeCandidateTrackIds,
			totalSourceCounts,
		};
	},
});

export const recordPlaylistWrites = mutation({
	args: {
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.optional(v.id("musicFunnelSourceRuns")),
		kind: writeKindValidator,
		spotifyPlaylistId: v.string(),
		spotifySnapshotId: v.optional(v.string()),
		writtenAt: v.number(),
		writes: v.array(
			v.object({
				spotifyTrackId: v.string(),
				trackUri: v.string(),
				reason: writeReasonValidator,
			}),
		),
	},
	returns: v.number(),
	handler: async (ctx, args): Promise<number> => {
		let insertedCount = 0;

		for (const write of args.writes) {
			const existing = await ctx.db
				.query("musicFunnelPlaylistWrites")
				.withIndex("by_userId_kind_spotifyTrackId", (q) =>
					q
						.eq("userId", args.userId)
						.eq("kind", args.kind)
						.eq("spotifyTrackId", write.spotifyTrackId),
				)
				.first();

			if (existing) {
				continue;
			}

			await ctx.db.insert("musicFunnelPlaylistWrites", {
				userId: args.userId,
				kind: args.kind,
				spotifyPlaylistId: args.spotifyPlaylistId,
				spotifyTrackId: write.spotifyTrackId,
				trackUri: write.trackUri,
				reason: write.reason,
				runId: args.runId,
				sourceRunId: args.sourceRunId,
				writtenAt: args.writtenAt,
				spotifySnapshotId: args.spotifySnapshotId,
			});
			insertedCount += 1;
		}

		return insertedCount;
	},
});

export const getUiSummary = query({
	args: { userId: v.string() },
	returns: v.object({
		activeSourceCount: v.number(),
		totalEncounterCount: v.number(),
		lastRun: v.union(
			v.null(),
			v.object({
				_id: v.id("musicFunnelRuns"),
				status: runStatusValidator,
				startedAt: v.number(),
				completedAt: v.optional(v.number()),
				sourcesScanned: v.number(),
				newEncounters: v.number(),
				newTracksAddedToMain: v.number(),
				repeatTracksAdded: v.number(),
				errors: v.array(v.string()),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const activeSources = await ctx.db
			.query("musicFunnelSources")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const encounters = await ctx.db
			.query("musicFunnelTrackEncounters")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.collect();
		const lastRun = await ctx.db
			.query("musicFunnelRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		return {
			activeSourceCount: activeSources.length,
			totalEncounterCount: encounters.length,
			lastRun: lastRun
				? {
						_id: lastRun._id,
						status: lastRun.status,
						startedAt: lastRun.startedAt,
						completedAt: lastRun.completedAt,
						sourcesScanned: lastRun.sourcesScanned,
						newEncounters: lastRun.newEncounters,
						newTracksAddedToMain: lastRun.newTracksAddedToMain,
						repeatTracksAdded: lastRun.repeatTracksAdded,
						errors: lastRun.errors,
					}
				: null,
		};
	},
});

export const listRecentRuns = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(runReturnValidator),
	handler: async (ctx, args): Promise<Array<Doc<"musicFunnelRuns">>> => {
		const limit = clampLimit(args.limit, 10, 50);
		const rows = await ctx.db
			.query("musicFunnelRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(limit);
		return rows;
	},
});

export const listRunSourceRuns = query({
	args: { runId: v.id("musicFunnelRuns") },
	returns: v.array(sourceRunReturnValidator),
	handler: async (ctx, args): Promise<Array<Doc<"musicFunnelSourceRuns">>> => {
		return await ctx.db
			.query("musicFunnelSourceRuns")
			.withIndex("by_runId", (q) => q.eq("runId", args.runId))
			.collect();
	},
});

export const listRecentSourceRuns = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(sourceRunReturnValidator),
	handler: async (ctx, args): Promise<Array<Doc<"musicFunnelSourceRuns">>> => {
		const limit = clampLimit(args.limit, 50, 100);
		return await ctx.db
			.query("musicFunnelSourceRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(limit);
	},
});

export const listEncounterRowsForAnalytics = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(encounterLikeValidator),
	handler: async (ctx, args): Promise<EncounterLike[]> => {
		const limit = clampLimit(args.limit, 5000, 5000);
		const rows = await ctx.db
			.query("musicFunnelTrackEncounters")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(limit);
		return rows.map((row) => encounterDocToLike(row));
	},
});

export const getWrittenTrackIds = query({
	args: {
		userId: v.string(),
		kind: writeKindValidator,
		spotifyTrackIds: v.array(v.string()),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args): Promise<string[]> => {
		const written: string[] = [];

		for (const spotifyTrackId of args.spotifyTrackIds) {
			const existing = await ctx.db
				.query("musicFunnelPlaylistWrites")
				.withIndex("by_userId_kind_spotifyTrackId", (q) =>
					q
						.eq("userId", args.userId)
						.eq("kind", args.kind)
						.eq("spotifyTrackId", spotifyTrackId),
				)
				.first();
			if (existing) {
				written.push(spotifyTrackId);
			}
		}

		return written;
	},
});

export const listTrackRepeats = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(trackRepeatValidator),
	handler: async (ctx, args) => {
		const limit = clampLimit(args.limit, 25, 50);
		const encounters = await loadEncounterRows(ctx, args.userId, 5000);
		const sourceLabels = await loadSourceLabelMap(ctx, args.userId);
		const repeatAddedAtByTrackId = await loadRepeatPlaylistAddedAtByTrackId(
			ctx,
			args.userId,
		);
		const repeats = buildTrackRepeats(
			encounters,
			sourceLabels,
			repeatAddedAtByTrackId,
		);
		return repeats.slice(0, limit);
	},
});

export const listRepeats = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(unifiedRepeatValidator),
	handler: async (ctx, args) => {
		const limit = clampLimit(args.limit, 60, 100);
		const encounters = await loadEncounterRows(ctx, args.userId, 5000);
		const sourceLabels = await loadSourceLabelMap(ctx, args.userId);
		const repeatAddedAtByTrackId = await loadRepeatPlaylistAddedAtByTrackId(
			ctx,
			args.userId,
		);
		const tracks = buildTrackRepeats(
			encounters,
			sourceLabels,
			repeatAddedAtByTrackId,
		).map((row) => ({ type: "track" as const, ...row }));
		const albums = buildAlbumRepeats(encounters, sourceLabels).map((row) => ({
			type: "album" as const,
			...row,
		}));
		const artists = buildArtistRepeats(encounters, sourceLabels).map((row) => ({
			type: "artist" as const,
			...row,
		}));
		return sortUnifiedRepeatsByLatestSeenAt([
			...tracks,
			...albums,
			...artists,
		]).slice(0, limit);
	},
});

export const listAlbumRepeats = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(albumRepeatValidator),
	handler: async (ctx, args) => {
		const limit = clampLimit(args.limit, 25, 50);
		const encounters = await loadEncounterRows(ctx, args.userId, 5000);
		const sourceLabels = await loadSourceLabelMap(ctx, args.userId);
		const repeats = buildAlbumRepeats(encounters, sourceLabels);
		return repeats.slice(0, limit);
	},
});

export const listArtistRepeats = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(artistRepeatValidator),
	handler: async (ctx, args) => {
		const limit = clampLimit(args.limit, 25, 50);
		const encounters = await loadEncounterRows(ctx, args.userId, 5000);
		const sourceLabels = await loadSourceLabelMap(ctx, args.userId);
		const repeats = buildArtistRepeats(encounters, sourceLabels);
		return repeats.slice(0, limit);
	},
});

function emptyToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function clampLimit(
	value: number | undefined,
	defaultValue: number,
	maxValue: number,
): number {
	if (value === undefined) {
		return defaultValue;
	}
	return Math.min(Math.max(value, 1), maxValue);
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function encounterDocToLike(
	row: Doc<"musicFunnelTrackEncounters">,
): EncounterLike {
	const like: EncounterLike = {
		sourceId: row.sourceId,
		spotifyTrackId: row.spotifyTrackId,
		trackName: row.trackName,
		trackUri: row.trackUri,
		primaryArtistName: row.primaryArtistName,
		artists: row.artists,
		spotifyAlbumId: row.spotifyAlbumId,
		albumName: row.albumName,
		firstSeenAt: row.firstSeenAt,
	};
	if (row.albumImageUrl) {
		like.albumImageUrl = row.albumImageUrl;
	}
	if (row.playlistAddedAt !== undefined) {
		like.playlistAddedAt = row.playlistAddedAt;
	}
	return like;
}

async function loadEncounterRows(
	ctx: QueryCtx,
	userId: string,
	limit: number,
): Promise<EncounterLike[]> {
	const rows = await ctx.db
		.query("musicFunnelTrackEncounters")
		.withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
		.order("desc")
		.take(limit);
	return rows.map((row) => encounterDocToLike(row));
}

async function loadSourceLabelMap(
	ctx: QueryCtx,
	userId: string,
): Promise<Map<Id<"musicFunnelSources">, SourceLabel>> {
	const sources = await ctx.db
		.query("musicFunnelSources")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	return new Map(
		sources.map((source) => [
			source._id,
			{
				sourceId: source._id,
				displayName: source.displayName,
				curatorName: source.curatorName,
			},
		]),
	);
}

async function loadRepeatPlaylistAddedAtByTrackId(
	ctx: QueryCtx,
	userId: string,
): Promise<Map<string, number>> {
	const rows = await ctx.db
		.query("musicFunnelPlaylistWrites")
		.withIndex("by_userId_kind_spotifyTrackId", (q) =>
			q.eq("userId", userId).eq("kind", "repeat"),
		)
		.collect();

	return new Map(
		rows.map((row) => [row.spotifyTrackId, row.writtenAt] as const),
	);
}

function buildTrackRepeats(
	encounters: EncounterLike[],
	sourceLabels: Map<Id<"musicFunnelSources">, SourceLabel>,
	repeatAddedAtByTrackId: Map<string, number>,
) {
	const rowsByTrackId = new Map<string, EncounterLike[]>();
	for (const encounter of encounters) {
		const rows = rowsByTrackId.get(encounter.spotifyTrackId) ?? [];
		rows.push(encounter);
		rowsByTrackId.set(encounter.spotifyTrackId, rows);
	}

	return [...rowsByTrackId.entries()]
		.map(([spotifyTrackId, rows]) => {
			const sourceIds = uniqueSourceIds(rows);
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			const timing = getRepeatTiming(rows);
			const addedToRepeatPlaylistAt =
				repeatAddedAtByTrackId.get(spotifyTrackId);
			return {
				spotifyTrackId,
				trackName: first.trackName,
				primaryArtistName: first.primaryArtistName,
				albumName: first.albumName,
				albumImageUrl: first.albumImageUrl,
				sourceCount: sourceIds.length,
				sources: sourceIdsToLabels(sourceIds, sourceLabels),
				...timing,
				becameRepeatAt: computeBecameRepeatAt(
					rows.map((row) => ({
						sourceId: row.sourceId,
						firstSeenAt: row.firstSeenAt,
					})),
				),
				...(addedToRepeatPlaylistAt !== undefined
					? { addedToRepeatPlaylistAt }
					: {}),
			};
		})
		.filter(
			(summary): summary is NonNullable<typeof summary> => summary !== null,
		)
		.sort(sortBySourceCountThenLatest);
}

function buildAlbumRepeats(
	encounters: EncounterLike[],
	sourceLabels: Map<Id<"musicFunnelSources">, SourceLabel>,
) {
	const rowsByAlbumId = new Map<string, EncounterLike[]>();
	for (const encounter of encounters) {
		const rows = rowsByAlbumId.get(encounter.spotifyAlbumId) ?? [];
		rows.push(encounter);
		rowsByAlbumId.set(encounter.spotifyAlbumId, rows);
	}

	return [...rowsByAlbumId.entries()]
		.map(([spotifyAlbumId, rows]) => {
			const sourceIds = uniqueSourceIds(rows);
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			return {
				spotifyAlbumId,
				albumName: first.albumName,
				primaryArtistName: first.primaryArtistName,
				albumImageUrl: first.albumImageUrl,
				sourceCount: sourceIds.length,
				sources: sourceIdsToLabels(sourceIds, sourceLabels),
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId))
					.size,
				...getRepeatTiming(rows),
				becameRepeatAt: computeBecameRepeatAt(
					rows.map((row) => ({
						sourceId: row.sourceId,
						firstSeenAt: row.firstSeenAt,
					})),
				),
			};
		})
		.filter(
			(summary): summary is NonNullable<typeof summary> => summary !== null,
		)
		.sort(sortBySourceCountThenLatest);
}

function buildArtistRepeats(
	encounters: EncounterLike[],
	sourceLabels: Map<Id<"musicFunnelSources">, SourceLabel>,
) {
	const rowsByArtistId = new Map<
		string,
		Array<{
			name: string;
			sourceId: Id<"musicFunnelSources">;
			spotifyTrackId: string;
			firstSeenAt: number;
		}>
	>();

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
			const sourceIds = uniqueSortedSourceIds(rows.map((row) => row.sourceId));
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			return {
				spotifyArtistId,
				name: first.name,
				sourceCount: sourceIds.length,
				sources: sourceIdsToLabels(sourceIds, sourceLabels),
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId))
					.size,
				firstSeenAt: Math.min(...rows.map((row) => row.firstSeenAt)),
				latestSeenAt: Math.max(...rows.map((row) => row.firstSeenAt)),
				becameRepeatAt: computeBecameRepeatAt(
					rows.map((row) => ({
						sourceId: row.sourceId,
						firstSeenAt: row.firstSeenAt,
					})),
				),
			};
		})
		.filter(
			(summary): summary is NonNullable<typeof summary> => summary !== null,
		)
		.sort(sortBySourceCountThenLatest);
}

function uniqueSourceIds(rows: EncounterLike[]): Id<"musicFunnelSources">[] {
	return uniqueSortedSourceIds(rows.map((row) => row.sourceId));
}

function uniqueSortedSourceIds(
	sourceIds: Id<"musicFunnelSources">[],
): Id<"musicFunnelSources">[] {
	return [...new Set(sourceIds)].sort();
}

function sourceIdsToLabels(
	sourceIds: Id<"musicFunnelSources">[],
	sourceLabels: Map<Id<"musicFunnelSources">, SourceLabel>,
): SourceLabel[] {
	return sourceIds.map((sourceId) => {
		const label = sourceLabels.get(sourceId);
		if (label) {
			return label;
		}
		return {
			sourceId,
			displayName: "Unknown source",
			curatorName: "Unknown",
		};
	});
}

function getRepeatTiming(rows: Array<{ firstSeenAt: number }>): {
	firstSeenAt: number;
	latestSeenAt: number;
} {
	const seenAtValues = rows.map((row) => row.firstSeenAt);
	return {
		firstSeenAt: Math.min(...seenAtValues),
		latestSeenAt: Math.max(...seenAtValues),
	};
}

function sortBySourceCountThenLatest<
	TRow extends { sourceCount: number; latestSeenAt: number },
>(a: TRow, b: TRow): number {
	return b.sourceCount - a.sourceCount || b.latestSeenAt - a.latestSeenAt;
}

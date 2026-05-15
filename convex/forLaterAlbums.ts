import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	type RymMatchResult,
	buildArtistKeys,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
} from "./_utils/albumMatching";
import {
	type ForLaterUiFilters,
	buildOpenableRymLinks,
	deriveRymStatus,
	normalizeForLaterFilters,
	sortForLaterRows,
} from "./_utils/forLaterAlbumsUi";
import { requireAuth } from "./auth";

const syncSourceValidator = v.union(v.literal("manual"), v.literal("cron"));
const syncStatusValidator = v.union(v.literal("success"), v.literal("failed"));
const matchMethodValidator = v.union(
	v.literal("spotify_id"),
	v.literal("title_artist"),
	v.literal("manual"),
);

const listenedFilterValidator = v.union(
	v.literal("all"),
	v.literal("listened"),
	v.literal("not_listened"),
);

const rymFilterValidator = v.union(
	v.literal("all"),
	v.literal("has_scrape"),
	v.literal("no_scrape"),
	v.literal("has_candidate"),
	v.literal("no_candidate"),
);

const playlistFilterValidator = v.union(
	v.literal("active"),
	v.literal("removed"),
	v.literal("all"),
);

const genreRoleFilterValidator = v.union(
	v.literal("primary"),
	v.literal("secondary"),
	v.literal("either"),
);

const forLaterFiltersValidator = v.object({
	genreKey: v.optional(v.string()),
	genreRole: v.optional(genreRoleFilterValidator),
	descriptorKey: v.optional(v.string()),
	title: v.optional(v.string()),
	artist: v.optional(v.string()),
	year: v.optional(v.number()),
	listened: v.optional(listenedFilterValidator),
	rymStatus: v.optional(rymFilterValidator),
	playlist: v.optional(playlistFilterValidator),
});

const tagValidator = v.object({
	key: v.string(),
	label: v.string(),
});

const forLaterAlbumRowValidator = v.object({
	id: v.string(),
	albumItemId: v.id("forLaterAlbumItems"),
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	name: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	releaseDate: v.optional(v.string()),
	releaseYear: v.optional(v.number()),
	playlistAddedAt: v.optional(v.number()),
	firstSeenAt: v.number(),
	createdAt: v.number(),
	lastSeenAt: v.number(),
	removedAt: v.optional(v.number()),
	isActive: v.boolean(),
	hasListened: v.boolean(),
	listenCount: v.number(),
	lastListenedAt: v.optional(v.number()),
	rymStatus: v.union(
		v.literal("matched"),
		v.literal("candidate"),
		v.literal("searching"),
		v.literal("not_found"),
		v.literal("failed"),
		v.literal("not_started"),
	),
	rymUrl: v.optional(v.string()),
	rymCandidateConfidence: v.optional(
		v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	),
	rymDiscoveryReason: v.optional(v.string()),
	rymMatchMethod: v.optional(
		v.union(
			v.literal("spotify_id"),
			v.literal("title_artist"),
			v.literal("manual"),
		),
	),
	primaryGenres: v.array(tagValidator),
	secondaryGenres: v.array(tagValidator),
	descriptors: v.array(tagValidator),
});

type ForLaterAlbumRow = {
	id: string;
	albumItemId: Id<"forLaterAlbumItems">;
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	releaseYear?: number;
	playlistAddedAt?: number;
	firstSeenAt: number;
	createdAt: number;
	lastSeenAt: number;
	removedAt?: number;
	isActive: boolean;
	hasListened: boolean;
	listenCount: number;
	lastListenedAt?: number;
	rymStatus:
		| "matched"
		| "candidate"
		| "searching"
		| "not_found"
		| "failed"
		| "not_started";
	rymUrl?: string;
	rymCandidateConfidence?: "high" | "medium" | "low";
	rymDiscoveryReason?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};

type LoadForLaterAlbumRowsResult = {
	page: ForLaterAlbumRow[];
	isDone: boolean;
	continueCursor: string;
};

function spotifyAlbumArtistKeys(doc: Doc<"spotifyAlbums">): string[] {
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

async function loadTagsForScrape(
	ctx: QueryCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<{
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
}> {
	const genreLinks = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	const descriptorLinks = await ctx.db
		.query("rateYourMusicReleaseDescriptors")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const primaryGenres: Array<{ key: string; label: string }> = [];
	const secondaryGenres: Array<{ key: string; label: string }> = [];
	const descriptors: Array<{ key: string; label: string }> = [];

	for (const link of genreLinks) {
		const genre = await ctx.db.get(link.genreId);
		if (!genre) continue;
		const tag = { key: genre.key, label: genre.label };
		if (link.role === "primary") {
			primaryGenres.push(tag);
		} else {
			secondaryGenres.push(tag);
		}
	}

	for (const link of descriptorLinks) {
		const descriptor = await ctx.db.get(link.descriptorId);
		if (descriptor) {
			descriptors.push({ key: descriptor.key, label: descriptor.label });
		}
	}

	return { primaryGenres, secondaryGenres, descriptors };
}

async function loadListenSummary(
	ctx: QueryCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<{
	hasListened: boolean;
	listenCount: number;
	lastListenedAt?: number;
}> {
	const userAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();

	if (!userAlbum) {
		return { hasListened: false, listenCount: 0 };
	}

	const listens = await ctx.db
		.query("userAlbumListens")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.collect();

	const lastListenedAt = listens.reduce<number | undefined>(
		(latest, listen) => {
			if (latest === undefined || listen.listenedAt > latest) {
				return listen.listenedAt;
			}
			return latest;
		},
		userAlbum.lastListenedAt,
	);

	return {
		hasListened: true,
		listenCount: userAlbum.listenCount,
		...(lastListenedAt !== undefined ? { lastListenedAt } : {}),
	};
}

function rowMatchesFilters(
	row: {
		name: string;
		artistName: string;
		releaseYear?: number;
		hasListened: boolean;
		rymStatus: string;
		rymUrl?: string;
		isActive: boolean;
		primaryGenres: Array<{ key: string }>;
		secondaryGenres: Array<{ key: string }>;
		descriptors: Array<{ key: string }>;
	},
	filters: ForLaterUiFilters,
): boolean {
	if (filters.playlist === "active" && !row.isActive) return false;
	if (filters.playlist === "removed" && row.isActive) return false;

	if (filters.listened === "listened" && !row.hasListened) return false;
	if (filters.listened === "not_listened" && row.hasListened) return false;

	if (filters.rymStatus === "has_scrape" && row.rymStatus !== "matched")
		return false;
	if (filters.rymStatus === "no_scrape" && row.rymStatus === "matched")
		return false;
	if (filters.rymStatus === "has_candidate" && !row.rymUrl) return false;
	if (filters.rymStatus === "no_candidate" && row.rymUrl) return false;

	if (filters.year !== undefined && row.releaseYear !== filters.year)
		return false;
	if (
		filters.title &&
		!row.name.toLowerCase().includes(filters.title.toLowerCase())
	) {
		return false;
	}
	if (
		filters.artist &&
		!row.artistName.toLowerCase().includes(filters.artist.toLowerCase())
	) {
		return false;
	}

	if (filters.genreKey) {
		const primaryMatch = row.primaryGenres.some(
			(tag) => tag.key === filters.genreKey,
		);
		const secondaryMatch = row.secondaryGenres.some(
			(tag) => tag.key === filters.genreKey,
		);
		if (filters.genreRole === "primary" && !primaryMatch) return false;
		if (filters.genreRole === "secondary" && !secondaryMatch) return false;
		if (filters.genreRole === "either" && !primaryMatch && !secondaryMatch)
			return false;
	}

	if (
		filters.descriptorKey &&
		!row.descriptors.some((tag) => tag.key === filters.descriptorKey)
	) {
		return false;
	}

	return true;
}

async function resolveRymContextForAlbum(
	ctx: QueryCtx,
	args: { albumId: Id<"spotifyAlbums">; item: Doc<"forLaterAlbumItems"> },
): Promise<{
	resolvedScrapeId: Id<"rateYourMusicScrapes"> | undefined;
	scrape: Doc<"rateYourMusicScrapes"> | null;
	linkMethod?: "spotify_id" | "title_artist" | "manual";
}> {
	if (args.item.rymScrapeId) {
		const scrape = await ctx.db.get(args.item.rymScrapeId);
		return {
			resolvedScrapeId: args.item.rymScrapeId,
			scrape,
			linkMethod: args.item.rymMatchMethod,
		};
	}

	const links = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
		.collect();

	if (links.length === 0) {
		return { resolvedScrapeId: undefined, scrape: null };
	}

	const sorted = [...links].sort((a, b) => b.updatedAt - a.updatedAt);
	const link = sorted[0];
	if (!link) {
		return { resolvedScrapeId: undefined, scrape: null };
	}

	const scrape = await ctx.db.get(link.scrapeId);
	return {
		resolvedScrapeId: link.scrapeId,
		scrape,
		linkMethod: link.method,
	};
}

async function loadForLaterAlbumRows(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: Partial<ForLaterUiFilters>;
		paginationOpts: { numItems: number; cursor: string | null };
	},
): Promise<LoadForLaterAlbumRowsResult> {
	const filters = normalizeForLaterFilters(args.filters);
	const targetItems = args.paginationOpts.numItems;
	const scanSize = Math.min(Math.max(targetItems * 4, 25), 100);
	const page: ForLaterAlbumRow[] = [];
	let cursor: string | null = args.paginationOpts.cursor;
	let lastContinueCursor = "";
	let isDone = false;

	while (page.length < targetItems && !isDone) {
		const result = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.paginate({ numItems: scanSize, cursor });

		lastContinueCursor = result.continueCursor;
		cursor = result.continueCursor;
		isDone = result.isDone;

		for (const item of result.page) {
			const album = await ctx.db.get(item.albumId);
			if (!album) continue;

			const { resolvedScrapeId, scrape, linkMethod } =
				await resolveRymContextForAlbum(ctx, {
					albumId: item.albumId,
					item,
				});

			const tags = resolvedScrapeId
				? await loadTagsForScrape(ctx, resolvedScrapeId)
				: { primaryGenres: [], secondaryGenres: [], descriptors: [] };

			const listenSummary = await loadListenSummary(ctx, {
				userId: args.userId,
				albumId: item.albumId,
			});

			const parsedYear = album.releaseDate
				? Number.parseInt(album.releaseDate.slice(0, 4), 10)
				: Number.NaN;

			const rymStatus = deriveRymStatus({
				rymScrapeId: resolvedScrapeId,
				rymCandidateUrl: item.rymCandidateUrl,
				rymDiscoveryStatus: item.rymDiscoveryStatus,
			});

			const rymUrl = scrape?.rymUrl ?? item.rymCandidateUrl;
			const rymMatchMethodOut = item.rymMatchMethod ?? linkMethod;

			const row: ForLaterAlbumRow = {
				id: String(item._id),
				albumItemId: item._id,
				albumId: item.albumId,
				spotifyAlbumId: item.spotifyAlbumId,
				name: album.name,
				artistName: album.artistName,
				...(album.imageUrl ? { imageUrl: album.imageUrl } : {}),
				...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
				...(Number.isFinite(parsedYear) ? { releaseYear: parsedYear } : {}),
				...(item.playlistAddedAt
					? { playlistAddedAt: item.playlistAddedAt }
					: {}),
				firstSeenAt: item.firstSeenAt,
				createdAt: item.createdAt,
				lastSeenAt: item.lastSeenAt,
				...(item.removedAt ? { removedAt: item.removedAt } : {}),
				isActive: item.isActive,
				...listenSummary,
				rymStatus,
				...(rymUrl ? { rymUrl } : {}),
				...(item.rymCandidateConfidence
					? { rymCandidateConfidence: item.rymCandidateConfidence }
					: {}),
				...(item.rymDiscoveryReason
					? { rymDiscoveryReason: item.rymDiscoveryReason }
					: {}),
				...(rymMatchMethodOut ? { rymMatchMethod: rymMatchMethodOut } : {}),
				...tags,
			};

			if (rowMatchesFilters(row, filters)) {
				page.push(row);
			}
			if (page.length >= targetItems) {
				break;
			}
		}
	}

	return {
		page: sortForLaterRows(page),
		isDone,
		continueCursor: lastContinueCursor,
	};
}

export const upsertForLaterAlbumItem = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.string(),
		albumTitleKey: v.string(),
		artistKeys: v.array(v.string()),
		sourceTrackIds: v.array(v.string()),
		playlistAddedAt: v.optional(v.number()),
		seenAt: v.number(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		itemId: Id<"forLaterAlbumItems">;
		isNew: boolean;
		rymMatch: RymMatchResult;
		rymMatchCreated: boolean;
	}> => {
		const sourceTrackIds = [...new Set(args.sourceTrackIds)].sort();
		const canonicalAlbum = await ctx.db.get(args.albumId);
		const albumTitleKey =
			canonicalAlbum !== null
				? normalizeAlbumTitle(canonicalAlbum.name)
				: args.albumTitleKey;
		const artistKeys =
			canonicalAlbum !== null
				? spotifyAlbumArtistKeys(canonicalAlbum)
				: args.artistKeys;

		const existing = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_spotifyAlbumId", (q) =>
				q.eq("userId", args.userId).eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();

		let itemId: Id<"forLaterAlbumItems">;
		let isNew: boolean;

		if (existing) {
			await ctx.db.patch(existing._id, {
				albumId: args.albumId,
				albumTitleKey,
				artistKeys,
				sourceTrackIds,
				playlistAddedAt: args.playlistAddedAt ?? existing.playlistAddedAt,
				lastSeenAt: args.seenAt,
				removedAt: undefined,
				isActive: true,
				updatedAt: args.seenAt,
			});

			itemId = existing._id;
			isNew = false;
		} else {
			itemId = await ctx.db.insert("forLaterAlbumItems", {
				userId: args.userId,
				albumId: args.albumId,
				spotifyAlbumId: args.spotifyAlbumId,
				albumTitleKey,
				artistKeys,
				sourceTrackIds,
				playlistAddedAt: args.playlistAddedAt,
				firstSeenAt: args.seenAt,
				lastSeenAt: args.seenAt,
				isActive: true,
				rymDiscoveryStatus: "not_started",
				createdAt: args.seenAt,
				updatedAt: args.seenAt,
			});

			isNew = true;
		}

		const rymMatch = await matchRymForForLaterAlbum(ctx, {
			userId: args.userId,
			forLaterAlbumItemId: itemId,
			spotifyAlbumId: args.spotifyAlbumId,
			albumTitleKey,
			artistKeys,
			now: args.seenAt,
		});

		return {
			itemId,
			isNew,
			rymMatch,
			rymMatchCreated: rymMatch.scrapeId !== undefined,
		};
	},
});

export const markForLaterAlbumsRemoved = mutation({
	args: {
		userId: v.string(),
		activeSpotifyAlbumIds: v.array(v.string()),
		removedAt: v.number(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ removedCount: number; removedSpotifyAlbumIds: string[] }> => {
		const activeItems = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const activeSpotifyAlbumIds = new Set(args.activeSpotifyAlbumIds);
		const removedSpotifyAlbumIds: string[] = [];

		for (const item of activeItems) {
			if (activeSpotifyAlbumIds.has(item.spotifyAlbumId)) {
				continue;
			}

			await ctx.db.patch(item._id, {
				isActive: false,
				removedAt: args.removedAt,
				updatedAt: args.removedAt,
			});
			removedSpotifyAlbumIds.push(item.spotifyAlbumId);
		}

		return {
			removedCount: removedSpotifyAlbumIds.length,
			removedSpotifyAlbumIds,
		};
	},
});

export const saveForLaterSyncRun = mutation({
	args: {
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		source: syncSourceValidator,
		status: syncStatusValidator,
		startedAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
		spotifySnapshotId: v.optional(v.string()),
		tracksFromPlaylist: v.number(),
		uniqueAlbumsFromPlaylist: v.number(),
		newAlbumsAdded: v.number(),
		existingAlbumsSeen: v.number(),
		albumsMarkedRemoved: v.number(),
		rymMatchesCreated: v.number(),
		rymDiscoveryQueued: v.number(),
		error: v.optional(v.string()),
		playlistNewestAddedAtMs: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<Id<"forLaterSyncRuns">> => {
		return await ctx.db.insert("forLaterSyncRuns", args);
	},
});

export const getForLaterLastSync = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();
	},
});

/** Most recent successful run (skips newer failures). Used for incremental Spotify added_at watermark. */
export const getForLaterLastSuccessfulSync = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(100);

		for (const row of rows) {
			if (row.status === "success") {
				return row;
			}
		}

		return null;
	},
});

export const getForLaterAlbumItems = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		const items = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		return items.slice(0, limit);
	},
});

export const getForLaterItemBySpotifyAlbumId = query({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_spotifyAlbumId", (q) =>
				q.eq("userId", args.userId).eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();
	},
});

export const getForLaterUiSummary = query({
	args: { userId: v.string() },
	returns: v.object({
		activeCount: v.number(),
		removedCount: v.number(),
		lastSync: v.union(
			v.null(),
			v.object({
				status: v.union(v.literal("success"), v.literal("failed")),
				completedAt: v.number(),
				error: v.optional(v.string()),
				spotifyPlaylistId: v.string(),
			}),
		),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const activeRows = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const removedRows = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", false),
			)
			.collect();
		const lastSync = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		return {
			activeCount: activeRows.length,
			removedCount: removedRows.length,
			lastSync: lastSync
				? {
						status: lastSync.status,
						completedAt: lastSync.completedAt,
						...(lastSync.error ? { error: lastSync.error } : {}),
						spotifyPlaylistId: lastSync.spotifyPlaylistId,
					}
				: null,
		};
	},
});

export const listForLaterAlbumRows = query({
	args: {
		userId: v.string(),
		filters: forLaterFiltersValidator,
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object({
		page: v.array(forLaterAlbumRowValidator),
		isDone: v.boolean(),
		continueCursor: v.string(),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await loadForLaterAlbumRows(ctx, args);
	},
});

export const listOpenableRymLinks = query({
	args: {
		userId: v.string(),
		filters: forLaterFiltersValidator,
		limit: v.number(),
	},
	returns: v.array(
		v.object({
			id: v.string(),
			url: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const rows = await loadForLaterAlbumRows(ctx, {
			userId: args.userId,
			filters: args.filters,
			paginationOpts: {
				numItems: Math.min(Math.max(args.limit * 4, 25), 100),
				cursor: null,
			},
		});

		return buildOpenableRymLinks(
			rows.page.map((row) => ({ id: row.id, rymUrl: row.rymUrl })),
			args.limit,
		);
	},
});

export const queueForLaterRymDiscovery = mutation({
	args: {
		userId: v.string(),
		forLaterAlbumItemIds: v.array(v.id("forLaterAlbumItems")),
	},
	returns: v.object({ queued: v.number() }),
	handler: async (ctx, args): Promise<{ queued: number }> => {
		requireAuth(ctx);
		const now = Date.now();
		let queued = 0;
		for (const id of args.forLaterAlbumItemIds) {
			const doc = await ctx.db.get(id);
			if (!doc || doc.userId !== args.userId) {
				continue;
			}
			await ctx.db.patch(id, {
				rymDiscoveryStatus: "queued",
				rymDiscoveryUpdatedAt: now,
				updatedAt: now,
			});
			queued++;
		}
		return { queued };
	},
});

export const patchForLaterRymMatch = mutation({
	args: {
		itemId: v.id("forLaterAlbumItems"),
		rymScrapeId: v.id("rateYourMusicScrapes"),
		rymMatchMethod: matchMethodValidator,
		rymMatchedAt: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		await ctx.db.patch(args.itemId, {
			rymScrapeId: args.rymScrapeId,
			rymMatchMethod: args.rymMatchMethod,
			rymMatchedAt: args.rymMatchedAt,
			updatedAt: args.rymMatchedAt,
		});
	},
});

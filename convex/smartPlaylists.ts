import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	durationMsMatchesForLaterFilter,
	releaseYearMatchesForLaterFilter,
	taxonomyKeysPassAgainstSet,
} from "./_utils/forLaterAlbumsUi";
import { durationBucketKeyFromMinutes } from "./_utils/forLaterDurationBuckets";
import {
	buildFilterGenreKeysSortedWithAncestors,
	loadRymGenreParentKeysByChild,
} from "./_utils/forLaterFilterProjection";
import { resolveAddedWindow } from "./_utils/smartPlaylistAddedWindow";
import {
	smartPlaylistFiltersValidator,
	smartPlaylistSourceValidator,
	smartPlaylistSyncModeValidator,
	smartPlaylistSyncStatusValidator,
	trackSelectionValidator,
} from "./_utils/smartPlaylistValidators";

type DbCtx = QueryCtx | MutationCtx;

type SmartPlaylistFilters = {
	genreKeys: string[];
	genreMatch: "all" | "any";
	primaryGenresOnly: boolean;
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin?: number;
	ratingMax?: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: string;
	addedWindow?:
		| { type: "absolute"; afterMs?: number; beforeMs?: number }
		| { type: "relative"; unit: "days" | "months"; amount: number }
		| { type: "calendar_month"; year: number; month: number };
};

type MatchedAlbum = {
	spotifyAlbumId: string;
	albumId: Id<"spotifyAlbums">;
	name: string;
	artistName: string;
	totalTracks: number;
};

const PREVIEW_ALBUM_LIMIT = 20;

const matchedAlbumValidator = v.object({
	spotifyAlbumId: v.string(),
	albumId: v.id("spotifyAlbums"),
	name: v.string(),
	artistName: v.string(),
	totalTracks: v.number(),
});

const recipeValidator = v.object({
	_id: v.id("smartPlaylists"),
	_creationTime: v.number(),
	userId: v.string(),
	name: v.string(),
	spotifyPlaylistId: v.string(),
	source: smartPlaylistSourceValidator,
	filters: smartPlaylistFiltersValidator,
	syncMode: smartPlaylistSyncModeValidator,
	trackSelection: trackSelectionValidator,
	isPaused: v.boolean(),
	syncedAlbumIds: v.array(v.string()),
	syncedTrackUris: v.array(v.string()),
	contentHash: v.optional(v.string()),
	matchAlbumCount: v.number(),
	matchTrackCount: v.number(),
	lastSyncedAt: v.optional(v.number()),
	syncStatus: smartPlaylistSyncStatusValidator,
	lastError: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

function ratingMatchesBounds(
	rating: number | undefined,
	filters: Pick<SmartPlaylistFilters, "ratingMin" | "ratingMax">,
): boolean {
	if (filters.ratingMin === undefined && filters.ratingMax === undefined) {
		return true;
	}
	if (rating === undefined) {
		return false;
	}
	if (filters.ratingMin !== undefined && rating < filters.ratingMin) {
		return false;
	}
	if (filters.ratingMax !== undefined && rating > filters.ratingMax) {
		return false;
	}
	return true;
}

function yearMatchesFilters(
	releaseYear: number | undefined,
	filters: Pick<SmartPlaylistFilters, "yearMin" | "yearMax">,
): boolean {
	return releaseYearMatchesForLaterFilter(releaseYear, {
		genreKeys: [],
		descriptorKeys: [],
		yearMin: filters.yearMin,
		yearMax: filters.yearMax,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
}

function durationMatchesFilters(
	durationMs: number | undefined,
	filters: Pick<
		SmartPlaylistFilters,
		"durationMinMinutes" | "durationMaxMinutes" | "durationBucketKey"
	>,
): boolean {
	return durationMsMatchesForLaterFilter(durationMs, {
		genreKeys: [],
		descriptorKeys: [],
		durationMinMinutes: filters.durationMinMinutes,
		durationMaxMinutes: filters.durationMaxMinutes,
		durationBucketKey: durationBucketKeyFromMinutes(filters.durationBucketKey),
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
}

function addedAtMatchesWindow(
	addedAt: number,
	range: { afterMs?: number; beforeMs?: number } | null,
): boolean {
	if (range === null) {
		return true;
	}
	if (range.afterMs !== undefined && addedAt < range.afterMs) {
		return false;
	}
	// beforeMs is exclusive (calendar_month uses start of next month)
	if (range.beforeMs !== undefined && addedAt >= range.beforeMs) {
		return false;
	}
	return true;
}

function genreKeySetFromTags(
	primary: Array<{ key: string }>,
	secondary: Array<{ key: string }>,
	primaryOnly: boolean,
): Set<string> {
	const keys = new Set<string>();
	for (const tag of primary) {
		keys.add(tag.key);
	}
	if (!primaryOnly) {
		for (const tag of secondary) {
			keys.add(tag.key);
		}
	}
	return keys;
}

async function loadPrimaryGenreKeysForScrape(
	ctx: DbCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<Set<string>> {
	const genreLinks = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const keys = new Set<string>();
	for (const link of genreLinks) {
		if (link.role !== "primary") {
			continue;
		}
		const genre = await ctx.db.get(link.genreId);
		if (genre) {
			keys.add(genre.key);
		}
	}
	return keys;
}

async function loadUserAlbumByAlbumId(
	ctx: DbCtx,
	userId: string,
): Promise<Map<Id<"spotifyAlbums">, Doc<"userAlbums">>> {
	const rows = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();

	const map = new Map<Id<"spotifyAlbums">, Doc<"userAlbums">>();
	for (const row of rows) {
		map.set(row.albumId, row);
	}
	return map;
}

async function resolveForLaterMatches(
	ctx: DbCtx,
	args: {
		userId: string;
		filters: SmartPlaylistFilters;
		now: number;
	},
): Promise<MatchedAlbum[]> {
	const items = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_active", (q) =>
			q.eq("userId", args.userId).eq("isActive", true),
		)
		.collect();

	const needsRating =
		args.filters.ratingMin !== undefined ||
		args.filters.ratingMax !== undefined;
	const userAlbumsByAlbumId = needsRating
		? await loadUserAlbumByAlbumId(ctx, args.userId)
		: null;

	const addedRange = args.filters.addedWindow
		? resolveAddedWindow(args.filters.addedWindow, args.now)
		: null;

	const needsPrimaryGenreLoad =
		args.filters.primaryGenresOnly && args.filters.genreKeys.length > 0;
	const parentKeysByChild = needsPrimaryGenreLoad
		? await loadRymGenreParentKeysByChild(ctx)
		: null;

	type Candidate = {
		item: Doc<"forLaterAlbumItems">;
		album: Doc<"spotifyAlbums">;
		sortAt: number;
	};

	const candidates: Candidate[] = [];

	for (const item of items) {
		if (item.markedAsSingle === true || item.removedFromForLater === true) {
			continue;
		}

		if (!yearMatchesFilters(item.filterReleaseYear, args.filters)) {
			continue;
		}

		if (!durationMatchesFilters(item.filterDurationMs, args.filters)) {
			continue;
		}

		const addedAt =
			item.playlistAddedAt ?? item.firstSeenAt ?? item.createdAt;
		if (!addedAtMatchesWindow(addedAt, addedRange)) {
			continue;
		}

		if (needsRating) {
			const userAlbum = userAlbumsByAlbumId?.get(item.albumId);
			if (!ratingMatchesBounds(userAlbum?.rating, args.filters)) {
				continue;
			}
		}

		if (
			!taxonomyKeysPassAgainstSet(
				args.filters.descriptorKeys,
				args.filters.descriptorMatch,
				new Set(item.filterDescriptorKeysSorted ?? []),
			)
		) {
			continue;
		}

		if (args.filters.genreKeys.length > 0) {
			let genreKeys: Set<string>;
			if (needsPrimaryGenreLoad) {
				if (!item.rymScrapeId || !parentKeysByChild) {
					continue;
				}
				const primaryKeys = await loadPrimaryGenreKeysForScrape(
					ctx,
					item.rymScrapeId,
				);
				genreKeys = new Set(
					buildFilterGenreKeysSortedWithAncestors(
						[...primaryKeys],
						parentKeysByChild,
					),
				);
			} else {
				genreKeys = new Set(item.filterGenreKeysSorted ?? []);
			}
			if (
				!taxonomyKeysPassAgainstSet(
					args.filters.genreKeys,
					args.filters.genreMatch,
					genreKeys,
				)
			) {
				continue;
			}
		}

		const album = await ctx.db.get(item.albumId);
		if (!album) {
			continue;
		}

		candidates.push({
			item,
			album,
			sortAt: addedAt,
		});
	}

	candidates.sort((a, b) => b.sortAt - a.sortAt);

	return candidates.map((c) => ({
		spotifyAlbumId: c.item.spotifyAlbumId,
		albumId: c.item.albumId,
		name: c.album.name,
		artistName: c.album.artistName,
		totalTracks: c.album.totalTracks,
	}));
}

async function resolveRankingsMatches(
	ctx: DbCtx,
	args: {
		userId: string;
		filters: SmartPlaylistFilters;
	},
): Promise<MatchedAlbum[]> {
	const libraryItems = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
		.collect();

	const rated = libraryItems.filter((item) => item.rating !== undefined);

	const needsDuration =
		args.filters.durationBucketKey !== undefined ||
		args.filters.durationMinMinutes !== undefined ||
		args.filters.durationMaxMinutes !== undefined;

	const albumByAlbumId = new Map<Id<"spotifyAlbums">, Doc<"spotifyAlbums">>();
	if (needsDuration) {
		for (const item of rated) {
			if (albumByAlbumId.has(item.albumId)) {
				continue;
			}
			const album = await ctx.db.get(item.albumId);
			if (album) {
				albumByAlbumId.set(item.albumId, album);
			}
		}
	}

	const userAlbumsByAlbumId = await loadUserAlbumByAlbumId(ctx, args.userId);
	const parentKeysByChild =
		args.filters.genreKeys.length > 0
			? await loadRymGenreParentKeysByChild(ctx)
			: null;

	type Candidate = {
		item: Doc<"albumLibraryItems">;
		rating: number;
		position: number;
	};

	const candidates: Candidate[] = [];

	for (const item of rated) {
		const rating = item.rating;
		if (rating === undefined) {
			continue;
		}

		if (!ratingMatchesBounds(rating, args.filters)) {
			continue;
		}

		if (!yearMatchesFilters(item.releaseYear, args.filters)) {
			continue;
		}

		if (needsDuration) {
			const durationMs = albumByAlbumId.get(item.albumId)?.totalDurationMs;
			if (!durationMatchesFilters(durationMs, args.filters)) {
				continue;
			}
		}

		const directGenreKeys = genreKeySetFromTags(
			item.primaryGenres,
			item.secondaryGenres,
			args.filters.primaryGenresOnly,
		);
		const genreKeys =
			parentKeysByChild !== null
				? new Set(
						buildFilterGenreKeysSortedWithAncestors(
							[...directGenreKeys],
							parentKeysByChild,
						),
					)
				: directGenreKeys;
		if (
			!taxonomyKeysPassAgainstSet(
				args.filters.genreKeys,
				args.filters.genreMatch,
				genreKeys,
			)
		) {
			continue;
		}

		if (
			!taxonomyKeysPassAgainstSet(
				args.filters.descriptorKeys,
				args.filters.descriptorMatch,
				new Set(item.descriptors.map((d) => d.key)),
			)
		) {
			continue;
		}

		const userAlbum = userAlbumsByAlbumId.get(item.albumId);
		candidates.push({
			item,
			rating,
			position: userAlbum?.position ?? Number.POSITIVE_INFINITY,
		});
	}

	candidates.sort((a, b) => {
		const ratingDiff = b.rating - a.rating;
		if (ratingDiff !== 0) {
			return ratingDiff;
		}
		const positionDiff = a.position - b.position;
		if (positionDiff !== 0) {
			return positionDiff;
		}
		return a.item.name.localeCompare(b.item.name);
	});

	return Promise.all(
		candidates.map(async (c) => {
			let album = albumByAlbumId.get(c.item.albumId);
			if (!album) {
				const loaded = await ctx.db.get(c.item.albumId);
				if (!loaded) {
					throw new Error(`Album not found: ${c.item.albumId}`);
				}
				album = loaded;
			}

			return {
				spotifyAlbumId: c.item.spotifyAlbumId,
				albumId: c.item.albumId,
				name: c.item.name,
				artistName: c.item.artistName,
				totalTracks: album.totalTracks,
			};
		}),
	);
}

async function resolveMatchingAlbums(
	ctx: DbCtx,
	args: {
		userId: string;
		source: "forLater" | "rankings";
		filters: SmartPlaylistFilters;
		now: number;
	},
): Promise<MatchedAlbum[]> {
	if (args.source === "forLater") {
		return await resolveForLaterMatches(ctx, {
			userId: args.userId,
			filters: args.filters,
			now: args.now,
		});
	}

	return await resolveRankingsMatches(ctx, {
		userId: args.userId,
		filters: args.filters,
	});
}

async function requireOwnedRecipe(
	ctx: DbCtx,
	args: { userId: string; recipeId: Id<"smartPlaylists"> },
): Promise<Doc<"smartPlaylists">> {
	const recipe = await ctx.db.get(args.recipeId);
	if (!recipe || recipe.userId !== args.userId) {
		throw new Error("Recipe not found");
	}
	return recipe;
}

export const listRecipes = query({
	args: {
		userId: v.string(),
	},
	returns: v.array(recipeValidator),
	handler: async (ctx, args) => {
		const recipes = await ctx.db
			.query("smartPlaylists")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		return recipes.sort((a, b) => b.updatedAt - a.updatedAt);
	},
});

export const getRecipe = query({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
	},
	returns: v.union(recipeValidator, v.null()),
	handler: async (ctx, args) => {
		const recipe = await ctx.db.get(args.recipeId);
		if (!recipe || recipe.userId !== args.userId) {
			return null;
		}
		return recipe;
	},
});

export const previewMatches = query({
	args: {
		userId: v.string(),
		source: smartPlaylistSourceValidator,
		filters: smartPlaylistFiltersValidator,
		now: v.number(),
	},
	returns: v.object({
		albums: v.array(matchedAlbumValidator),
		albumCount: v.number(),
	}),
	handler: async (ctx, args) => {
		const albums = await resolveMatchingAlbums(ctx, {
			userId: args.userId,
			source: args.source,
			filters: args.filters,
			now: args.now,
		});

		return {
			albums: albums.slice(0, PREVIEW_ALBUM_LIMIT),
			albumCount: albums.length,
		};
	},
});

/** Full ordered match list for sync (Task 6). */
export const resolveMatches = query({
	args: {
		userId: v.string(),
		source: smartPlaylistSourceValidator,
		filters: smartPlaylistFiltersValidator,
		now: v.number(),
	},
	returns: v.array(matchedAlbumValidator),
	handler: async (ctx, args) => {
		return await resolveMatchingAlbums(ctx, {
			userId: args.userId,
			source: args.source,
			filters: args.filters,
			now: args.now,
		});
	},
});

export const insertRecipe = mutation({
	args: {
		userId: v.string(),
		name: v.string(),
		spotifyPlaylistId: v.string(),
		source: smartPlaylistSourceValidator,
		filters: smartPlaylistFiltersValidator,
		syncMode: smartPlaylistSyncModeValidator,
		trackSelection: v.optional(trackSelectionValidator),
	},
	returns: v.id("smartPlaylists"),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("smartPlaylists", {
			userId: args.userId,
			name: args.name.trim(),
			spotifyPlaylistId: args.spotifyPlaylistId,
			source: args.source,
			filters: args.filters,
			syncMode: args.syncMode,
			trackSelection: args.trackSelection ?? { mode: "allTracks" },
			isPaused: false,
			syncedAlbumIds: [],
			syncedTrackUris: [],
			matchAlbumCount: 0,
			matchTrackCount: 0,
			syncStatus: "never",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateRecipe = mutation({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
		name: v.optional(v.string()),
		filters: v.optional(smartPlaylistFiltersValidator),
		syncMode: v.optional(smartPlaylistSyncModeValidator),
		isPaused: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedRecipe(ctx, {
			userId: args.userId,
			recipeId: args.recipeId,
		});

		const patch: {
			name?: string;
			filters?: SmartPlaylistFilters;
			syncMode?: "mirror" | "addOnly";
			isPaused?: boolean;
			updatedAt: number;
		} = {
			updatedAt: Date.now(),
		};

		if (args.name !== undefined) {
			patch.name = args.name.trim();
		}
		if (args.filters !== undefined) {
			patch.filters = args.filters;
		}
		if (args.syncMode !== undefined) {
			patch.syncMode = args.syncMode;
		}
		if (args.isPaused !== undefined) {
			patch.isPaused = args.isPaused;
		}

		await ctx.db.patch(args.recipeId, patch);
		return null;
	},
});

export const setPaused = mutation({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
		isPaused: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedRecipe(ctx, {
			userId: args.userId,
			recipeId: args.recipeId,
		});

		await ctx.db.patch(args.recipeId, {
			isPaused: args.isPaused,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const removeRecipe = mutation({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedRecipe(ctx, {
			userId: args.userId,
			recipeId: args.recipeId,
		});

		await ctx.db.delete(args.recipeId);
		return null;
	},
});

export const commitSyncSuccess = mutation({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
		syncedAlbumIds: v.array(v.string()),
		syncedTrackUris: v.array(v.string()),
		contentHash: v.string(),
		matchAlbumCount: v.number(),
		matchTrackCount: v.number(),
		lastSyncedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedRecipe(ctx, {
			userId: args.userId,
			recipeId: args.recipeId,
		});

		await ctx.db.patch(args.recipeId, {
			syncedAlbumIds: args.syncedAlbumIds,
			syncedTrackUris: args.syncedTrackUris,
			contentHash: args.contentHash,
			matchAlbumCount: args.matchAlbumCount,
			matchTrackCount: args.matchTrackCount,
			lastSyncedAt: args.lastSyncedAt,
			syncStatus: "ok",
			lastError: undefined,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const commitSyncFailure = mutation({
	args: {
		userId: v.string(),
		recipeId: v.id("smartPlaylists"),
		lastError: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedRecipe(ctx, {
			userId: args.userId,
			recipeId: args.recipeId,
		});

		await ctx.db.patch(args.recipeId, {
			syncStatus: "error",
			lastError: args.lastError,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const listActiveRecipesForUser = query({
	args: {
		userId: v.string(),
	},
	returns: v.array(recipeValidator),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("smartPlaylists")
			.withIndex("by_userId_and_isPaused", (q) =>
				q.eq("userId", args.userId).eq("isPaused", false),
			)
			.collect();
	},
});

export const listCanonicalTrackUrisByAlbum = query({
	args: {
		spotifyAlbumId: v.string(),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const tracks = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.collect();

		tracks.sort(
			(a, b) => (a.trackNumber ?? Number.MAX_SAFE_INTEGER) -
				(b.trackNumber ?? Number.MAX_SAFE_INTEGER),
		);

		return tracks.map((track) => `spotify:track:${track.spotifyTrackId}`);
	},
});

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
	releaseYearMatchesForLaterFilter,
	taxonomyKeysPassAgainstSet,
} from "./_utils/forLaterAlbumsUi";
import {
	buildFilterGenreKeysSortedWithAncestors,
	loadRymGenreParentKeysByChild,
} from "./_utils/forLaterFilterProjection";
import { resolveAddedWindow } from "./_utils/smartPlaylistAddedWindow";
import {
	type LegacySmartPlaylistFilters,
	type SmartPlaylistFiltersV2,
	albumMatchesDurationFilter,
	isLegacySmartPlaylistFilters,
	isRatingFilterActive,
	migrateLegacySmartPlaylistFilters,
	normalizeSmartPlaylistFilters,
} from "./_utils/smartPlaylistFilterModel";
import { albumMatchesGenreClauses } from "./_utils/smartPlaylistGenreMatch";
import {
	smartPlaylistFiltersValidator,
	smartPlaylistSourceValidator,
	smartPlaylistSyncModeValidator,
	smartPlaylistSyncStatusValidator,
	trackSelectionValidator,
} from "./_utils/smartPlaylistValidators";

type DbCtx = QueryCtx | MutationCtx;

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
	filters: { ratingMin: number; ratingMax: number },
): boolean {
	if (!isRatingFilterActive(filters)) return true;
	if (rating === undefined) return false;
	return rating >= filters.ratingMin && rating <= filters.ratingMax;
}

function yearMatchesFilters(
	releaseYear: number | undefined,
	filters: { yearMin?: number; yearMax?: number },
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
	filters: {
		durationMinMinutes?: number;
		durationMaxMinutes?: number;
		durationOpenLow?: boolean;
		durationOpenHigh?: boolean;
	},
): boolean {
	return albumMatchesDurationFilter(durationMs, filters);
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

function genreKeySetsFromTags(
	primary: Array<{ key: string }>,
	secondary: Array<{ key: string }>,
): { primary: Set<string>; secondary: Set<string> } {
	return {
		primary: new Set(primary.map((tag) => tag.key)),
		secondary: new Set(secondary.map((tag) => tag.key)),
	};
}

async function loadGenreRoleKeysForScrape(
	ctx: DbCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<{ primary: Set<string>; secondary: Set<string> }> {
	const genreLinks = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const primary = new Set<string>();
	const secondary = new Set<string>();
	for (const link of genreLinks) {
		const genre = await ctx.db.get(link.genreId);
		if (!genre) continue;
		if (link.role === "primary") primary.add(genre.key);
		else if (link.role === "secondary") secondary.add(genre.key);
	}
	return { primary, secondary };
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
		filters: SmartPlaylistFiltersV2;
		now: number;
	},
): Promise<MatchedAlbum[]> {
	const items = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_active", (q) =>
			q.eq("userId", args.userId).eq("isActive", true),
		)
		.collect();

	const needsRating = isRatingFilterActive(args.filters);
	const userAlbumsByAlbumId = needsRating
		? await loadUserAlbumByAlbumId(ctx, args.userId)
		: null;

	const addedRange = args.filters.addedWindow
		? resolveAddedWindow(args.filters.addedWindow, args.now)
		: null;

	const needsGenreLoad = args.filters.genreClauses.length > 0;
	const parentKeysByChild = needsGenreLoad
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

		const addedAt = item.playlistAddedAt ?? item.firstSeenAt ?? item.createdAt;
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

		if (args.filters.genreClauses.length > 0) {
			if (!item.rymScrapeId || !parentKeysByChild) {
				continue;
			}
			const roles = await loadGenreRoleKeysForScrape(ctx, item.rymScrapeId);
			const primaryKeys = new Set(
				buildFilterGenreKeysSortedWithAncestors(
					[...roles.primary],
					parentKeysByChild,
				),
			);
			const secondaryKeys = new Set(
				buildFilterGenreKeysSortedWithAncestors(
					[...roles.secondary],
					parentKeysByChild,
				),
			);
			if (
				!albumMatchesGenreClauses(
					primaryKeys,
					secondaryKeys,
					args.filters.genreClauses,
					args.filters.genreMatch,
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
		filters: SmartPlaylistFiltersV2;
	},
): Promise<MatchedAlbum[]> {
	const libraryItems = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
		.collect();

	const rated = libraryItems.filter((item) => item.rating !== undefined);

	const needsDuration =
		args.filters.durationOpenLow !== true ||
		args.filters.durationOpenHigh !== true;

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
		args.filters.genreClauses.length > 0
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

		const directGenreKeys = genreKeySetsFromTags(
			item.primaryGenres,
			item.secondaryGenres,
		);
		const primaryKeys =
			parentKeysByChild !== null
				? new Set(
						buildFilterGenreKeysSortedWithAncestors(
							[...directGenreKeys.primary],
							parentKeysByChild,
						),
					)
				: directGenreKeys.primary;
		const secondaryKeys =
			parentKeysByChild !== null
				? new Set(
						buildFilterGenreKeysSortedWithAncestors(
							[...directGenreKeys.secondary],
							parentKeysByChild,
						),
					)
				: directGenreKeys.secondary;
		if (
			!albumMatchesGenreClauses(
				primaryKeys,
				secondaryKeys,
				args.filters.genreClauses,
				args.filters.genreMatch,
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

	const matches: MatchedAlbum[] = [];
	for (const c of candidates) {
		let album = albumByAlbumId.get(c.item.albumId);
		if (!album) {
			const loaded = await ctx.db.get(c.item.albumId);
			if (!loaded) {
				continue;
			}
			album = loaded;
		}

		matches.push({
			spotifyAlbumId: c.item.spotifyAlbumId,
			albumId: c.item.albumId,
			name: c.item.name,
			artistName: c.item.artistName,
			totalTracks: album.totalTracks,
		});
	}
	return matches;
}

async function resolveMatchingAlbums(
	ctx: DbCtx,
	args: {
		userId: string;
		source: "forLater" | "rankings";
		filters: Doc<"smartPlaylists">["filters"];
		now: number;
	},
): Promise<MatchedAlbum[]> {
	const filters = normalizeSmartPlaylistFilters(args.filters);

	const matches =
		args.source === "forLater"
			? await resolveForLaterMatches(ctx, {
					userId: args.userId,
					filters,
					now: args.now,
				})
			: await resolveRankingsMatches(ctx, {
					userId: args.userId,
					filters,
				});

	const excluded = new Set(filters.excludedAlbumIds);
	return matches.filter((album) => !excluded.has(album.albumId));
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
		estimatedTrackCount: v.number(),
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
			estimatedTrackCount: albums.reduce(
				(sum, album) => sum + album.totalTracks,
				0,
			),
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
			filters?: Doc<"smartPlaylists">["filters"];
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
			(a, b) =>
				(a.trackNumber ?? Number.MAX_SAFE_INTEGER) -
				(b.trackNumber ?? Number.MAX_SAFE_INTEGER),
		);

		return tracks.map((track) => `spotify:track:${track.spotifyTrackId}`);
	},
});

// Run once from Convex dashboard: internal.smartPlaylists.migrateFiltersToV2
export const migrateFiltersToV2 = internalMutation({
	args: {},
	returns: v.object({
		scanned: v.number(),
		migrated: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx) => {
		const recipes = await ctx.db.query("smartPlaylists").collect();
		let migrated = 0;
		let skipped = 0;
		for (const recipe of recipes) {
			const filters = recipe.filters as
				| LegacySmartPlaylistFilters
				| SmartPlaylistFiltersV2;
			if (!isLegacySmartPlaylistFilters(filters)) {
				skipped += 1;
				continue;
			}
			const next = migrateLegacySmartPlaylistFilters(filters);
			await ctx.db.patch(recipe._id, {
				filters: {
					...next,
					excludedAlbumIds: [] as Id<"spotifyAlbums">[],
				},
				updatedAt: Date.now(),
			});
			migrated += 1;
		}
		return { scanned: recipes.length, migrated, skipped };
	},
});

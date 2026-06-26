import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
	type RymMatchResult,
	buildArtistKeys,
	linkRymScrapeToSpotifyAlbum,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
} from "./_utils/albumMatching";
import {
	type ForLaterAlbumRowFilterInput,
	type ForLaterUiFilters,
	deriveRymStatus,
	forLaterFiltersAllowDescriptorFacetPagination,
	forLaterFiltersAllowGenreFacetPagination,
	forLaterFiltersAllowIndexedScan,
	forLaterPostFilterScanSize,
	forLaterSingleIndexedReleaseYear,
	normalizeForLaterFilters,
	rowMatchesFilters,
	sortForLaterRows,
} from "./_utils/forLaterAlbumsUi";
import {
	buildDirectFilterGenreKeys,
	buildFilterDescriptorKeysSorted,
	buildFilterGenreKeysSortedWithAncestors,
	buildFilterSearchText,
	loadRymGenreParentKeysByChild,
	parseReleaseYearFromIsoDate,
} from "./_utils/forLaterFilterProjection";
import { chooseIndexedForLaterListScan } from "./_utils/forLaterIndexedList";
import { projectionMatchesFilters } from "./_utils/forLaterProjectionPredicate";
import {
	type AddedTimeframeAnswer,
	type ForLaterRecommendationAnswers,
	type ForLaterRecommendationCandidate,
	type RatingTierAnswer,
	type RecommendationTagInput,
	type RecommendationTagOption,
	type ReleaseTimeAnswer,
	buildSavedRecommendationAlbumRefs,
	buildSubgenreCountsForTopLevel,
	buildTopLevelGenreCounts,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	normalizeRecommendationCount,
	sortRecommendationTagOptionsByCount,
} from "./_utils/forLaterRecommendations";
import { buildOpenableGoogleRymSearchLinks } from "./_utils/google_rym_lucky_search";
import {
	buildChildKeysByParentKey,
	collectDescendantGenreKeys,
} from "./_utils/rymGenreHierarchy";
import {
	collectMappedRymScrapeIds,
	isRymScrapeMappedElsewhere,
	scrapeMatchesSearch,
} from "./_utils/unmappedRymScrapes";
import { requireAuth } from "./auth";

type ForLaterDbCtx = QueryCtx | MutationCtx;

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
	v.literal("not_on_rym"),
);

const taxonomyMatchValidator = v.union(v.literal("all"), v.literal("any"));

const forLaterFiltersValidator = v.object({
	genreKeys: v.optional(v.array(v.string())),
	descriptorKeys: v.optional(v.array(v.string())),
	search: v.optional(v.string()),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	/** @deprecated Use yearMin/yearMax */
	year: v.optional(v.number()),
	listened: v.optional(listenedFilterValidator),
	rymStatus: v.optional(rymFilterValidator),
	genreMatch: v.optional(taxonomyMatchValidator),
	descriptorMatch: v.optional(taxonomyMatchValidator),
	/** @deprecated Use genreMatch and descriptorMatch; still accepted for backward compatibility. */
	filterMatch: v.optional(taxonomyMatchValidator),
});

const recommendationAddedTimeframeValidator = v.union(
	v.literal("day"),
	v.literal("week"),
	v.literal("month"),
	v.literal("two_months"),
	v.literal("older_than_two_months"),
	v.literal("any"),
);

const recommendationReleaseTimeValidator = v.union(
	v.literal("new_release"),
	v.literal("recent"),
	v.literal("modern"),
	v.literal("old"),
	v.literal("any"),
);

const recommendationRatingTierValidator = v.union(
	v.literal("holy_moly"),
	v.literal("really_enjoyed"),
	v.literal("good"),
	v.literal("any"),
);

const recommendationAnswersValidator = v.object({
	addedTimeframe: recommendationAddedTimeframeValidator,
	genreKey: v.string(),
	releaseTime: recommendationReleaseTimeValidator,
	descriptorKey: v.string(),
	ratingTier: recommendationRatingTierValidator,
	count: v.number(),
});

const recommendationOptionValidator = v.object({
	key: v.string(),
	label: v.string(),
	count: v.number(),
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
	userAlbumId: v.optional(v.id("userAlbums")),
	listenCount: v.number(),
	lastListenedAt: v.optional(v.number()),
	rating: v.optional(v.number()),
	rymStatus: v.union(v.literal("matched"), v.literal("unmatched")),
	rymUrl: v.optional(v.string()),
	rymMatchMethod: v.optional(
		v.union(
			v.literal("spotify_id"),
			v.literal("title_artist"),
			v.literal("manual"),
		),
	),
	rymNotOnSite: v.optional(v.boolean()),
	markedAsSingle: v.optional(v.boolean()),
	removedFromForLater: v.optional(v.boolean()),
	primaryGenres: v.array(tagValidator),
	secondaryGenres: v.array(tagValidator),
	descriptors: v.array(tagValidator),
});

const recommendationResultFields = {
	rows: v.array(forLaterAlbumRowValidator),
	matchingCount: v.number(),
	requestedCount: v.number(),
	returnedCount: v.number(),
	wasLimitedByPool: v.boolean(),
};

const recommendationResultValidator = v.object(recommendationResultFields);

const savedRecommendationResultValidator = v.object({
	recommendationId: v.id("forLaterAlbumRecommendations"),
	...recommendationResultFields,
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
	userAlbumId?: Id<"userAlbums">;
	listenCount: number;
	lastListenedAt?: number;
	rating?: number;
	rymStatus: "matched" | "unmatched";
	rymUrl?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	rymNotOnSite?: boolean;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};

type LoadForLaterAlbumRowsResult = {
	page: ForLaterAlbumRow[];
	isDone: boolean;
	continueCursor: string;
};

function forLaterRowFilterInput(
	row: ForLaterAlbumRow,
	item: Doc<"forLaterAlbumItems">,
): ForLaterAlbumRowFilterInput {
	return {
		name: row.name,
		artistName: row.artistName,
		releaseYear: row.releaseYear,
		hasListened: row.hasListened,
		rymStatus: row.rymStatus,
		rymUrl: row.rymUrl,
		rymNotOnSite: row.rymNotOnSite,
		markedAsSingle: row.markedAsSingle,
		removedFromForLater: row.removedFromForLater,
		primaryGenres: row.primaryGenres,
		secondaryGenres: row.secondaryGenres,
		descriptors: row.descriptors,
		filterGenreKeysSorted: item.filterGenreKeysSorted,
	};
}

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
	ctx: ForLaterDbCtx,
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
	ctx: ForLaterDbCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<{
	hasListened: boolean;
	userAlbumId?: Id<"userAlbums">;
	listenCount: number;
	lastListenedAt?: number;
	rating?: number;
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
		userAlbumId: userAlbum._id,
		listenCount: userAlbum.listenCount,
		...(lastListenedAt !== undefined ? { lastListenedAt } : {}),
		...(userAlbum.rating !== undefined ? { rating: userAlbum.rating } : {}),
	};
}

async function resolveRymContextForAlbum(
	ctx: ForLaterDbCtx,
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

async function syncForLaterAlbumGenreFacets(
	ctx: MutationCtx,
	args: {
		itemId: Id<"forLaterAlbumItems">;
		userId: string;
		lastSeenAt: number;
		genreKeysSorted: string[];
	},
): Promise<void> {
	const existing = await ctx.db
		.query("forLaterAlbumGenreFacets")
		.withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
		.collect();
	for (const row of existing) {
		await ctx.db.delete(row._id);
	}
	for (const genreKey of args.genreKeysSorted) {
		await ctx.db.insert("forLaterAlbumGenreFacets", {
			userId: args.userId,
			itemId: args.itemId,
			genreKey,
			lastSeenAt: args.lastSeenAt,
		});
	}
}

async function syncForLaterAlbumDescriptorFacets(
	ctx: MutationCtx,
	args: {
		itemId: Id<"forLaterAlbumItems">;
		userId: string;
		lastSeenAt: number;
		descriptorKeysSorted: string[];
	},
): Promise<void> {
	const existing = await ctx.db
		.query("forLaterAlbumDescriptorFacets")
		.withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
		.collect();
	for (const row of existing) {
		await ctx.db.delete(row._id);
	}
	for (const descriptorKey of args.descriptorKeysSorted) {
		await ctx.db.insert("forLaterAlbumDescriptorFacets", {
			userId: args.userId,
			itemId: args.itemId,
			descriptorKey,
			lastSeenAt: args.lastSeenAt,
		});
	}
}

async function syncForLaterItemFilterProjection(
	ctx: MutationCtx,
	itemId: Id<"forLaterAlbumItems">,
	options?: { parentKeysByChild?: Map<string, string[]> },
): Promise<void> {
	const item = await ctx.db.get(itemId);
	if (!item) {
		return;
	}

	const album = await ctx.db.get(item.albumId);

	const { resolvedScrapeId, scrape } = await resolveRymContextForAlbum(ctx, {
		albumId: item.albumId,
		item,
	});

	const tags = resolvedScrapeId
		? await loadTagsForScrape(ctx, resolvedScrapeId)
		: { primaryGenres: [], secondaryGenres: [], descriptors: [] };

	const listenSummary = await loadListenSummary(ctx, {
		userId: item.userId,
		albumId: item.albumId,
	});

	const filterReleaseYear = parseReleaseYearFromIsoDate(album?.releaseDate);
	const filterHasListened = listenSummary.hasListened;
	const rymUrl = scrape?.rymUrl;
	const rymStatus = deriveRymStatus({
		rymScrapeId: resolvedScrapeId,
	});
	const filterRymMatched = rymStatus === "matched";
	const filterHasRymUrl = Boolean(rymUrl);

	const directGenreKeys = buildDirectFilterGenreKeys(
		tags.primaryGenres,
		tags.secondaryGenres,
	);
	const parentKeysByChild =
		options?.parentKeysByChild ?? (await loadRymGenreParentKeysByChild(ctx));
	const filterGenreKeysSorted = buildFilterGenreKeysSortedWithAncestors(
		directGenreKeys,
		parentKeysByChild,
	);

	const filterDescriptorKeysSorted = buildFilterDescriptorKeysSorted(
		tags.descriptors,
	);

	await ctx.db.patch(itemId, {
		...(filterReleaseYear !== undefined
			? { filterReleaseYear }
			: { filterReleaseYear: undefined }),
		filterHasListened,
		filterRymMatched,
		filterHasRymUrl,
		filterRymNotOnSite: item.rymNotOnSite === true ? true : undefined,
		filterMarkedAsSingle: item.markedAsSingle === true ? true : undefined,
		filterRemovedFromForLater:
			item.removedFromForLater === true ? true : undefined,
		filterGenreKeysSorted,
		filterDescriptorKeysSorted,
		filterSearchText: buildFilterSearchText({
			albumName: album?.name ?? "",
			artistName: album?.artistName ?? "",
		}),
		updatedAt: Date.now(),
	});

	await syncForLaterAlbumGenreFacets(ctx, {
		itemId,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		genreKeysSorted: filterGenreKeysSorted,
	});

	await syncForLaterAlbumDescriptorFacets(ctx, {
		itemId,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		descriptorKeysSorted: filterDescriptorKeysSorted,
	});
}

async function hydrateForLaterAlbumRow(
	ctx: QueryCtx,
	args: { userId: string; item: Doc<"forLaterAlbumItems"> },
): Promise<ForLaterAlbumRow | null> {
	const album = await ctx.db.get(args.item.albumId);
	if (!album) {
		return null;
	}

	const { resolvedScrapeId, scrape, linkMethod } =
		await resolveRymContextForAlbum(ctx, {
			albumId: args.item.albumId,
			item: args.item,
		});

	const tags = resolvedScrapeId
		? await loadTagsForScrape(ctx, resolvedScrapeId)
		: { primaryGenres: [], secondaryGenres: [], descriptors: [] };

	const listenSummary = await loadListenSummary(ctx, {
		userId: args.userId,
		albumId: args.item.albumId,
	});

	const parsedYear = album.releaseDate
		? Number.parseInt(album.releaseDate.slice(0, 4), 10)
		: Number.NaN;

	const rymStatus = deriveRymStatus({
		rymScrapeId: resolvedScrapeId,
	});

	const rymUrl = scrape?.rymUrl;
	const rymMatchMethodOut = args.item.rymMatchMethod ?? linkMethod;

	const row: ForLaterAlbumRow = {
		id: String(args.item._id),
		albumItemId: args.item._id,
		albumId: args.item.albumId,
		spotifyAlbumId: args.item.spotifyAlbumId,
		name: album.name,
		artistName: album.artistName,
		...(album.imageUrl ? { imageUrl: album.imageUrl } : {}),
		...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
		...(Number.isFinite(parsedYear) ? { releaseYear: parsedYear } : {}),
		...(args.item.playlistAddedAt
			? { playlistAddedAt: args.item.playlistAddedAt }
			: {}),
		firstSeenAt: args.item.firstSeenAt,
		createdAt: args.item.createdAt,
		lastSeenAt: args.item.lastSeenAt,
		...(args.item.removedAt ? { removedAt: args.item.removedAt } : {}),
		isActive: args.item.isActive,
		...listenSummary,
		rymStatus,
		...(rymUrl ? { rymUrl } : {}),
		...(rymMatchMethodOut ? { rymMatchMethod: rymMatchMethodOut } : {}),
		...(args.item.rymNotOnSite === true ? { rymNotOnSite: true } : {}),
		...(args.item.markedAsSingle === true ? { markedAsSingle: true } : {}),
		...(args.item.removedFromForLater === true
			? { removedFromForLater: true }
			: {}),
		...tags,
	};

	return row;
}

const FOR_LATER_RECOMMENDATION_SCAN_LIMIT = 2000;
const FOR_LATER_RECOMMENDATION_SUBGENRE_LIMIT = 15;

type ForLaterRecommendationHydratedCandidate = {
	row: ForLaterAlbumRow;
	candidate: ForLaterRecommendationCandidate;
};

type ForLaterRecommendationResult = {
	rows: ForLaterAlbumRow[];
	matchingCount: number;
	requestedCount: number;
	returnedCount: number;
	wasLimitedByPool: boolean;
};

function forLaterRecommendationItemHidden(
	item: Doc<"forLaterAlbumItems">,
): boolean {
	return (
		item.filterMarkedAsSingle === true ||
		item.filterRemovedFromForLater === true ||
		item.markedAsSingle === true ||
		item.removedFromForLater === true
	);
}

function readableRecommendationLabelFromKey(key: string): string {
	return key
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function recommendationTagInputFromKey(key: string): RecommendationTagInput {
	return {
		key,
		label: readableRecommendationLabelFromKey(key),
	};
}

function recommendationCandidateFromItem(
	item: Doc<"forLaterAlbumItems">,
): ForLaterRecommendationCandidate {
	return {
		id: String(item._id),
		playlistAddedAt: item.playlistAddedAt,
		firstSeenAt: item.firstSeenAt,
		createdAt: item.createdAt,
		releaseYear: item.filterReleaseYear,
		filterGenreKeysSorted: item.filterGenreKeysSorted ?? [],
		filterDescriptorKeysSorted: item.filterDescriptorKeysSorted ?? [],
		markedAsSingle: item.markedAsSingle,
		removedFromForLater: item.removedFromForLater,
	};
}

function recommendationCandidateFromRow(
	row: ForLaterAlbumRow,
	item: Doc<"forLaterAlbumItems">,
): ForLaterRecommendationCandidate {
	return {
		id: row.id,
		playlistAddedAt: row.playlistAddedAt,
		firstSeenAt: row.firstSeenAt,
		createdAt: row.createdAt,
		releaseYear: row.releaseYear,
		filterGenreKeysSorted: item.filterGenreKeysSorted ?? [],
		filterDescriptorKeysSorted: item.filterDescriptorKeysSorted ?? [],
		rating: row.rating,
		markedAsSingle: row.markedAsSingle,
		removedFromForLater: row.removedFromForLater,
	};
}

async function collectVisibleActiveForLaterRecommendationItems(
	ctx: ForLaterDbCtx,
	args: { userId: string },
): Promise<Doc<"forLaterAlbumItems">[]> {
	const items = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_isActive_lastSeenAt", (q) =>
			q.eq("userId", args.userId).eq("isActive", true),
		)
		.order("desc")
		.take(FOR_LATER_RECOMMENDATION_SCAN_LIMIT);

	return items.filter((item) => !forLaterRecommendationItemHidden(item));
}

async function loadRecommendationGenreLabels(
	ctx: QueryCtx,
	keys: string[],
): Promise<Map<string, string>> {
	const labels = new Map<string, string>();
	for (const key of keys) {
		const genre = await ctx.db
			.query("rateYourMusicGenres")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();
		if (genre) {
			labels.set(key, genre.label);
		}
	}
	return labels;
}

function applyRecommendationOptionLabels(
	options: RecommendationTagOption[],
	labels: Map<string, string>,
): RecommendationTagOption[] {
	return options.map((option) => ({
		...option,
		label: labels.get(option.key) ?? option.label,
	}));
}

async function loadTopLevelGenreKeySet(
	ctx: QueryCtx,
): Promise<Set<string>> {
	const topLevelGenres = await ctx.db
		.query("rateYourMusicGenres")
		.withIndex("by_isTopLevel", (q) => q.eq("isTopLevel", true))
		.collect();

	return new Set(topLevelGenres.map((genre) => genre.key));
}

function recommendationFilterGenreKeysForItems(
	items: Doc<"forLaterAlbumItems">[],
): string[][] {
	return items.map((item) => item.filterGenreKeysSorted ?? []);
}

async function collectForLaterRecommendationTagOptions(
	ctx: QueryCtx,
	args: { userId: string; parentGenreKey?: string },
): Promise<{
	genres: RecommendationTagOption[];
}> {
	const items = await collectVisibleActiveForLaterRecommendationItems(ctx, {
		userId: args.userId,
	});
	const albumFilterGenreKeys = recommendationFilterGenreKeysForItems(items);
	const [parentKeysByChild, topLevelGenreKeys] = await Promise.all([
		loadRymGenreParentKeysByChild(ctx),
		loadTopLevelGenreKeySet(ctx),
	]);

	if (args.parentGenreKey) {
		const relationships = await ctx.db
			.query("rateYourMusicGenreRelationships")
			.collect();
		const childKeysByParent = buildChildKeysByParentKey(relationships);
		const descendantGenreKeys = collectDescendantGenreKeys(
			args.parentGenreKey,
			childKeysByParent,
		);
		const genreOptions = buildSubgenreCountsForTopLevel({
			albumAllGenreKeys: albumFilterGenreKeys,
			topLevelGenreKey: args.parentGenreKey,
			descendantGenreKeys,
			limit: FOR_LATER_RECOMMENDATION_SUBGENRE_LIMIT,
		});
		const genreLabels = await loadRecommendationGenreLabels(
			ctx,
			genreOptions.map((option) => option.key),
		);

		return {
			genres: applyRecommendationOptionLabels(genreOptions, genreLabels),
		};
	}

	const topLevelCounts = buildTopLevelGenreCounts({
		albumPrimaryGenreKeys: albumFilterGenreKeys,
		topLevelGenreKeys,
		parentKeysByChild,
	});
	const genreOptions = sortRecommendationTagOptionsByCount(
		[...topLevelCounts.entries()].map(([key, count]) => ({
			key,
			label: readableRecommendationLabelFromKey(key),
			count,
		})),
	);
	const genreLabels = await loadRecommendationGenreLabels(
		ctx,
		genreOptions.map((option) => option.key),
	);

	return {
		genres: applyRecommendationOptionLabels(genreOptions, genreLabels),
	};
}

async function collectForLaterRecommendationCandidates(
	ctx: ForLaterDbCtx,
	args: { userId: string; answers: ForLaterRecommendationAnswers; now: number },
): Promise<ForLaterRecommendationHydratedCandidate[]> {
	const items = await collectVisibleActiveForLaterRecommendationItems(ctx, {
		userId: args.userId,
	});
	const cheapFilterAnswers: ForLaterRecommendationAnswers = {
		...args.answers,
		ratingTier: "any",
	};

	const candidates: ForLaterRecommendationHydratedCandidate[] = [];
	for (const item of items) {
		const itemCandidate = recommendationCandidateFromItem(item);
		if (
			!candidateMatchesRecommendationAnswers(
				itemCandidate,
				cheapFilterAnswers,
				args.now,
			)
		) {
			continue;
		}

		const row = await hydrateForLaterAlbumRow(ctx, {
			userId: args.userId,
			item,
		});
		if (!row) {
			continue;
		}

		candidates.push({
			row,
			candidate: recommendationCandidateFromRow(row, item),
		});
	}

	return candidates;
}

function normalizeRecommendationAnswers(answers: {
	addedTimeframe: AddedTimeframeAnswer;
	genreKey: string;
	releaseTime: ReleaseTimeAnswer;
	descriptorKey: string;
	ratingTier: RatingTierAnswer;
	count: number;
}): ForLaterRecommendationAnswers {
	return {
		addedTimeframe: answers.addedTimeframe,
		genreKey: answers.genreKey.trim() || "any",
		releaseTime: answers.releaseTime,
		descriptorKey: answers.descriptorKey.trim() || "any",
		ratingTier: answers.ratingTier,
		count: normalizeRecommendationCount(answers.count),
	};
}

async function buildForLaterRecommendationResult(
	ctx: ForLaterDbCtx,
	args: {
		userId: string;
		answers: ForLaterRecommendationAnswers;
		now: number;
		seed: string;
	},
): Promise<ForLaterRecommendationResult> {
	const candidates = await collectForLaterRecommendationCandidates(ctx, {
		userId: args.userId,
		answers: args.answers,
		now: args.now,
	});
	const matching = candidates.filter(({ candidate }) =>
		candidateMatchesRecommendationAnswers(candidate, args.answers, args.now),
	);
	const rowsByCandidateId = new Map(
		matching.map(({ candidate, row }) => [candidate.id, row]),
	);
	const selectedCandidates = chooseRecommendationRows(
		matching.map(({ candidate }) => candidate),
		args.answers.count,
		args.seed,
	);
	const rows = selectedCandidates.flatMap((candidate) => {
		const row = rowsByCandidateId.get(candidate.id);
		return row ? [row] : [];
	});

	return {
		rows,
		matchingCount: matching.length,
		requestedCount: args.answers.count,
		returnedCount: rows.length,
		wasLimitedByPool: rows.length < args.answers.count,
	};
}

function appendForLaterListExclusionFilters(
	// biome-ignore lint/suspicious/noExplicitAny: Convex indexed `.filter` chains lack one exported builder type across indexes.
	q: any,
	// biome-ignore lint/suspicious/noExplicitAny: same
): any {
	return q
		.filter(
			(fb: {
				neq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.neq(fb.field("filterMarkedAsSingle"), true),
		)
		.filter(
			(fb: {
				neq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.neq(fb.field("filterRemovedFromForLater"), true),
		);
}

function appendForLaterProjectionFilters(
	filters: ForLaterUiFilters,
	options: {
		skipYear?: boolean;
		skipListened?: boolean;
		skipRym?: boolean;
	},
	// biome-ignore lint/suspicious/noExplicitAny: Convex indexed `.filter` chains lack one exported builder type across indexes.
	q: any,
	// biome-ignore lint/suspicious/noExplicitAny: same
): any {
	let out = appendForLaterListExclusionFilters(q);
	if (!options.skipYear && filters.yearMin !== undefined) {
		out = out.filter(
			(fb: {
				gte: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.gte(fb.field("filterReleaseYear"), filters.yearMin),
		);
	}
	if (!options.skipYear && filters.yearMax !== undefined) {
		out = out.filter(
			(fb: {
				lte: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.lte(fb.field("filterReleaseYear"), filters.yearMax),
		);
	}
	if (!options.skipListened && filters.listened === "listened") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("filterHasListened"), true),
		);
	} else if (!options.skipListened && filters.listened === "not_listened") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("filterHasListened"), false),
		);
	}
	if (!options.skipRym && filters.rymStatus === "not_on_rym") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("filterRymNotOnSite"), true),
		);
	} else if (!options.skipRym && filters.rymStatus !== "all") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				neq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.neq(fb.field("filterRymNotOnSite"), true),
		);
		if (filters.rymStatus === "has_scrape") {
			out = out.filter(
				(fb: {
					eq: (a: unknown, b: unknown) => unknown;
					field: (name: string) => unknown;
				}) => fb.eq(fb.field("filterRymMatched"), true),
			);
		} else if (filters.rymStatus === "no_scrape") {
			out = out.filter(
				(fb: {
					eq: (a: unknown, b: unknown) => unknown;
					field: (name: string) => unknown;
				}) => fb.eq(fb.field("filterRymMatched"), false),
			);
		}
	}
	return out;
}

async function paginateForLaterAlbumItemsIndexed(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: ForLaterUiFilters;
		requested: number;
		cursor: string | null;
	},
): Promise<{
	page: Doc<"forLaterAlbumItems">[];
	isDone: boolean;
	continueCursor: string;
}> {
	const { userId, filters, requested, cursor } = args;
	const choice = chooseIndexedForLaterListScan(filters);

	// biome-ignore lint/suspicious/noImplicitAnyLet: reassigned on every branch before paginate
	let base;

	if (choice.kind === "year") {
		base = ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_filterReleaseYear_lastSeenAt", (iq) =>
				iq.eq("userId", userId).eq("filterReleaseYear", choice.year),
			);
		base = appendForLaterProjectionFilters(filters, { skipYear: true }, base);
	} else if (choice.kind === "listened") {
		base = ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_filterHasListened_lastSeenAt", (iq) =>
				iq.eq("userId", userId).eq("filterHasListened", choice.value),
			);
		base = appendForLaterProjectionFilters(
			filters,
			{ skipListened: true },
			base,
		);
	} else if (choice.kind === "rymMatched") {
		base = ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_filterRymMatched_lastSeenAt", (iq) =>
				iq.eq("userId", userId).eq("filterRymMatched", choice.value),
			);
		base = appendForLaterProjectionFilters(filters, { skipRym: true }, base);
	} else {
		base = ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_lastSeenAt", (iq) => iq.eq("userId", userId));
		base = appendForLaterProjectionFilters(filters, {}, base);
	}

	const result = await base.order("desc").paginate({
		numItems: requested,
		cursor,
	});

	return {
		page: result.page,
		isDone: result.isDone,
		continueCursor: result.continueCursor,
	};
}

async function hydrateMatchingRowsFromFacetItemRefs(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: ForLaterUiFilters;
		facetRows: Array<{ itemId: Id<"forLaterAlbumItems"> }>;
	},
): Promise<ForLaterAlbumRow[]> {
	const matches: ForLaterAlbumRow[] = [];
	for (const facet of args.facetRows) {
		const item = await ctx.db.get(facet.itemId);
		if (!item || item.userId !== args.userId) {
			continue;
		}
		if (!projectionMatchesFilters(item, args.filters)) {
			continue;
		}
		const row = await hydrateForLaterAlbumRow(ctx, {
			userId: args.userId,
			item,
		});
		if (!row) {
			continue;
		}
		if (rowMatchesFilters(forLaterRowFilterInput(row, item), args.filters)) {
			matches.push(row);
		}
	}
	return matches;
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
	const requested = args.paginationOpts.numItems;

	/** Convex FTS narrows candidates; genre/descriptor ANY/ALL + leftovers enforced below. */
	if (filters.search?.trim()) {
		const scanSize = forLaterPostFilterScanSize(requested);
		const term = filters.search.trim();

		const batch = await ctx.db
			.query("forLaterAlbumItems")
			.withSearchIndex("search_forLaterAlbumItems", (q) => {
				let qb = q.search("filterSearchText", term).eq("userId", args.userId);
				const singleYear = forLaterSingleIndexedReleaseYear(filters);
				if (singleYear !== undefined) {
					qb = qb.eq("filterReleaseYear", singleYear);
				}
				if (filters.listened === "listened") {
					qb = qb.eq("filterHasListened", true);
				} else if (filters.listened === "not_listened") {
					qb = qb.eq("filterHasListened", false);
				}
				const rym = filters.rymStatus;
				if (rym === "has_scrape") {
					qb = qb.eq("filterRymMatched", true);
				} else if (rym === "no_scrape") {
					qb = qb.eq("filterRymMatched", false);
				}
				return qb;
			})
			.paginate({
				numItems: scanSize,
				cursor: args.paginationOpts.cursor,
			});

		const page: ForLaterAlbumRow[] = [];
		for (const item of batch.page) {
			if (
				!projectionMatchesFilters(item, filters, {
					skipSearchPredicate: true,
				})
			) {
				continue;
			}
			const row = await hydrateForLaterAlbumRow(ctx, {
				userId: args.userId,
				item,
			});
			if (!row) {
				continue;
			}
			if (rowMatchesFilters(forLaterRowFilterInput(row, item), filters)) {
				page.push(row);
			}
		}

		return {
			page: sortForLaterRows(page),
			isDone: batch.isDone,
			continueCursor: batch.continueCursor,
		};
	}

	if (forLaterFiltersAllowIndexedScan(filters)) {
		const indexedPage = await paginateForLaterAlbumItemsIndexed(ctx, {
			userId: args.userId,
			filters,
			requested,
			cursor: args.paginationOpts.cursor,
		});

		const page: ForLaterAlbumRow[] = [];
		for (const item of indexedPage.page) {
			if (!projectionMatchesFilters(item, filters)) {
				continue;
			}
			const row = await hydrateForLaterAlbumRow(ctx, {
				userId: args.userId,
				item,
			});
			if (!row) {
				continue;
			}
			if (rowMatchesFilters(forLaterRowFilterInput(row, item), filters)) {
				page.push(row);
			}
		}

		return {
			page: sortForLaterRows(page),
			isDone: indexedPage.isDone,
			continueCursor: indexedPage.continueCursor,
		};
	}

	if (forLaterFiltersAllowGenreFacetPagination(filters)) {
		const [primaryGenreKey] = filters.genreKeys;
		if (primaryGenreKey === undefined) {
			throw new Error(
				"forLaterFiltersAllowGenreFacetPagination requires genre keys",
			);
		}
		const scanSize = forLaterPostFilterScanSize(requested);

		const facetBatch = await ctx.db
			.query("forLaterAlbumGenreFacets")
			.withIndex("by_userId_genreKey_lastSeenAt", (q) =>
				q.eq("userId", args.userId).eq("genreKey", primaryGenreKey),
			)
			.order("desc")
			.paginate({
				numItems: scanSize,
				cursor: args.paginationOpts.cursor,
			});

		const matches = await hydrateMatchingRowsFromFacetItemRefs(ctx, {
			userId: args.userId,
			filters,
			facetRows: facetBatch.page,
		});

		return {
			page: sortForLaterRows(matches),
			isDone: facetBatch.isDone,
			continueCursor: facetBatch.continueCursor,
		};
	}

	if (forLaterFiltersAllowDescriptorFacetPagination(filters)) {
		const [primaryDescriptorKey] = filters.descriptorKeys;
		if (primaryDescriptorKey === undefined) {
			throw new Error(
				"forLaterFiltersAllowDescriptorFacetPagination requires descriptor keys",
			);
		}
		const scanSize = forLaterPostFilterScanSize(requested);

		const facetBatch = await ctx.db
			.query("forLaterAlbumDescriptorFacets")
			.withIndex("by_userId_descriptorKey_lastSeenAt", (q) =>
				q.eq("userId", args.userId).eq("descriptorKey", primaryDescriptorKey),
			)
			.order("desc")
			.paginate({
				numItems: scanSize,
				cursor: args.paginationOpts.cursor,
			});

		const matches = await hydrateMatchingRowsFromFacetItemRefs(ctx, {
			userId: args.userId,
			filters,
			facetRows: facetBatch.page,
		});

		return {
			page: sortForLaterRows(matches),
			isDone: facetBatch.isDone,
			continueCursor: facetBatch.continueCursor,
		};
	}

	const scanSize = forLaterPostFilterScanSize(requested);
	const matches: ForLaterAlbumRow[] = [];

	const batch = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
		.order("desc")
		.paginate({
			numItems: scanSize,
			cursor: args.paginationOpts.cursor,
		});

	// Scan the full raw page so we don't pair `continueCursor` (end of batch) with an early break,
	// which previously hid matches and left `isDone` false while the user already saw every match.
	for (const item of batch.page) {
		if (!projectionMatchesFilters(item, filters)) {
			continue;
		}
		const row = await hydrateForLaterAlbumRow(ctx, {
			userId: args.userId,
			item,
		});
		if (!row) {
			continue;
		}
		if (rowMatchesFilters(forLaterRowFilterInput(row, item), filters)) {
			matches.push(row);
		}
	}

	return {
		page: sortForLaterRows(matches),
		isDone: batch.isDone,
		continueCursor: batch.continueCursor,
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

		await syncForLaterItemFilterProjection(ctx, itemId);

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

		const visibleActiveRows = activeRows.filter(
			(row) => row.markedAsSingle !== true && row.removedFromForLater !== true,
		);

		return {
			activeCount: visibleActiveRows.length,
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

export const listForLaterRecommendationOptions = query({
	args: {
		userId: v.string(),
		parentGenreKey: v.optional(v.string()),
	},
	returns: v.object({
		genres: v.array(recommendationOptionValidator),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		genres: Array<{ key: string; label: string; count: number }>;
	}> => {
		requireAuth(ctx);
		return await collectForLaterRecommendationTagOptions(ctx, {
			userId: args.userId,
			parentGenreKey: args.parentGenreKey?.trim() || undefined,
		});
	},
});

export const getForLaterRecommendations = query({
	args: {
		userId: v.string(),
		answers: recommendationAnswersValidator,
		now: v.number(),
		seed: v.string(),
	},
	returns: recommendationResultValidator,
	handler: async (ctx, args): Promise<ForLaterRecommendationResult> => {
		requireAuth(ctx);
		const answers = normalizeRecommendationAnswers({
			addedTimeframe: args.answers.addedTimeframe as AddedTimeframeAnswer,
			genreKey: args.answers.genreKey,
			releaseTime: args.answers.releaseTime as ReleaseTimeAnswer,
			descriptorKey: args.answers.descriptorKey,
			ratingTier: args.answers.ratingTier as RatingTierAnswer,
			count: args.answers.count,
		});

		return await buildForLaterRecommendationResult(ctx, {
			userId: args.userId,
			answers,
			now: args.now,
			seed: args.seed,
		});
	},
});

export const createForLaterRecommendation = mutation({
	args: {
		userId: v.string(),
		answers: recommendationAnswersValidator,
		now: v.number(),
		seed: v.string(),
	},
	returns: savedRecommendationResultValidator,
	handler: async (
		ctx,
		args,
	): Promise<
		ForLaterRecommendationResult & {
			recommendationId: Id<"forLaterAlbumRecommendations">;
		}
	> => {
		requireAuth(ctx);
		const answers = normalizeRecommendationAnswers({
			addedTimeframe: args.answers.addedTimeframe as AddedTimeframeAnswer,
			genreKey: args.answers.genreKey,
			releaseTime: args.answers.releaseTime as ReleaseTimeAnswer,
			descriptorKey: args.answers.descriptorKey,
			ratingTier: args.answers.ratingTier as RatingTierAnswer,
			count: args.answers.count,
		});
		const result = await buildForLaterRecommendationResult(ctx, {
			userId: args.userId,
			answers,
			now: args.now,
			seed: args.seed,
		});
		const albumRefs = buildSavedRecommendationAlbumRefs(result.rows);
		const recommendationId = await ctx.db.insert(
			"forLaterAlbumRecommendations",
			{
				userId: args.userId,
				createdAt: Date.now(),
				seed: args.seed,
				now: args.now,
				answers,
				requestedCount: result.requestedCount,
				matchingCount: result.matchingCount,
				returnedCount: result.returnedCount,
				albumItemIds: albumRefs.albumItemIds,
				albumIds: albumRefs.albumIds,
				spotifyAlbumIds: albumRefs.spotifyAlbumIds,
			},
		);

		return {
			recommendationId,
			...result,
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
				numItems: forLaterPostFilterScanSize(args.limit),
				cursor: null,
			},
		});

		return buildOpenableGoogleRymSearchLinks(
			rows.page.map((row) => ({
				id: row.id,
				artistName: row.artistName,
				name: row.name,
				rymUrl: row.rymUrl,
			})),
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
			await syncForLaterItemFilterProjection(ctx, id);
			queued++;
		}
		return { queued };
	},
});

export const setForLaterAlbumRymNotOnSite = mutation({
	args: {
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		notOnSite: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);
		const item = await ctx.db.get(args.itemId);
		if (!item || item.userId !== args.userId) {
			throw new Error("For Later album not found");
		}
		const now = Date.now();
		await ctx.db.patch(args.itemId, {
			rymNotOnSite: args.notOnSite ? true : undefined,
			updatedAt: now,
		});
		await syncForLaterItemFilterProjection(ctx, args.itemId);
		return null;
	},
});

export const setForLaterAlbumMarkedAsSingle = mutation({
	args: {
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		markedAsSingle: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);
		const item = await ctx.db.get(args.itemId);
		if (!item || item.userId !== args.userId) {
			throw new Error("For Later album not found");
		}
		const now = Date.now();
		await ctx.db.patch(args.itemId, {
			markedAsSingle: args.markedAsSingle ? true : undefined,
			updatedAt: now,
		});
		await syncForLaterItemFilterProjection(ctx, args.itemId);
		return null;
	},
});

export const setForLaterAlbumRemovedFromForLater = mutation({
	args: {
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		removedFromForLater: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);
		const item = await ctx.db.get(args.itemId);
		if (!item || item.userId !== args.userId) {
			throw new Error("For Later album not found");
		}
		const now = Date.now();
		await ctx.db.patch(args.itemId, {
			removedFromForLater: args.removedFromForLater ? true : undefined,
			updatedAt: now,
		});
		await syncForLaterItemFilterProjection(ctx, args.itemId);
		return null;
	},
});

const unmappedRymScrapeRowValidator = v.object({
	scrapeId: v.id("rateYourMusicScrapes"),
	rymUrl: v.string(),
	albumTitle: v.string(),
	artists: v.array(
		v.object({
			name: v.string(),
			href: v.optional(v.string()),
		}),
	),
	releaseKind: v.union(
		v.literal("album"),
		v.literal("ep"),
		v.literal("mixtape"),
		v.literal("comp"),
	),
	createdAt: v.number(),
});

export const searchUnmappedRymScrapes = query({
	args: {
		search: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.array(unmappedRymScrapeRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
		const searchTerm = args.search?.trim() ?? "";

		const mappedIds = await collectMappedRymScrapeIds(ctx);

		const scrapes = await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(500);

		scrapes.sort((a, b) => b.createdAt - a.createdAt);

		const results: Array<{
			scrapeId: Id<"rateYourMusicScrapes">;
			rymUrl: string;
			albumTitle: string;
			artists: Array<{ name: string; href?: string }>;
			releaseKind: "album" | "ep" | "mixtape" | "comp";
			createdAt: number;
		}> = [];

		for (const scrape of scrapes) {
			if (mappedIds.has(scrape._id)) {
				continue;
			}
			if (!scrapeMatchesSearch(scrape, searchTerm)) {
				continue;
			}
			results.push({
				scrapeId: scrape._id,
				rymUrl: scrape.rymUrl,
				albumTitle: scrape.albumTitle,
				artists: scrape.artists.map((artist) => ({
					name: artist.name,
					...(artist.href ? { href: artist.href } : {}),
				})),
				releaseKind: scrape.releaseKind,
				createdAt: scrape.createdAt,
			});
			if (results.length >= limit) {
				break;
			}
		}

		return results;
	},
});

export const associateForLaterAlbumWithRymScrape = mutation({
	args: {
		userId: v.string(),
		itemId: v.id("forLaterAlbumItems"),
		scrapeId: v.id("rateYourMusicScrapes"),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item || item.userId !== args.userId) {
			throw new Error("For Later album not found");
		}

		const scrape = await ctx.db.get(args.scrapeId);
		if (!scrape) {
			throw new Error("RYM scrape not found");
		}

		const mappedElsewhere = await isRymScrapeMappedElsewhere(ctx, {
			scrapeId: args.scrapeId,
			allowedItemId: args.itemId,
			allowedAlbumId: item.albumId,
		});
		if (mappedElsewhere) {
			throw new Error("This RYM scrape is already linked to another album");
		}

		const now = Date.now();

		await linkRymScrapeToSpotifyAlbum(ctx, {
			scrapeId: args.scrapeId,
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			method: "manual",
			now,
		});

		await ctx.db.patch(args.itemId, {
			rymScrapeId: args.scrapeId,
			rymMatchMethod: "manual",
			rymMatchedAt: now,
			rymDiscoveryStatus: "found",
			rymNotOnSite: undefined,
			updatedAt: now,
		});

		await syncForLaterItemFilterProjection(ctx, args.itemId);

		return null;
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
		await syncForLaterItemFilterProjection(ctx, args.itemId);
	},
});

export const refreshFilterProjectionForItem = internalMutation({
	args: { itemId: v.id("forLaterAlbumItems") },
	handler: async (ctx, args): Promise<void> => {
		await syncForLaterItemFilterProjection(ctx, args.itemId);
	},
});

export const refreshFilterProjectionsForScrape = internalMutation({
	args: { scrapeId: v.id("rateYourMusicScrapes") },
	handler: async (ctx, args): Promise<void> => {
		const seen = new Set<Id<"forLaterAlbumItems">>();

		const byRymScrapeId = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_rymScrapeId", (q) => q.eq("rymScrapeId", args.scrapeId))
			.collect();

		for (const item of byRymScrapeId) {
			await syncForLaterItemFilterProjection(ctx, item._id);
			seen.add(item._id);
		}

		const albumLinks = await ctx.db
			.query("rateYourMusicSpotifyAlbumLinks")
			.withIndex("by_scrapeId", (q) => q.eq("scrapeId", args.scrapeId))
			.collect();

		const albumIds = [...new Set(albumLinks.map((link) => link.albumId))];

		for (const albumId of albumIds) {
			const linkedItems = await ctx.db
				.query("forLaterAlbumItems")
				.filter((q) => q.eq(q.field("albumId"), albumId))
				.collect();

			for (const item of linkedItems) {
				if (seen.has(item._id)) {
					continue;
				}
				await syncForLaterItemFilterProjection(ctx, item._id);
				seen.add(item._id);
			}
		}
	},
});

export const refreshFilterProjectionsForUserAlbum = internalMutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
	},
	handler: async (ctx, args): Promise<void> => {
		const items = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", args.albumId),
			)
			.collect();

		for (const item of items) {
			await syncForLaterItemFilterProjection(ctx, item._id);
		}
	},
});

async function runSingleBackfillFilterProjectionBatch(
	ctx: MutationCtx,
	args: { cursor: string | null; limit: number },
): Promise<{
	continueCursor: string;
	isDone: boolean;
	processed: number;
}> {
	const limit = Math.min(Math.max(args.limit, 1), 100);

	const result = await ctx.db
		.query("forLaterAlbumItems")
		.order("asc")
		.paginate({
			numItems: limit,
			cursor: args.cursor,
		});

	const parentKeysByChild = await loadRymGenreParentKeysByChild(ctx);
	for (const item of result.page) {
		await syncForLaterItemFilterProjection(ctx, item._id, {
			parentKeysByChild,
		});
	}

	return {
		continueCursor: result.continueCursor,
		isDone: result.isDone,
		processed: result.page.length,
	};
}

export const backfillFilterProjectionBatch = internalMutation({
	args: {
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.number(),
	},
	returns: v.object({
		continueCursor: v.string(),
		isDone: v.boolean(),
		processed: v.number(),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		continueCursor: string;
		isDone: boolean;
		processed: number;
	}> => {
		return await runSingleBackfillFilterProjectionBatch(ctx, {
			cursor: args.cursor ?? null,
			limit: args.limit,
		});
	},
});

/** Authenticated single batch; UI loops until `isDone`. */
export const runBackfillFilterProjectionBatch = mutation({
	args: {
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		continueCursor: v.string(),
		isDone: v.boolean(),
		processed: v.number(),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		continueCursor: string;
		isDone: boolean;
		processed: number;
	}> => {
		requireAuth(ctx);
		const limit = args.limit ?? 100;
		return await runSingleBackfillFilterProjectionBatch(ctx, {
			cursor: args.cursor ?? null,
			limit,
		});
	},
});

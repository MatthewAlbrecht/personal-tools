import { stream } from "convex-helpers/server/stream";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import {
	refreshAlbumLibraryProjectionsForAlbum,
	upsertAlbumLibraryProjection,
} from "./_utils/albumLibraryProjection";
import {
	type RymMatchResult,
	buildArtistKeys,
	linkRymScrapeToSpotifyAlbum,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
} from "./_utils/albumMatching";
import {
	type ForLaterFiltersNormalizeInput,
	type ForLaterUiFilters,
	deriveRymStatus,
	normalizeForLaterFilters,
	sortForLaterRows,
} from "./_utils/forLaterAlbumsUi";
import { durationMsToBucketKey } from "./_utils/forLaterDurationBuckets";
import {
	buildDirectFilterGenreKeys,
	buildFilterDescriptorKeysSorted,
	buildFilterGenreKeysSortedWithAncestors,
	buildFilterSearchText,
	loadRymGenreParentKeysByChild,
	parseReleaseYearFromIsoDate,
} from "./_utils/forLaterFilterProjection";
import { projectionMatchesFilters } from "./_utils/forLaterProjectionPredicate";
import {
	ADDED_DAYS_MIN,
	type ForLaterRecommendationAnswers,
	type ForLaterRecommendationCandidate,
	type GenreMatchAnswer,
	type ListenedAnswer,
	RATING_MAX,
	RATING_MIN,
	RECOMMENDATION_POOL_SIZE,
	type RecommendationTagOption,
	buildDurationBucketRecommendationOptions,
	buildSavedRecommendationAlbumRefs,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	getAddedDaysMax,
	normalizeRecommendationCount,
	sortRecommendationTagOptionsByCount,
} from "./_utils/forLaterRecommendations";
import { buildOpenableGoogleRymSearchLinks } from "./_utils/google_rym_lucky_search";
import { duplicateGroupStartsOnPage } from "./_utils/libraryForLaterMigration";
import { libraryRowMatchesForLaterFilters } from "./_utils/libraryForLaterPredicate";
import {
	type LibraryForLaterEvent,
	applyLibraryForLaterEvent,
	deriveIsActiveForLater,
	legacyRowsToLibraryForLater,
} from "./_utils/libraryForLaterState";
import {
	collectMappedRymScrapeIds,
	isRymScrapeMappedElsewhere,
	scrapeMatchesSearch,
} from "./_utils/unmappedRymScrapes";
import { requireAuth } from "./auth";
import schema from "./schema";

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
	durationMinMinutes: v.optional(v.number()),
	durationMaxMinutes: v.optional(v.number()),
	durationBucketKey: v.optional(v.string()),
});

const recommendationAnswersValidator = v.object({
	addedDaysMin: v.number(),
	addedDaysMax: v.number(),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMs: v.number(),
	durationMaxMs: v.number(),
	ratingMin: v.number(),
	ratingMax: v.number(),
	listened: v.union(v.literal("any"), v.literal("heard"), v.literal("not_yet")),
	genreKeys: v.array(v.string()),
	genreMatch: v.union(v.literal("any"), v.literal("all")),
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
	libraryItemId: v.id("albumLibraryItems"),
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
	libraryItemId: Id<"albumLibraryItems">;
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
	pageStatus?: "SplitRecommended" | "SplitRequired";
	splitCursor?: string;
};

const FOR_LATER_FILTER_MAXIMUM_ROWS_READ = 2_000;

async function patchLibraryForLaterState(
	ctx: MutationCtx,
	args: {
		userId: string;
		albumId: Id<"spotifyAlbums">;
		event: LibraryForLaterEvent;
	},
): Promise<void> {
	await upsertAlbumLibraryProjection(ctx, {
		userId: args.userId,
		albumId: args.albumId,
	});
	const row = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();
	if (!row) {
		throw new Error("Album library row could not be created");
	}
	const patch = applyLibraryForLaterEvent(row.forLater, args.event);
	await ctx.db.patch(row._id, {
		...patch,
		appearsInForLater: patch.isActiveForLater,
		forLaterLastSeenAt: patch.forLater.lastSeenAt,
	});
}

async function requireLegacyForLaterItemByAlbum(
	ctx: QueryCtx | MutationCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<Doc<"forLaterAlbumItems">> {
	const item = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();
	if (!item) {
		throw new Error("For Later album not found");
	}
	return item;
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

async function syncForLaterAlbumDurationFacets(
	ctx: MutationCtx,
	args: {
		itemId: Id<"forLaterAlbumItems">;
		userId: string;
		lastSeenAt: number;
		durationBucketKey?: string;
	},
): Promise<void> {
	const existing = await ctx.db
		.query("forLaterAlbumDurationFacets")
		.withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
		.collect();
	for (const row of existing) {
		await ctx.db.delete(row._id);
	}
	if (args.durationBucketKey === undefined) {
		return;
	}
	await ctx.db.insert("forLaterAlbumDurationFacets", {
		userId: args.userId,
		itemId: args.itemId,
		durationBucketKey: args.durationBucketKey,
		lastSeenAt: args.lastSeenAt,
	});
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
	const filterDurationMs =
		album?.totalDurationMs !== undefined ? album.totalDurationMs : undefined;
	const filterDurationBucketKey = durationMsToBucketKey(filterDurationMs);

	await ctx.db.patch(itemId, {
		...(filterReleaseYear !== undefined
			? { filterReleaseYear }
			: { filterReleaseYear: undefined }),
		...(filterDurationMs !== undefined
			? { filterDurationMs }
			: { filterDurationMs: undefined }),
		...(filterDurationBucketKey !== undefined
			? { filterDurationBucketKey }
			: { filterDurationBucketKey: undefined }),
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

	await syncForLaterAlbumDurationFacets(ctx, {
		itemId,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		durationBucketKey: filterDurationBucketKey,
	});
}

async function syncForLaterRymLinkFilterProjection(
	ctx: MutationCtx,
	args: {
		item: Doc<"forLaterAlbumItems">;
		album: Doc<"spotifyAlbums"> | null;
		scrape: Doc<"rateYourMusicScrapes">;
		tags: {
			primaryGenres: Array<{ key: string; label: string }>;
			secondaryGenres: Array<{ key: string; label: string }>;
			descriptors: Array<{ key: string; label: string }>;
		};
		parentKeysByChild: Map<string, string[]>;
		now: number;
	},
): Promise<void> {
	const { item, album, scrape, tags, parentKeysByChild, now } = args;

	const listenSummary = await loadListenSummary(ctx, {
		userId: item.userId,
		albumId: item.albumId,
	});

	const filterReleaseYear = parseReleaseYearFromIsoDate(album?.releaseDate);
	const filterHasListened = listenSummary.hasListened;
	const rymUrl = scrape.rymUrl;
	const rymStatus = deriveRymStatus({
		rymScrapeId: scrape._id,
	});
	const filterRymMatched = rymStatus === "matched";
	const filterHasRymUrl = Boolean(rymUrl);

	const directGenreKeys = buildDirectFilterGenreKeys(
		tags.primaryGenres,
		tags.secondaryGenres,
	);
	const filterGenreKeysSorted = buildFilterGenreKeysSortedWithAncestors(
		directGenreKeys,
		parentKeysByChild,
	);

	const filterDescriptorKeysSorted = buildFilterDescriptorKeysSorted(
		tags.descriptors,
	);
	const filterDurationMs =
		album?.totalDurationMs !== undefined ? album.totalDurationMs : undefined;
	const filterDurationBucketKey = durationMsToBucketKey(filterDurationMs);

	await ctx.db.patch(item._id, {
		...(filterReleaseYear !== undefined
			? { filterReleaseYear }
			: { filterReleaseYear: undefined }),
		...(filterDurationMs !== undefined
			? { filterDurationMs }
			: { filterDurationMs: undefined }),
		...(filterDurationBucketKey !== undefined
			? { filterDurationBucketKey }
			: { filterDurationBucketKey: undefined }),
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
		updatedAt: now,
	});

	await syncForLaterAlbumGenreFacets(ctx, {
		itemId: item._id,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		genreKeysSorted: filterGenreKeysSorted,
	});

	await syncForLaterAlbumDescriptorFacets(ctx, {
		itemId: item._id,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		descriptorKeysSorted: filterDescriptorKeysSorted,
	});

	await syncForLaterAlbumDurationFacets(ctx, {
		itemId: item._id,
		userId: item.userId,
		lastSeenAt: item.lastSeenAt,
		durationBucketKey: filterDurationBucketKey,
	});
}

const FOR_LATER_RECOMMENDATION_SCAN_LIMIT = 2000;
const DEFAULT_GENRE_BUTTON_LIMIT = 12;

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

function readableRecommendationLabelFromKey(key: string): string {
	return key
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function recommendationCandidateFromLibraryRow(
	item: Doc<"albumLibraryItems">,
): ForLaterRecommendationCandidate | null {
	const forLater = item.forLater;
	if (item.isActiveForLater !== true || !forLater) {
		return null;
	}

	return {
		id: String(item._id),
		playlistAddedAt: forLater.playlistAddedAt,
		firstSeenAt: forLater.firstSeenAt,
		createdAt: forLater.firstSeenAt,
		releaseYear: item.releaseYear,
		filterGenreKeysSorted: item.filterGenreKeysSorted ?? [],
		filterDescriptorKeysSorted: item.descriptors.map((tag) => tag.key).sort(),
		filterDurationMs: item.totalDurationMs,
		rating: item.rating,
		hasListened: item.filterHasListened,
	};
}

async function collectVisibleActiveLibraryForLaterRows(
	ctx: ForLaterDbCtx,
	args: { userId: string },
): Promise<Doc<"albumLibraryItems">[]> {
	return await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_isActiveForLater_forLaterLastSeenAt", (q) =>
			q.eq("userId", args.userId).eq("isActiveForLater", true),
		)
		.order("desc")
		.take(FOR_LATER_RECOMMENDATION_SCAN_LIMIT);
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

function countBacklogGenreKeys(
	items: Doc<"albumLibraryItems">[],
): Map<string, number> {
	const counts = new Map<string, number>();

	for (const item of items) {
		const seen = new Set<string>();
		for (const key of item.filterGenreKeysSorted ?? []) {
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}

	return counts;
}

async function collectForLaterRecommendationGenreOptions(
	ctx: QueryCtx,
	args: { userId: string; search?: string },
): Promise<RecommendationTagOption[]> {
	const items = await collectVisibleActiveLibraryForLaterRows(ctx, {
		userId: args.userId,
	});
	const counts = countBacklogGenreKeys(items);
	const search = args.search?.trim().toLowerCase() ?? "";

	let options = sortRecommendationTagOptionsByCount(
		[...counts.entries()].map(([key, count]) => ({
			key,
			label: readableRecommendationLabelFromKey(key),
			count,
		})),
	);

	if (search.length > 0) {
		options = options.filter(
			(option) =>
				option.key.toLowerCase().includes(search) ||
				option.label.toLowerCase().includes(search),
		);
	}

	options = options.slice(0, DEFAULT_GENRE_BUTTON_LIMIT);
	const genreLabels = await loadRecommendationGenreLabels(
		ctx,
		options.map((option) => option.key),
	);

	return applyRecommendationOptionLabels(options, genreLabels);
}

async function collectForLaterRecommendationCandidates(
	ctx: ForLaterDbCtx,
	args: { userId: string; answers: ForLaterRecommendationAnswers; now: number },
): Promise<ForLaterRecommendationHydratedCandidate[]> {
	const items = await collectVisibleActiveLibraryForLaterRows(ctx, {
		userId: args.userId,
	});
	const cheapFilterAnswers: ForLaterRecommendationAnswers = {
		...args.answers,
		ratingMin: RATING_MIN,
		ratingMax: RATING_MAX,
	};

	const candidates: ForLaterRecommendationHydratedCandidate[] = [];
	for (const item of items) {
		const itemCandidate = recommendationCandidateFromLibraryRow(item);
		if (
			!itemCandidate ||
			!candidateMatchesRecommendationAnswers(
				itemCandidate,
				cheapFilterAnswers,
				args.now,
			)
		) {
			continue;
		}

		const row = await hydrateLibraryForLaterAlbumRow(ctx, item);
		if (!row) {
			continue;
		}

		candidates.push({
			row,
			candidate: {
				...itemCandidate,
				id: row.id,
				rating: row.rating,
				hasListened: row.hasListened,
			},
		});
	}

	return candidates;
}

function clampSwapRange(
	min: number,
	max: number,
): { min: number; max: number } {
	if (min <= max) {
		return { min, max };
	}
	return { min: max, max: min };
}

function normalizeRecommendationAnswers(
	answers: {
		addedDaysMin: number;
		addedDaysMax: number;
		yearMin?: number;
		yearMax?: number;
		durationMinMs: number;
		durationMaxMs: number;
		ratingMin: number;
		ratingMax: number;
		listened: ListenedAnswer;
		genreKeys: string[];
		genreMatch: GenreMatchAnswer;
		count: number;
	},
	now: number,
): ForLaterRecommendationAnswers {
	const added = clampSwapRange(answers.addedDaysMin, answers.addedDaysMax);
	const duration = clampSwapRange(answers.durationMinMs, answers.durationMaxMs);
	const rating = clampSwapRange(answers.ratingMin, answers.ratingMax);
	const addedDaysMaxBound = getAddedDaysMax(now);

	let yearMin = answers.yearMin;
	let yearMax = answers.yearMax;
	if (yearMin !== undefined && yearMax !== undefined && yearMin > yearMax) {
		[yearMin, yearMax] = [yearMax, yearMin];
	}

	const genreKeys = [
		...new Set(
			answers.genreKeys
				.map((key) => key.trim())
				.filter((key) => key.length > 0),
		),
	];

	return {
		addedDaysMin: Math.max(
			ADDED_DAYS_MIN,
			Math.min(addedDaysMaxBound, added.min),
		),
		addedDaysMax: Math.max(
			ADDED_DAYS_MIN,
			Math.min(addedDaysMaxBound, added.max),
		),
		...(yearMin !== undefined ? { yearMin } : {}),
		...(yearMax !== undefined ? { yearMax } : {}),
		durationMinMs: Math.max(0, duration.min),
		durationMaxMs: Math.max(0, duration.max),
		ratingMin: Math.max(RATING_MIN, Math.min(RATING_MAX, rating.min)),
		ratingMax: Math.max(RATING_MIN, Math.min(RATING_MAX, rating.max)),
		listened: answers.listened,
		genreKeys,
		genreMatch: answers.genreMatch === "all" ? "all" : "any",
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
		RECOMMENDATION_POOL_SIZE,
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

async function hydrateLibraryForLaterAlbumRow(
	ctx: QueryCtx,
	item: Doc<"albumLibraryItems">,
): Promise<ForLaterAlbumRow | null> {
	const forLater = item.forLater;
	if (item.isActiveForLater !== true || !forLater) {
		return null;
	}

	const userAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", item.userId).eq("albumId", item.albumId),
		)
		.first();

	return {
		id: String(item._id),
		libraryItemId: item._id,
		albumId: item.albumId,
		spotifyAlbumId: item.spotifyAlbumId,
		name: item.name,
		artistName: item.artistName,
		...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
		...(item.releaseDate ? { releaseDate: item.releaseDate } : {}),
		...(item.releaseYear !== undefined
			? { releaseYear: item.releaseYear }
			: {}),
		...(forLater.playlistAddedAt !== undefined
			? { playlistAddedAt: forLater.playlistAddedAt }
			: {}),
		firstSeenAt: forLater.firstSeenAt,
		createdAt: forLater.firstSeenAt,
		lastSeenAt: forLater.lastSeenAt,
		isActive: true,
		hasListened: item.filterHasListened,
		...(userAlbum ? { userAlbumId: userAlbum._id } : {}),
		listenCount: item.listenCount,
		...(item.lastListenedAt !== undefined
			? { lastListenedAt: item.lastListenedAt }
			: {}),
		...(item.rating !== undefined ? { rating: item.rating } : {}),
		rymStatus: item.rymStatus === "linked" ? "matched" : "unmatched",
		...(item.rymUrl ? { rymUrl: item.rymUrl } : {}),
		...(item.rymLinkMethod ? { rymMatchMethod: item.rymLinkMethod } : {}),
		...(item.rymNotOnSite === true ? { rymNotOnSite: true } : {}),
		primaryGenres: item.primaryGenres,
		secondaryGenres: item.secondaryGenres,
		descriptors: item.descriptors,
	};
}

async function loadForLaterAlbumRows(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: ForLaterFiltersNormalizeInput;
		paginationOpts: { numItems: number; cursor: string | null };
	},
): Promise<LoadForLaterAlbumRowsResult> {
	const filters = normalizeForLaterFilters(args.filters);
	const matchingRows = stream(ctx.db, schema)
		.query("albumLibraryItems")
		.withIndex("by_userId_isActiveForLater_forLaterLastSeenAt", (q) =>
			q.eq("userId", args.userId).eq("isActiveForLater", true),
		)
		.order("desc")
		.filterWith(async (item) => libraryRowMatchesForLaterFilters(item, filters))
		.map(async (item) => ({
			row: await hydrateLibraryForLaterAlbumRow(ctx, item),
		}))
		.filterWith(async ({ row }) => row !== null)
		.map(async ({ row }) => {
			if (!row) {
				throw new Error("Filtered For Later row unexpectedly missing");
			}
			return row;
		});

	const result = await matchingRows.paginate({
		...args.paginationOpts,
		maximumRowsRead: FOR_LATER_FILTER_MAXIMUM_ROWS_READ,
	});

	return {
		page: sortForLaterRows(result.page),
		isDone: result.isDone,
		continueCursor: result.continueCursor,
		...(result.pageStatus ? { pageStatus: result.pageStatus } : {}),
		...(result.splitCursor ? { splitCursor: result.splitCursor } : {}),
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
		totalDurationMs: v.optional(v.number()),
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

		if (args.totalDurationMs !== undefined) {
			await ctx.db.patch(args.albumId, {
				totalDurationMs: args.totalDurationMs,
				updatedAt: args.seenAt,
			});
		}

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
		await patchLibraryForLaterState(ctx, {
			userId: args.userId,
			albumId: args.albumId,
			event: {
				type: "observed",
				seenAt: args.seenAt,
				playlistAddedAt: args.playlistAddedAt,
			},
		});

		return {
			itemId,
			isNew,
			rymMatch,
			rymMatchCreated: rymMatch.scrapeId !== undefined,
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
			.query("albumLibraryItems")
			.withIndex("by_userId_isActiveForLater_createdAt", (q) =>
				q.eq("userId", args.userId).eq("isActiveForLater", true),
			)
			.collect();
		const dismissedRows = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_isActiveForLater_createdAt", (q) =>
				q.eq("userId", args.userId).eq("isActiveForLater", false),
			)
			.collect();
		const lastSync = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		return {
			activeCount: activeRows.length,
			removedCount: dismissedRows.filter(
				(row) => row.forLater?.dismissedAt !== undefined,
			).length,
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
		search: v.optional(v.string()),
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
		const genres = await collectForLaterRecommendationGenreOptions(ctx, {
			userId: args.userId,
			search: args.search,
		});
		return { genres };
	},
});

export const listForLaterDurationBucketCounts = query({
	args: {
		userId: v.string(),
	},
	returns: v.array(recommendationOptionValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const items = await collectVisibleActiveLibraryForLaterRows(ctx, {
			userId: args.userId,
		});
		return buildDurationBucketRecommendationOptions(
			items.map((item) => ({ filterDurationMs: item.totalDurationMs })),
		);
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
		const answers = normalizeRecommendationAnswers(args.answers, args.now);

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
		const answers = normalizeRecommendationAnswers(args.answers, args.now);
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
		pageStatus: v.optional(
			v.union(v.literal("SplitRecommended"), v.literal("SplitRequired")),
		),
		splitCursor: v.optional(v.string()),
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
				numItems: Math.max(1, Math.floor(args.limit)),
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
		albumIds: v.array(v.id("spotifyAlbums")),
	},
	returns: v.object({ queued: v.number() }),
	handler: async (ctx, args): Promise<{ queued: number }> => {
		requireAuth(ctx);
		const now = Date.now();
		let queued = 0;
		for (const albumId of args.albumIds) {
			const doc = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", albumId),
				)
				.first();
			if (!doc) {
				continue;
			}
			await ctx.db.patch(doc._id, {
				rymDiscoveryStatus: "queued",
				rymDiscoveryUpdatedAt: now,
				updatedAt: now,
			});
			await syncForLaterItemFilterProjection(ctx, doc._id);
			queued++;
		}
		return { queued };
	},
});

export const setForLaterAlbumRymNotOnSite = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		notOnSite: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);
		const item = await requireLegacyForLaterItemByAlbum(ctx, args);
		const album = await ctx.db.get(args.albumId);
		if (!album) {
			throw new Error("Album not found");
		}
		const now = Date.now();
		await ctx.db.patch(args.albumId, {
			rymNotOnSite: args.notOnSite ? true : undefined,
			updatedAt: now,
		});
		await ctx.db.patch(item._id, {
			rymNotOnSite: args.notOnSite ? true : undefined,
			updatedAt: now,
		});
		await syncForLaterItemFilterProjection(ctx, item._id);
		await refreshAlbumLibraryProjectionsForAlbum(ctx, args.albumId);
		return null;
	},
});

export const setForLaterAlbumRemovedFromForLater = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		removedFromForLater: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);
		const item = await requireLegacyForLaterItemByAlbum(ctx, args);
		const now = Date.now();
		await ctx.db.patch(item._id, {
			removedFromForLater: args.removedFromForLater ? true : undefined,
			updatedAt: now,
		});
		await syncForLaterItemFilterProjection(ctx, item._id);
		await patchLibraryForLaterState(ctx, {
			userId: args.userId,
			albumId: item.albumId,
			event: args.removedFromForLater
				? { type: "dismissed", dismissedAt: now }
				: { type: "restored" },
		});
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
		v.literal("additional"),
	),
	createdAt: v.number(),
});

export const searchUnmappedRymScrapes = query({
	args: {
		search: v.optional(v.string()),
		includeMapped: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	returns: v.array(unmappedRymScrapeRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
		const searchTerm = args.search?.trim() ?? "";

		const mappedIds = args.includeMapped
			? new Set<Id<"rateYourMusicScrapes">>()
			: await collectMappedRymScrapeIds(ctx);

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
			releaseKind: "album" | "ep" | "mixtape" | "comp" | "additional";
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
		albumId: v.id("spotifyAlbums"),
		scrapeId: v.id("rateYourMusicScrapes"),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		requireAuth(ctx);

		const item = await requireLegacyForLaterItemByAlbum(ctx, args);

		const scrape = await ctx.db.get(args.scrapeId);
		if (!scrape) {
			throw new Error("RYM scrape not found");
		}

		const mappedElsewhere = await isRymScrapeMappedElsewhere(ctx, {
			scrapeId: args.scrapeId,
			allowedItemId: item._id,
			allowedAlbumId: item.albumId,
		});
		if (mappedElsewhere) {
			throw new Error("This RYM scrape is already linked to another album");
		}

		const now = Date.now();
		const tags = await loadTagsForScrape(ctx, args.scrapeId);
		const parentKeysByChild = await loadRymGenreParentKeysByChild(ctx);
		const album = await ctx.db.get(item.albumId);

		await linkRymScrapeToSpotifyAlbum(ctx, {
			scrapeId: args.scrapeId,
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			method: "manual",
			now,
			refreshMode: "rym-slice",
		});

		await ctx.db.patch(item.albumId, {
			rymNotOnSite: undefined,
			updatedAt: now,
		});

		await ctx.db.patch(item._id, {
			rymScrapeId: args.scrapeId,
			rymMatchMethod: "manual",
			rymMatchedAt: now,
			rymDiscoveryStatus: "found",
			rymNotOnSite: undefined,
			updatedAt: now,
		});

		if (album) {
			await syncForLaterRymLinkFilterProjection(ctx, {
				item: {
					...item,
					rymScrapeId: args.scrapeId,
					rymMatchMethod: "manual",
					rymMatchedAt: now,
					rymDiscoveryStatus: "found",
					rymNotOnSite: undefined,
					updatedAt: now,
				},
				album,
				scrape,
				tags,
				parentKeysByChild,
				now,
			});
		}

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

export const backfillMyAppearsInForLater = mutation({
	args: {
		userId: v.string(),
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		processed: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		// Each upsert does many reads; keep batches small for the 4096-read limit.
		const limit = Math.min(Math.max(args.limit ?? 15, 1), 40);
		const page = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.paginate({
				numItems: limit,
				cursor: args.cursor ?? null,
			});
		for (const row of page.page) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId: row.albumId,
			});
		}
		return {
			processed: page.page.length,
			isDone: page.isDone,
			continueCursor: page.isDone ? null : page.continueCursor,
		};
	},
});

export const backfillLibraryForLaterBatch = internalMutation({
	args: {
		userId: v.string(),
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		processed: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(Math.floor(args.limit ?? 25), 1), 50);
		const page = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.paginate({
				numItems: limit,
				cursor: args.cursor ?? null,
				maximumRowsRead: limit,
			});
		const albumIds = new Set(page.page.map((row) => row.albumId));

		for (const albumId of albumIds) {
			const legacyRows = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", albumId),
				)
				.collect();
			const patch = legacyRowsToLibraryForLater(
				legacyRows.map((row) => ({
					firstSeenAt: row.firstSeenAt,
					lastSeenAt: row.lastSeenAt,
					playlistAddedAt: row.playlistAddedAt,
					removedFromForLater: row.removedFromForLater,
					markedAsSingle: row.markedAsSingle,
					updatedAt: row.updatedAt,
					creationTime: row._creationTime,
				})),
			);

			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId,
			});
			const libraryRow = await ctx.db
				.query("albumLibraryItems")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", albumId),
				)
				.first();
			if (!libraryRow) {
				throw new Error("Album library row could not be created");
			}
			await ctx.db.patch(libraryRow._id, {
				forLater: patch.forLater,
				isActiveForLater: patch.isActiveForLater,
				appearsInForLater: patch.isActiveForLater,
				forLaterLastSeenAt: patch.forLater.lastSeenAt,
			});
		}

		return {
			processed: albumIds.size,
			isDone: page.isDone,
			continueCursor: page.isDone ? null : page.continueCursor,
		};
	},
});

export const verifyLibraryForLaterMigration = internalQuery({
	args: {
		userId: v.string(),
		cursor: v.optional(v.union(v.string(), v.null())),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		legacyActive: v.number(),
		libraryActive: v.number(),
		missingLibraryState: v.number(),
		mismatchedActivity: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(Math.floor(args.limit ?? 25), 1), 50);
		const page = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.paginate({
				numItems: limit,
				cursor: args.cursor ?? null,
				maximumRowsRead: limit,
			});
		const albumIds = new Set(page.page.map((row) => row.albumId));
		let legacyActive = 0;
		let libraryActive = 0;
		let missingLibraryState = 0;
		let mismatchedActivity = 0;

		for (const albumId of albumIds) {
			const legacyRows = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", albumId),
				)
				.collect();
			if (!duplicateGroupStartsOnPage(legacyRows, page.page)) {
				continue;
			}
			if (
				legacyRows.some(
					(row) =>
						row.isActive === true &&
						row.markedAsSingle !== true &&
						row.removedFromForLater !== true,
				)
			) {
				legacyActive += 1;
			}

			const libraryRow = await ctx.db
				.query("albumLibraryItems")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", albumId),
				)
				.first();
			if (!libraryRow?.forLater || libraryRow.isActiveForLater === undefined) {
				missingLibraryState += 1;
				continue;
			}
			if (libraryRow.isActiveForLater) {
				libraryActive += 1;
			}
			if (
				libraryRow.isActiveForLater !==
				deriveIsActiveForLater(libraryRow.forLater)
			) {
				mismatchedActivity += 1;
			}
		}

		return {
			legacyActive,
			libraryActive,
			missingLibraryState,
			mismatchedActivity,
			isDone: page.isDone,
			continueCursor: page.isDone ? null : page.continueCursor,
		};
	},
});

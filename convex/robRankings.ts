import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { upsertAlbumLibraryProjection } from "./_utils/albumLibraryProjection";
import {
	buildSpotifyAlbumRymMatchArgs,
	matchRymForSpotifyAlbum,
} from "./_utils/albumMatching";
import { loadRymGenreParentKeysByChild } from "./_utils/forLaterFilterProjection";
import {
	type ArtistFinishInput,
	buildArtistHighestPlacementRows,
	buildArtistStatsRows,
	buildArtistUniqueTierRows,
	resolveArtistNamesForRankingEntry,
} from "./_utils/robRankingArtistStats";
import {
	type RobRankingAlbumGenreInput,
	type RobRankingTopLevelGenre,
	buildRobRankingGenreCountSummary,
} from "./_utils/robRankingGenreStats";
import { resolveTopLevelGenreKeys } from "./_utils/rymGenreHierarchy";

type RankingAlbumDisplay = {
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
};

function isManualRankingEntry(ranking: Doc<"robRankingAlbums">): boolean {
	if (ranking.source === "manual") return true;
	if (ranking.source === "spotify") return false;
	return (
		ranking.manualAlbumTitle !== undefined && ranking.albumId === undefined
	);
}

function resolveRankingAlbumDisplay(
	ranking: Doc<"robRankingAlbums">,
	spotifyAlbum: Doc<"spotifyAlbums"> | null,
): RankingAlbumDisplay | null {
	if (isManualRankingEntry(ranking)) {
		return {
			name: ranking.manualAlbumTitle ?? "Unknown",
			artistName: ranking.manualArtistName ?? "Unknown",
			imageUrl: ranking.manualImageUrl,
		};
	}

	if (spotifyAlbum) {
		return {
			name: spotifyAlbum.name,
			artistName: spotifyAlbum.artistName,
			imageUrl: spotifyAlbum.imageUrl,
			releaseDate: spotifyAlbum.releaseDate,
		};
	}

	return null;
}

function getRankingSource(
	ranking: Doc<"robRankingAlbums">,
): "spotify" | "manual" {
	return isManualRankingEntry(ranking) ? "manual" : "spotify";
}

async function attemptRymMatchForRankingAlbum(
	ctx: MutationCtx,
	albumId: Id<"spotifyAlbums">,
	now: number,
): Promise<void> {
	const album = await ctx.db.get(albumId);
	if (!album) return;

	await matchRymForSpotifyAlbum(ctx, {
		...buildSpotifyAlbumRymMatchArgs(album),
		now,
	});
}

// Get or create a year entry for Rob's rankings
export const getOrCreateYear = mutation({
	args: {
		userId: v.string(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("robRankingYears")
			.withIndex("by_userId_year", (q) =>
				q.eq("userId", args.userId).eq("year", args.year),
			)
			.first();

		if (existing) {
			return existing._id;
		}

		const now = Date.now();
		return await ctx.db.insert("robRankingYears", {
			userId: args.userId,
			year: args.year,
			published: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const listYearSummariesForUser = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const years = await ctx.db
			.query("robRankingYears")
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.collect();

		const summaries = await Promise.all(
			years.map(async (yearRow) => {
				const entries = await ctx.db
					.query("robRankingAlbums")
					.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
					.collect();
				return {
					yearId: yearRow._id,
					year: yearRow.year,
					published: yearRow.published ?? false,
					publishedAt: yearRow.publishedAt,
					entryCount: entries.length,
				};
			}),
		);

		return summaries.sort((a, b) => b.year - a.year);
	},
});

// Get all years that have rankings
export const getYearsForUser = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const years = await ctx.db
			.query("robRankingYears")
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.collect();

		return years.map((y) => y.year).sort((a, b) => b - a);
	},
});

export const listPublishedYears = query({
	args: {},
	handler: async (ctx) => {
		const years = await ctx.db
			.query("robRankingYears")
			.withIndex("by_published", (q) => q.eq("published", true))
			.collect();

		return years
			.map((y) => ({ year: y.year, publishedAt: y.publishedAt }))
			.sort((a, b) => b.year - a.year);
	},
});

const publishedArtistStatsRowValidator = v.object({
	artistKey: v.string(),
	displayName: v.string(),
	wins: v.number(),
	top3: v.number(),
	top5: v.number(),
	top10: v.number(),
	top25: v.number(),
	top50: v.number(),
	yearsAppeared: v.number(),
});

const publishedArtistHighestPlacementRowValidator = v.object({
	artistKey: v.string(),
	displayName: v.string(),
	bestPlacement: v.number(),
	bestPlacementYear: v.number(),
});

const artistUniqueTierValidator = v.union(
	v.literal("wins"),
	v.literal("top3"),
	v.literal("top5"),
	v.literal("top10"),
	v.literal("top25"),
	v.literal("top50"),
);

const robRankingTopCountValidator = v.union(
	v.literal(3),
	v.literal(5),
	v.literal(10),
	v.literal(15),
	v.literal(25),
	v.literal(50),
);

const publishedArtistUniqueTierRowValidator = v.object({
	artistKey: v.string(),
	displayName: v.string(),
	tierBestPlacement: v.number(),
	tierBestPlacementYear: v.number(),
});

const publishedTopLevelGenreCountRowValidator = v.object({
	genreKey: v.string(),
	label: v.string(),
	count: v.number(),
	albums: v.array(
		v.object({
			position: v.number(),
			albumName: v.string(),
			artistName: v.string(),
			throughGenres: v.array(v.string()),
		}),
	),
});

const publishedTopLevelGenreCountSummaryValidator = v.object({
	year: v.union(v.number(), v.null()),
	totalAlbums: v.number(),
	albumsWithGenreData: v.number(),
	albumsMissingGenreData: v.number(),
	genres: v.array(publishedTopLevelGenreCountRowValidator),
});

async function resolveArtistNamesForRanking(
	ctx: QueryCtx,
	ranking: Doc<"robRankingAlbums">,
): Promise<string[]> {
	const spotifyAlbum = ranking.albumId
		? await ctx.db.get(ranking.albumId)
		: null;

	return resolveArtistNamesForRankingEntry(ranking, {
		isManual: isManualRankingEntry(ranking),
		spotifyAlbum,
	});
}

async function collectPublishedArtistFinishEntries(
	ctx: QueryCtx,
): Promise<ArtistFinishInput[]> {
	const years = await ctx.db
		.query("robRankingYears")
		.withIndex("by_published", (q) => q.eq("published", true))
		.collect();

	const entries: ArtistFinishInput[] = [];

	for (const yearRow of years) {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
			.collect();

		for (const ranking of rankings) {
			const artistNames = await resolveArtistNamesForRanking(ctx, ranking);
			if (artistNames.length === 0) continue;

			entries.push({
				position: ranking.position,
				artistNames,
				year: yearRow.year,
			});
		}
	}

	return entries;
}

export const getPublishedArtistStats = query({
	args: {},
	returns: v.array(publishedArtistStatsRowValidator),
	handler: async (ctx) => {
		const entries = await collectPublishedArtistFinishEntries(ctx);
		return buildArtistStatsRows(entries);
	},
});

export const getPublishedArtistHighestPlacements = query({
	args: {},
	returns: v.array(publishedArtistHighestPlacementRowValidator),
	handler: async (ctx) => {
		const entries = await collectPublishedArtistFinishEntries(ctx);
		return buildArtistHighestPlacementRows(entries);
	},
});

export const getPublishedArtistUniqueTierPlacements = query({
	args: {
		tier: artistUniqueTierValidator,
	},
	returns: v.array(publishedArtistUniqueTierRowValidator),
	handler: async (ctx, args) => {
		const entries = await collectPublishedArtistFinishEntries(ctx);
		return buildArtistUniqueTierRows(entries, args.tier);
	},
});

export const getPublishedTopLevelGenreCountsForYear = query({
	args: {
		year: v.number(),
		topCount: v.optional(robRankingTopCountValidator),
	},
	returns: publishedTopLevelGenreCountSummaryValidator,
	handler: async (ctx, args) => {
		const topCount = args.topCount ?? 50;
		const yearRow = await ctx.db
			.query("robRankingYears")
			.filter((q) =>
				q.and(
					q.eq(q.field("year"), args.year),
					q.eq(q.field("published"), true),
				),
			)
			.first();

		return await buildPublishedTopLevelGenreCountsSummary(ctx, {
			year: yearRow?.year ?? args.year,
			yearRows: yearRow ? [yearRow] : [],
			includeAlbumDetails: true,
			topCount,
		});
	},
});

export const getPublishedTopLevelGenreCountsForAllYears = query({
	args: {
		topCount: v.optional(robRankingTopCountValidator),
	},
	returns: publishedTopLevelGenreCountSummaryValidator,
	handler: async (ctx, args) => {
		const topCount = args.topCount ?? 50;
		const yearRows = await ctx.db
			.query("robRankingYears")
			.withIndex("by_published", (q) => q.eq("published", true))
			.collect();

		return await buildPublishedTopLevelGenreCountsSummary(ctx, {
			year: null,
			yearRows,
			includeAlbumDetails: false,
			topCount,
		});
	},
});

async function buildPublishedTopLevelGenreCountsSummary(
	ctx: QueryCtx,
	{
		year,
		yearRows,
		includeAlbumDetails,
		topCount,
	}: {
		year: number | null;
		yearRows: Doc<"robRankingYears">[];
		includeAlbumDetails: boolean;
		topCount: 3 | 5 | 10 | 15 | 25 | 50;
	},
) {
	const [parentKeysByChild, topLevelGenres] = await Promise.all([
		loadRymGenreParentKeysByChild(ctx),
		ctx.db
			.query("rateYourMusicGenres")
			.withIndex("by_isTopLevel", (q) => q.eq("isTopLevel", true))
			.collect(),
	]);

	const topLevelGenreKeys = new Set(topLevelGenres.map((genre) => genre.key));
	const labelsByKey = new Map(
		topLevelGenres.map((genre) => [genre.key, genre.label]),
	);
	const albumTopLevelGenres: RobRankingAlbumGenreInput[] = [];
	let totalAlbums = 0;

	for (const yearRow of yearRows) {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
			.collect();
		const rankingsInRange = rankings.filter(
			(ranking) => ranking.position <= topCount,
		);
		totalAlbums += rankingsInRange.length;

		for (const ranking of rankingsInRange) {
			if (!ranking.albumId) {
				albumTopLevelGenres.push({ genres: [] });
				continue;
			}

			const album = await ctx.db.get(ranking.albumId);
			const display = resolveRankingAlbumDisplay(ranking, album);
			const genreAlbum =
				includeAlbumDetails && display
					? {
							position: ranking.position,
							albumName: display.name,
							artistName: display.artistName,
						}
					: undefined;

			const link = await loadLatestRymLinkForAlbum(ctx, ranking.albumId);
			if (!link) {
				albumTopLevelGenres.push({ album: genreAlbum, genres: [] });
				continue;
			}

			albumTopLevelGenres.push({
				album: genreAlbum,
				genres: await loadTopLevelGenresForScrape(
					ctx,
					link.scrapeId,
					parentKeysByChild,
					topLevelGenreKeys,
					labelsByKey,
				),
			});
		}
	}

	return buildRobRankingGenreCountSummary({
		year,
		totalAlbums,
		albumTopLevelGenres,
	});
}

async function loadLatestRymLinkForAlbum(
	ctx: QueryCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<Doc<"rateYourMusicSpotifyAlbumLinks"> | null> {
	const links = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();

	return [...links].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function loadTopLevelGenresForScrape(
	ctx: QueryCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	parentKeysByChild: Map<string, string[]>,
	topLevelGenreKeys: Set<string>,
	labelsByKey: Map<string, string>,
): Promise<RobRankingTopLevelGenre[]> {
	const releaseGenres = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const topLevelGenres: RobRankingTopLevelGenre[] = [];

	for (const releaseGenre of releaseGenres) {
		if (releaseGenre.role === "primary") {
			const genre = await ctx.db.get(releaseGenre.genreId);
			if (!genre) continue;

			const topLevelKeys = resolveTopLevelGenreKeys(
				genre.key,
				parentKeysByChild,
				topLevelGenreKeys,
			);

			for (const topLevelKey of topLevelKeys) {
				topLevelGenres.push({
					key: topLevelKey,
					label: labelsByKey.get(topLevelKey) ?? genre.label,
					throughGenreLabel: genre.label,
				});
			}
		}
	}

	return topLevelGenres;
}

export const getPublishedAlbumsForYear = query({
	args: {
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db
			.query("robRankingYears")
			.filter((q) =>
				q.and(
					q.eq(q.field("year"), args.year),
					q.eq(q.field("published"), true),
				),
			)
			.first();

		if (!yearRow) return [];

		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
			.collect();

		const albumsWithData = await Promise.all(
			rankings.map(async (ranking) => {
				const album = ranking.albumId
					? await ctx.db.get(ranking.albumId)
					: null;
				return {
					position: ranking.position,
					album: resolveRankingAlbumDisplay(ranking, album),
				};
			}),
		);

		return albumsWithData.sort((a, b) => a.position - b.position);
	},
});

// Get albums for a specific year with joined album data
export const getAlbumsForYear = query({
	args: {
		yearId: v.id("robRankingYears"),
	},
	handler: async (ctx, args) => {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		const albumsWithData = await Promise.all(
			rankings.map(async (ranking) => {
				const album = ranking.albumId
					? await ctx.db.get(ranking.albumId)
					: null;
				return {
					_id: ranking._id,
					albumId: ranking.albumId,
					source: getRankingSource(ranking),
					artistNames: ranking.artistNames,
					position: ranking.position,
					album: resolveRankingAlbumDisplay(ranking, album),
				};
			}),
		);

		return albumsWithData.sort((a, b) => a.position - b.position);
	},
});

// Get all available albums (from spotifyAlbums) that aren't already in the year
export const getAvailableAlbums = query({
	args: {
		yearId: v.id("robRankingYears"),
	},
	handler: async (ctx, args) => {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		const usedAlbumIds = new Set(
			rankings
				.filter((r) => r.albumId !== undefined)
				.map((r) => r.albumId?.toString())
				.filter((id): id is string => id !== undefined),
		);

		const allAlbums = await ctx.db.query("spotifyAlbums").collect();

		return allAlbums
			.filter((a) => !usedAlbumIds.has(a._id.toString()))
			.map((a) => ({
				_id: a._id,
				spotifyAlbumId: a.spotifyAlbumId,
				name: a.name,
				artistName: a.artistName,
				imageUrl: a.imageUrl,
				releaseDate: a.releaseDate,
				totalTracks: a.totalTracks,
			}));
	},
});

export const setYearPublished = mutation({
	args: {
		yearId: v.id("robRankingYears"),
		published: v.boolean(),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db.get(args.yearId);
		if (!yearRow) throw new Error("Year not found");

		if (args.published) {
			const entries = await ctx.db
				.query("robRankingAlbums")
				.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
				.collect();
			if (entries.length === 0) {
				throw new Error("Cannot publish an empty list");
			}
		}

		const now = Date.now();
		await ctx.db.patch(args.yearId, {
			published: args.published,
			publishedAt: args.published ? now : yearRow.publishedAt,
			updatedAt: now,
		});
	},
});

export const replaceYearFromAlbums = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumIds: v.array(v.id("spotifyAlbums")),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db.get(args.yearId);
		if (!yearRow) throw new Error("Year not found");
		if (yearRow.userId !== args.userId) {
			throw new Error("Not authorized for this year");
		}
		if (args.albumIds.length > 50) {
			throw new Error("Cannot import more than 50 albums");
		}

		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();
		const existingSpotifyAlbumIds = existing
			.map((row) => row.albumId)
			.filter(
				(albumId): albumId is Id<"spotifyAlbums"> => albumId !== undefined,
			);

		for (const row of existing) {
			await ctx.db.delete(row._id);
		}

		const now = Date.now();
		for (let i = 0; i < args.albumIds.length; i++) {
			const albumId = args.albumIds[i];
			if (!albumId) continue;
			await ctx.db.insert("robRankingAlbums", {
				userId: args.userId,
				yearId: args.yearId,
				albumId,
				source: "spotify",
				position: i + 1,
				status: "none",
				createdAt: now,
				updatedAt: now,
			});
			await attemptRymMatchForRankingAlbum(ctx, albumId, now);
		}

		await ctx.db.patch(args.yearId, { updatedAt: now });
		for (const albumId of [...existingSpotifyAlbumIds, ...args.albumIds]) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId,
			});
		}
		return { imported: args.albumIds.length };
	},
});

// Add an album to a year's rankings
export const addAlbumToYear = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumId: v.id("spotifyAlbums"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		if (existing.length >= 50) {
			throw new Error("Cannot add more than 50 albums");
		}

		const alreadyAdded = existing.find(
			(e) =>
				e.albumId !== undefined &&
				e.albumId.toString() === args.albumId.toString(),
		);
		if (alreadyAdded) {
			throw new Error("Album already in rankings");
		}

		const now = Date.now();
		const rankingAlbumId = await ctx.db.insert("robRankingAlbums", {
			userId: args.userId,
			yearId: args.yearId,
			albumId: args.albumId,
			source: "spotify",
			position: existing.length + 1,
			status: "none",
			createdAt: now,
			updatedAt: now,
		});

		await attemptRymMatchForRankingAlbum(ctx, args.albumId, now);
		await upsertAlbumLibraryProjection(ctx, {
			userId: args.userId,
			albumId: args.albumId,
		});

		return rankingAlbumId;
	},
});

export const updateRankingAlbumManual = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
		artistName: v.string(),
		albumTitle: v.string(),
		imageUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const ranking = await ctx.db.get(args.rankingAlbumId);
		if (!ranking) throw new Error("Entry not found");
		const oldAlbumId = ranking.albumId;

		const trimmedTitle = args.albumTitle.trim();
		const trimmedArtist = args.artistName.trim();
		if (!trimmedTitle) throw new Error("Album title is required");
		if (!trimmedArtist) throw new Error("Artist name is required");

		const trimmedImageUrl = args.imageUrl?.trim();

		await ctx.db.patch(args.rankingAlbumId, {
			source: "manual",
			albumId: undefined,
			manualArtistName: trimmedArtist,
			manualAlbumTitle: trimmedTitle,
			manualImageUrl: trimmedImageUrl || undefined,
			artistNames: [trimmedArtist],
			updatedAt: Date.now(),
		});
		if (oldAlbumId) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: ranking.userId,
				albumId: oldAlbumId,
			});
		}
	},
});

export const setRankingArtistNames = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
		singleArtist: v.boolean(),
	},
	handler: async (ctx, args) => {
		const ranking = await ctx.db.get(args.rankingAlbumId);
		if (!ranking) throw new Error("Entry not found");

		if (args.singleArtist) {
			const spotifyAlbum = ranking.albumId
				? await ctx.db.get(ranking.albumId)
				: null;
			const display = resolveRankingAlbumDisplay(ranking, spotifyAlbum);
			const displayArtist = display?.artistName?.trim();
			if (!displayArtist) {
				throw new Error("No artist name available for this entry");
			}

			await ctx.db.patch(args.rankingAlbumId, {
				artistNames: [displayArtist],
				updatedAt: Date.now(),
			});
			return;
		}

		await ctx.db.patch(args.rankingAlbumId, {
			artistNames: undefined,
			updatedAt: Date.now(),
		});
	},
});

export const addManualAlbumToYear = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		artistName: v.string(),
		albumTitle: v.string(),
		imageUrl: v.optional(v.string()),
		position: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db.get(args.yearId);
		if (!yearRow) throw new Error("Year not found");
		if (yearRow.userId !== args.userId) {
			throw new Error("Not authorized for this year");
		}

		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		if (existing.length >= 50) {
			throw new Error("Cannot add more than 50 albums");
		}

		const trimmedTitle = args.albumTitle.trim();
		const trimmedArtist = args.artistName.trim();
		if (!trimmedTitle) throw new Error("Album title is required");
		if (!trimmedArtist) throw new Error("Artist name is required");

		const trimmedImageUrl = args.imageUrl?.trim();
		const targetPosition = args.position ?? existing.length + 1;

		if (targetPosition < 1 || targetPosition > 50) {
			throw new Error("Position must be between 1 and 50");
		}
		if (targetPosition > existing.length + 1) {
			throw new Error(
				`Position must be at most ${existing.length + 1} (next available slot)`,
			);
		}

		const now = Date.now();

		if (targetPosition <= existing.length) {
			const toShift = existing
				.filter((entry) => entry.position >= targetPosition)
				.sort((a, b) => b.position - a.position);

			for (const entry of toShift) {
				await ctx.db.patch(entry._id, {
					position: entry.position + 1,
					updatedAt: now,
				});
			}
		}

		return await ctx.db.insert("robRankingAlbums", {
			userId: args.userId,
			yearId: args.yearId,
			source: "manual",
			manualArtistName: trimmedArtist,
			manualAlbumTitle: trimmedTitle,
			manualImageUrl: trimmedImageUrl || undefined,
			position: targetPosition,
			status: "none",
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Remove an album from a year's rankings
export const removeAlbumFromYear = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
	},
	handler: async (ctx, args) => {
		const ranking = await ctx.db.get(args.rankingAlbumId);
		if (!ranking) return;

		const removedPosition = ranking.position;

		await ctx.db.delete(args.rankingAlbumId);

		const higherPositions = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", ranking.yearId))
			.filter((q) => q.gt(q.field("position"), removedPosition))
			.collect();

		for (const album of higherPositions) {
			await ctx.db.patch(album._id, {
				position: album.position - 1,
				updatedAt: Date.now(),
			});
		}
		if (ranking.albumId) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: ranking.userId,
				albumId: ranking.albumId,
			});
		}
	},
});

// Update album position (swap with target position)
export const updateAlbumPosition = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
		newPosition: v.number(),
	},
	handler: async (ctx, args) => {
		const album = await ctx.db.get(args.rankingAlbumId);
		if (!album) throw new Error("Album not found");

		const oldPosition = album.position;
		if (oldPosition === args.newPosition) return;

		const targetAlbum = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId_position", (q) =>
				q.eq("yearId", album.yearId).eq("position", args.newPosition),
			)
			.first();

		const now = Date.now();

		if (targetAlbum) {
			await ctx.db.patch(targetAlbum._id, {
				position: oldPosition,
				updatedAt: now,
			});
		}

		await ctx.db.patch(args.rankingAlbumId, {
			position: args.newPosition,
			updatedAt: now,
		});
	},
});

// Batch update album positions - applies all position changes atomically
export const batchUpdatePositions = mutation({
	args: {
		yearId: v.id("robRankingYears"),
		positions: v.array(
			v.object({
				rankingAlbumId: v.id("robRankingAlbums"),
				position: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const { rankingAlbumId } of args.positions) {
			const album = await ctx.db.get(rankingAlbumId);
			if (!album) throw new Error(`Album ${rankingAlbumId} not found`);
			if (album.yearId !== args.yearId) {
				throw new Error(`Album ${rankingAlbumId} does not belong to this year`);
			}
		}

		for (const { rankingAlbumId, position } of args.positions) {
			await ctx.db.patch(rankingAlbumId, {
				position,
				updatedAt: now,
			});
		}
	},
});

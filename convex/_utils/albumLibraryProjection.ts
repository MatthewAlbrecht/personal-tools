import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	buildAlbumLibraryReleaseYearSortKey,
	buildAlbumLibrarySearchText,
	buildAlbumLibrarySortKey,
	getAlbumLibraryAlbumType,
	getAlbumLibraryRymStatus,
} from "./albumLibraryRows";

type AlbumLibraryTaxonomyTag = {
	key: string;
	label: string;
};

type AlbumLibraryTaxonomy = {
	primaryGenres: AlbumLibraryTaxonomyTag[];
	secondaryGenres: AlbumLibraryTaxonomyTag[];
	descriptors: AlbumLibraryTaxonomyTag[];
};

type AlbumLibraryProjection = Omit<
	Doc<"albumLibraryItems">,
	"_creationTime" | "_id"
>;

type AlbumLibraryDbCtx = QueryCtx | MutationCtx;

export async function buildAlbumLibraryProjectionForAlbum(
	ctx: AlbumLibraryDbCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<AlbumLibraryProjection | null> {
	const album = await ctx.db.get(args.albumId);
	if (!album) {
		return null;
	}

	const userAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();
	const latestRymLink = await loadLatestRymLinkForAlbum(ctx, args.albumId);
	const scrape = latestRymLink
		? await ctx.db.get(latestRymLink.scrapeId)
		: null;
	const taxonomy = latestRymLink
		? await loadRymTaxonomyForScrape(ctx, latestRymLink.scrapeId)
		: getEmptyAlbumLibraryTaxonomy();
	const robRankings = await loadRobRankingYearsForAlbum(ctx, args);

	const listenCount = userAlbum?.listenCount ?? 0;
	const releaseYear = parseAlbumReleaseYear(album.releaseDate);
	const updatedAt = Math.max(
		album.updatedAt,
		userAlbum?.lastListenedAt ?? 0,
		latestRymLink?.updatedAt ?? 0,
		scrape?.updatedAt ?? 0,
		robRankings.updatedAt ?? 0,
	);

	return {
		userId: args.userId,
		albumId: album._id,
		spotifyAlbumId: album.spotifyAlbumId,
		name: album.name,
		artistName: album.artistName,
		artistSortKey: buildAlbumLibrarySortKey(album.artistName),
		releaseYearSortKey: buildAlbumLibraryReleaseYearSortKey(releaseYear),
		albumSortKey: buildAlbumLibrarySortKey(album.name),
		imageUrl: album.imageUrl,
		releaseDate: album.releaseDate,
		releaseYear,
		totalTracks: album.totalTracks,
		totalDurationMs: album.totalDurationMs,
		albumType: getAlbumLibraryAlbumType(album.totalTracks),
		createdAt: album.createdAt,
		updatedAt,
		listenCount,
		firstListenedAt: userAlbum?.firstListenedAt,
		lastListenedAt: userAlbum?.lastListenedAt,
		rating: userAlbum?.rating,
		filterHasListened: listenCount > 0,
		rymStatus: getAlbumLibraryRymStatus(latestRymLink !== null),
		rymNotOnSite: album.rymNotOnSite === true ? true : undefined,
		rymScrapeId: latestRymLink?.scrapeId,
		rymLinkMethod: latestRymLink?.method,
		rymUrl: scrape?.rymUrl,
		rymLinkedAt: latestRymLink?.updatedAt,
		appearsInForLater: false,
		appearsInRobRankings: robRankings.years.length > 0,
		robRankingYears: robRankings.years,
		primaryGenres: taxonomy.primaryGenres,
		secondaryGenres: taxonomy.secondaryGenres,
		descriptors: taxonomy.descriptors,
		searchText: buildAlbumLibrarySearchText({
			name: album.name,
			artistName: album.artistName,
		}),
	};
}

export async function upsertAlbumLibraryProjection(
	ctx: MutationCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<void> {
	const projection = await buildAlbumLibraryProjectionForAlbum(ctx, args);
	const existing = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();

	if (!projection) {
		if (existing) {
			await ctx.db.delete(existing._id);
		}
		return;
	}

	if (existing) {
		await ctx.db.patch(existing._id, {
			...projection,
			forLater: existing.forLater,
			isActiveForLater: existing.isActiveForLater,
			appearsInForLater:
				existing.isActiveForLater ?? projection.appearsInForLater,
		});
		return;
	}

	await ctx.db.insert("albumLibraryItems", projection);
}

export async function refreshAlbumLibraryProjectionsForAlbum(
	ctx: MutationCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<void> {
	const existingRows = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();

	for (const row of existingRows) {
		await upsertAlbumLibraryProjection(ctx, {
			userId: row.userId,
			albumId,
		});
	}
}

export function buildAlbumLibraryRymPatchFields(args: {
	scrape: Doc<"rateYourMusicScrapes">;
	linkMethod: Doc<"rateYourMusicSpotifyAlbumLinks">["method"];
	linkedAt: number;
	taxonomy: AlbumLibraryTaxonomy;
	existingUpdatedAt: number;
}): Pick<
	Doc<"albumLibraryItems">,
	| "rymStatus"
	| "rymScrapeId"
	| "rymLinkMethod"
	| "rymUrl"
	| "rymLinkedAt"
	| "primaryGenres"
	| "secondaryGenres"
	| "descriptors"
	| "updatedAt"
> {
	return {
		rymStatus: getAlbumLibraryRymStatus(true),
		rymScrapeId: args.scrape._id,
		rymLinkMethod: args.linkMethod,
		rymUrl: args.scrape.rymUrl,
		rymLinkedAt: args.linkedAt,
		primaryGenres: args.taxonomy.primaryGenres,
		secondaryGenres: args.taxonomy.secondaryGenres,
		descriptors: args.taxonomy.descriptors,
		updatedAt: Math.max(
			args.existingUpdatedAt,
			args.linkedAt,
			args.scrape.updatedAt,
		),
	};
}

export async function patchAlbumLibraryRymFieldsForAlbum(
	ctx: MutationCtx,
	args: {
		albumId: Id<"spotifyAlbums">;
		scrape: Doc<"rateYourMusicScrapes">;
		linkMethod: Doc<"rateYourMusicSpotifyAlbumLinks">["method"];
		linkedAt: number;
	},
): Promise<void> {
	const taxonomy = await loadRymTaxonomyForScrape(ctx, args.scrape._id);
	const rows = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
		.collect();

	for (const row of rows) {
		await ctx.db.patch(
			row._id,
			buildAlbumLibraryRymPatchFields({
				scrape: args.scrape,
				linkMethod: args.linkMethod,
				linkedAt: args.linkedAt,
				taxonomy,
				existingUpdatedAt: row.updatedAt,
			}),
		);
	}
}

async function loadLatestRymLinkForAlbum(
	ctx: AlbumLibraryDbCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<Doc<"rateYourMusicSpotifyAlbumLinks"> | null> {
	const links = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();

	return [...links].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function loadRymTaxonomyForScrape(
	ctx: AlbumLibraryDbCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<AlbumLibraryTaxonomy> {
	const releaseGenres = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const primaryGenres: AlbumLibraryTaxonomyTag[] = [];
	const secondaryGenres: AlbumLibraryTaxonomyTag[] = [];

	for (const releaseGenre of releaseGenres) {
		const genre = await ctx.db.get(releaseGenre.genreId);
		if (!genre) continue;

		const tag = {
			key: genre.key,
			label: genre.label,
		};

		if (releaseGenre.role === "primary") {
			primaryGenres.push(tag);
		} else {
			secondaryGenres.push(tag);
		}
	}

	const releaseDescriptors = await ctx.db
		.query("rateYourMusicReleaseDescriptors")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	const descriptors: AlbumLibraryTaxonomyTag[] = [];

	for (const releaseDescriptor of releaseDescriptors) {
		const descriptor = await ctx.db.get(releaseDescriptor.descriptorId);
		if (!descriptor) continue;

		descriptors.push({
			key: descriptor.key,
			label: descriptor.label,
		});
	}

	return { primaryGenres, secondaryGenres, descriptors };
}

async function loadRobRankingYearsForAlbum(
	ctx: AlbumLibraryDbCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<{ years: number[]; updatedAt?: number }> {
	const robRankingAlbums = await ctx.db
		.query("robRankingAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.collect();

	const years: number[] = [];
	let updatedAt: number | undefined;

	for (const robRankingAlbum of robRankingAlbums) {
		const robRankingYear = await ctx.db.get(robRankingAlbum.yearId);
		if (!robRankingYear || robRankingYear.userId !== args.userId) continue;

		years.push(robRankingYear.year);
		updatedAt = Math.max(
			updatedAt ?? 0,
			robRankingYear.updatedAt,
			robRankingAlbum.updatedAt,
		);
	}

	years.sort((a, b) => b - a);
	return { years, updatedAt };
}

function parseAlbumReleaseYear(
	releaseDate: string | undefined,
): number | undefined {
	if (!releaseDate) return undefined;

	const year = Number.parseInt(releaseDate.slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
}

function getEmptyAlbumLibraryTaxonomy(): AlbumLibraryTaxonomy {
	return {
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
}

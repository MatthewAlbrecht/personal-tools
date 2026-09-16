import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
	type MutationCtx,
	type QueryCtx,
	internalMutation,
	mutation,
	query,
} from "./_generated/server";
import type { FolioEdition } from "./_utils/folioCatalogFields";
import {
	buildSearchText,
	catalogLaunchTime,
	inferEdition,
	makeTitleKey,
	parseLaunchTimeToMs,
	parsePublicationDateToMs,
	seasonFromTimestamp,
	undatedSeason,
} from "./_utils/folioCatalogFields";
import { requireAuth } from "./auth";

export const FOLIO_OWNER_USER_ID = "folio-owner";

const FOLIO_CATALOG_IMAGE_PREFIX =
	"https://www.foliosociety.com/static/media/catalog";

export const applyCatalogFields = internalMutation({
	args: {
		productId: v.number(),
		name: v.string(),
		authorName: v.optional(v.string()),
		launchTimeIso: v.optional(v.string()),
		publicationDateText: v.optional(v.string()),
		image: v.optional(v.string()),
		folioImagePath: v.optional(v.string()),
		isComingSoon: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const release = await ctx.db
			.query("folioSocietyReleases")
			.withIndex("by_external_id", (q) => q.eq("id", args.productId))
			.first();

		if (!release) {
			return null;
		}

		const launchTime = parseLaunchTimeToMs(args.launchTimeIso);
		const publicationDateTime = parsePublicationDateToMs(
			args.publicationDateText,
		);
		const catalogTime = catalogLaunchTime(launchTime, publicationDateTime);
		const hasLaunchOrPublication =
			launchTime !== undefined ||
			publicationDateTime !== undefined ||
			Boolean(args.publicationDateText?.trim());
		const edition = inferEdition(args.name, hasLaunchOrPublication);
		const isBundle = edition === "bundle";
		const titleKey = makeTitleKey(args.name, args.authorName);
		const searchText = buildSearchText(args.name, args.authorName);
		const season = resolveSeason(catalogTime);
		const heroImageUrl = await resolveHeroImageUrl(
			ctx,
			args.productId,
			args.folioImagePath,
			args.image,
		);
		const isComingSoon = args.isComingSoon ?? false;
		const isFamily = titleKey.includes("|");
		const soloLimited = edition === "limited";
		const soloSigned = edition === "signed";

		await ctx.db.patch(release._id, {
			catalogLaunchTime: catalogTime,
			isComingSoon,
			edition,
			isBundle,
			titleKey,
			searchText,
			seasonKey: season.seasonKey,
			seasonSortKey: season.seasonSortKey,
			familyHasLimited: soloLimited,
			familyHasSigned: soloSigned,
			...(launchTime !== undefined ? { launchTime } : {}),
			...(args.publicationDateText !== undefined
				? { publicationDateText: args.publicationDateText }
				: {}),
			...(publicationDateTime !== undefined ? { publicationDateTime } : {}),
			...(args.authorName !== undefined ? { authorName: args.authorName } : {}),
			...(heroImageUrl !== undefined ? { heroImageUrl } : {}),
		});

		if (!isFamily) {
			return null;
		}

		await patchFamilyFlags(ctx, titleKey, release._id, edition);
		return null;
	},
});

const editionValidator = v.union(
	v.literal("standard"),
	v.literal("limited"),
	v.literal("signed"),
	v.literal("bundle"),
);

const catalogCardValidator = v.object({
	titleKey: v.string(),
	productId: v.number(),
	name: v.string(),
	authorName: v.union(v.string(), v.null()),
	url: v.string(),
	price: v.union(v.number(), v.null()),
	catalogLaunchTime: v.number(),
	edition: editionValidator,
	isComingSoon: v.boolean(),
	heroImageUrl: v.union(v.string(), v.null()),
	familyHasLimited: v.boolean(),
	familyHasSigned: v.boolean(),
	owned: v.boolean(),
	want: v.boolean(),
});

const catalogSeasonValidator = v.object({
	seasonKey: v.string(),
	seasonSortKey: v.string(),
	label: v.string(),
	cards: v.array(catalogCardValidator),
});

export const listCatalogPage = query({
	args: {
		now: v.number(),
		cursor: v.union(v.null(), v.object({ beforeSeasonSortKey: v.string() })),
		pageSizeSeasons: v.optional(v.number()),
		search: v.optional(v.string()),
		owned: v.optional(v.boolean()),
		want: v.optional(v.boolean()),
		le: v.optional(v.boolean()),
		signed: v.optional(v.boolean()),
		thisYear: v.optional(v.boolean()),
		coming: v.optional(v.boolean()),
		bundles: v.optional(v.boolean()),
	},
	returns: v.object({
		seasons: v.array(catalogSeasonValidator),
		continueCursor: v.union(
			v.object({ beforeSeasonSortKey: v.string() }),
			v.null(),
		),
		isDone: v.boolean(),
		bookCount: v.number(),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const filters: CatalogFilters = {
			search: args.search,
			owned: args.owned === true,
			want: args.want === true,
			le: args.le === true,
			signed: args.signed === true,
			thisYear: args.thisYear === true,
			coming: args.coming === true,
			bundles: args.bundles === true,
		};
		const pageSize = clampPageSize(args.pageSizeSeasons);
		const before = args.cursor?.beforeSeasonSortKey;
		const loaded = await loadCatalogCandidates(ctx, args.now, filters, before);
		const filtered = loaded.releases.filter((release) =>
			matchesRemainingFilters(release, filters, args.now),
		);
		const ownershipByProduct = loaded.ownershipByProduct;
		const grouped = groupIntoSeasons(filtered, ownershipByProduct, filters);
		const paged = pageCompleteSeasons(
			grouped,
			before,
			pageSize,
			loaded.exhausted,
		);
		const visibleIds = paged.seasons.flatMap((season) =>
			season.cards.map((card) => card.productId),
		);
		const visibleOwnership = await loadOwnershipForProducts(
			ctx,
			visibleIds,
			ownershipByProduct,
		);
		const seasons = paged.seasons.map((season) => ({
			...season,
			cards: season.cards.map((card) => {
				const status = visibleOwnership.get(card.productId);
				return {
					...card,
					owned: status === "owned",
					want: status === "want",
				};
			}),
		}));
		const bookCount = seasons.reduce(
			(count, season) => count + season.cards.length,
			0,
		);
		return {
			seasons,
			continueCursor: paged.continueCursor,
			isDone: paged.isDone,
			bookCount,
		};
	},
});

export const getFamilyByTitleKey = query({
	args: {
		titleKey: v.string(),
	},
	returns: v.array(
		v.object({
			productId: v.number(),
			name: v.string(),
			edition: editionValidator,
			price: v.union(v.number(), v.null()),
			catalogLaunchTime: v.number(),
			url: v.string(),
			heroImageUrl: v.union(v.string(), v.null()),
			isComingSoon: v.boolean(),
			authorName: v.union(v.string(), v.null()),
		}),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const siblings = await ctx.db
			.query("folioSocietyReleases")
			.withIndex("by_titleKey", (q) => q.eq("titleKey", args.titleKey))
			.take(32);
		return siblings.map((release) => ({
			productId: release.id,
			name: release.name,
			edition: release.edition ?? "standard",
			price: release.price ?? null,
			catalogLaunchTime: release.catalogLaunchTime ?? 0,
			url: release.url,
			heroImageUrl: release.heroImageUrl ?? null,
			isComingSoon: release.isComingSoon === true,
			authorName: release.authorName ?? null,
		}));
	},
});

export const setOwnership = mutation({
	args: {
		productId: v.number(),
		status: v.union(v.literal("owned"), v.literal("want"), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const product = await ctx.db
			.query("folioSocietyReleases")
			.withIndex("by_external_id", (q) => q.eq("id", args.productId))
			.first();
		if (!product) {
			throw new Error("Unknown product");
		}

		const rows = await ctx.db
			.query("folioSocietyOwnership")
			.withIndex("by_user_product", (q) =>
				q.eq("userId", FOLIO_OWNER_USER_ID).eq("productId", args.productId),
			)
			.take(20);

		if (args.status === null) {
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
			return null;
		}

		const keep = rows[0];
		for (const extra of rows.slice(1)) {
			await ctx.db.delete(extra._id);
		}

		if (keep) {
			await ctx.db.patch(keep._id, {
				status: args.status,
				updatedAt: Date.now(),
			});
			return null;
		}

		await ctx.db.insert("folioSocietyOwnership", {
			userId: FOLIO_OWNER_USER_ID,
			productId: args.productId,
			status: args.status,
			updatedAt: Date.now(),
		});
		return null;
	},
});

function resolveSeason(catalogTime: number): {
	seasonKey: string;
	seasonSortKey: string;
} {
	if (catalogTime > 0) {
		return seasonFromTimestamp(catalogTime);
	}

	return undatedSeason();
}

function folioImageUrl(path: string | undefined): string | undefined {
	if (!path?.trim()) {
		return undefined;
	}

	if (path.startsWith("http://") || path.startsWith("https://")) {
		return path;
	}

	if (path.startsWith("/")) {
		return `${FOLIO_CATALOG_IMAGE_PREFIX}${path}`;
	}

	return undefined;
}

async function resolveHeroImageUrl(
	ctx: MutationCtx,
	productId: number,
	folioImagePath: string | undefined,
	image: string | undefined,
): Promise<string | undefined> {
	const images = await ctx.db
		.query("folioSocietyImages")
		.withIndex("by_productId", (q) => q.eq("productId", productId))
		.take(20);

	const hero = images.find((row) => row.imageType === "hero");
	if (hero?.blobUrl) {
		return hero.blobUrl;
	}

	return folioImageUrl(folioImagePath) ?? folioImageUrl(image);
}

async function patchFamilyFlags(
	ctx: MutationCtx,
	titleKey: string,
	currentId: Doc<"folioSocietyReleases">["_id"],
	currentEdition: FolioEdition,
): Promise<void> {
	const siblings = await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_titleKey", (q) => q.eq("titleKey", titleKey))
		.take(32);

	let familyHasLimited = false;
	let familyHasSigned = false;

	for (const sibling of siblings) {
		const edition =
			sibling._id === currentId ? currentEdition : sibling.edition;
		if (edition === "limited") {
			familyHasLimited = true;
		}
		if (edition === "signed") {
			familyHasSigned = true;
		}
	}

	if (currentEdition === "limited") {
		familyHasLimited = true;
	}
	if (currentEdition === "signed") {
		familyHasSigned = true;
	}

	for (const sibling of siblings) {
		await ctx.db.patch(sibling._id, {
			familyHasLimited,
			familyHasSigned,
		});
	}
}

type CatalogFilters = {
	search: string | undefined;
	owned: boolean;
	want: boolean;
	le: boolean;
	signed: boolean;
	thisYear: boolean;
	coming: boolean;
	bundles: boolean;
};

type ReleaseDoc = Doc<"folioSocietyReleases">;
type OwnershipStatus = "owned" | "want";
type OwnershipMap = Map<number, OwnershipStatus>;

type CatalogCard = {
	titleKey: string;
	productId: number;
	name: string;
	authorName: string | null;
	url: string;
	price: number | null;
	catalogLaunchTime: number;
	edition: FolioEdition;
	isComingSoon: boolean;
	heroImageUrl: string | null;
	familyHasLimited: boolean;
	familyHasSigned: boolean;
	owned: boolean;
	want: boolean;
};

type CatalogSeason = {
	seasonKey: string;
	seasonSortKey: string;
	label: string;
	cards: CatalogCard[];
};

const OWNERSHIP_CAP = 200;
const INDEX_BATCH = 80;
const SEASON_FILL_CAP = 200;
const COMING_CAP = 200;
const THIS_YEAR_CAP = 200;
const INDEX_LOOPS = 12;

function clampPageSize(pageSizeSeasons: number | undefined): number {
	if (pageSizeSeasons === undefined) {
		return 1;
	}
	return Math.min(3, Math.max(1, Math.floor(pageSizeSeasons)));
}

function seasonSortOf(release: ReleaseDoc): string {
	return release.seasonSortKey ?? "0000-00";
}

function seasonKeyOf(release: ReleaseDoc): string {
	return release.seasonKey ?? "undated";
}

function titleKeyOf(release: ReleaseDoc): string {
	return release.titleKey ?? `__id:${release.id}`;
}

function isBundleRow(release: ReleaseDoc): boolean {
	return release.isBundle === true;
}

export function seasonLabelFromKeys(
	seasonKey: string,
	seasonSortKey: string,
): string {
	if (seasonKey === "undated" || seasonSortKey === "0000-00") {
		return undatedSeason().label;
	}
	const december = seasonSortKey.match(/^(\d{4})-12$/);
	if (december) {
		return `Winter ${Number(december[1]) + 1}`;
	}
	const dash = seasonKey.lastIndexOf("-");
	if (dash <= 0) {
		return undatedSeason().label;
	}
	const year = seasonKey.slice(0, dash);
	const name = seasonKey.slice(dash + 1);
	if (!year || !name) {
		return undatedSeason().label;
	}
	if (name === "winter") {
		return `Winter ${year}`;
	}
	return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function unionById(rows: ReleaseDoc[]): ReleaseDoc[] {
	const seen = new Set<string>();
	const out: ReleaseDoc[] = [];
	for (const row of rows) {
		if (seen.has(row._id)) {
			continue;
		}
		seen.add(row._id);
		out.push(row);
	}
	return out;
}

function editionRank(edition: FolioEdition): number {
	if (edition === "limited") {
		return 0;
	}
	if (edition === "signed") {
		return 1;
	}
	if (edition === "standard") {
		return 2;
	}
	return 3;
}

function matchesRemainingFilters(
	release: ReleaseDoc,
	filters: CatalogFilters,
	now: number,
): boolean {
	if (release.isActive !== true) {
		return false;
	}
	if (!filters.bundles && isBundleRow(release)) {
		return false;
	}
	if (filters.le || filters.signed) {
		const edition = release.edition ?? "standard";
		const okLe = filters.le && edition === "limited";
		const okSigned = filters.signed && edition === "signed";
		if (!okLe && !okSigned) {
			return false;
		}
	}
	if (filters.coming) {
		const coming =
			release.isComingSoon === true || (release.catalogLaunchTime ?? 0) > now;
		if (!coming) {
			return false;
		}
	}
	if (filters.thisYear && !inThisYear(release.catalogLaunchTime, now)) {
		return false;
	}
	if (filters.search?.trim() && !matchesSearch(release, filters.search)) {
		return false;
	}
	return true;
}

function inThisYear(catalogTime: number | undefined, now: number): boolean {
	const t = catalogTime ?? 0;
	if (t <= 0) {
		return false;
	}
	return new Date(t).getUTCFullYear() === new Date(now).getUTCFullYear();
}

function matchesSearch(release: ReleaseDoc, search: string): boolean {
	const needle = search.trim().toLowerCase();
	if (!needle) {
		return true;
	}
	const hay =
		`${release.searchText ?? ""} ${release.name} ${release.authorName ?? ""}`.toLowerCase();
	return hay.includes(needle);
}

async function loadCatalogCandidates(
	ctx: QueryCtx,
	now: number,
	filters: CatalogFilters,
	beforeSeasonSortKey: string | undefined,
): Promise<{
	releases: ReleaseDoc[];
	ownershipByProduct: OwnershipMap | null;
	exhausted: boolean;
}> {
	if (filters.owned || filters.want) {
		return await loadOwnedWantCandidates(ctx, filters);
	}
	if (filters.search?.trim()) {
		return {
			releases: await loadSearchCandidates(ctx, filters),
			ownershipByProduct: null,
			exhausted: true,
		};
	}
	if (filters.le || filters.signed) {
		return await walkIndexedSeasons(
			ctx,
			filters,
			beforeSeasonSortKey,
			"edition",
		);
	}
	if (filters.coming) {
		return {
			releases: await loadComingCandidates(ctx, now, filters),
			ownershipByProduct: null,
			exhausted: true,
		};
	}
	if (filters.thisYear) {
		return {
			releases: await loadThisYearCandidates(ctx, now),
			ownershipByProduct: null,
			exhausted: true,
		};
	}
	return await walkIndexedSeasons(ctx, filters, beforeSeasonSortKey, "bundle");
}

async function loadOwnedWantCandidates(
	ctx: QueryCtx,
	filters: CatalogFilters,
): Promise<{
	releases: ReleaseDoc[];
	ownershipByProduct: OwnershipMap;
	exhausted: boolean;
}> {
	const statuses: OwnershipStatus[] = [];
	if (filters.owned) {
		statuses.push("owned");
	}
	if (filters.want) {
		statuses.push("want");
	}

	const ownershipByProduct: OwnershipMap = new Map();
	for (const status of statuses) {
		const rows = await ctx.db
			.query("folioSocietyOwnership")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", FOLIO_OWNER_USER_ID).eq("status", status),
			)
			.take(OWNERSHIP_CAP);
		for (const row of rows) {
			const existing = ownershipByProduct.get(row.productId);
			if (existing === "owned") {
				continue;
			}
			ownershipByProduct.set(row.productId, row.status);
		}
	}

	const releases: ReleaseDoc[] = [];
	for (const productId of ownershipByProduct.keys()) {
		const release = await ctx.db
			.query("folioSocietyReleases")
			.withIndex("by_external_id", (q) => q.eq("id", productId))
			.first();
		if (release) {
			releases.push(release);
		}
	}

	return { releases, ownershipByProduct, exhausted: true };
}

async function loadSearchCandidates(
	ctx: QueryCtx,
	filters: CatalogFilters,
): Promise<ReleaseDoc[]> {
	const search = filters.search?.trim() ?? "";
	const editionFilter =
		filters.le && !filters.signed
			? "limited"
			: filters.signed && !filters.le
				? "signed"
				: undefined;
	const bundleFilter = filters.bundles ? undefined : false;

	return await ctx.db
		.query("folioSocietyReleases")
		.withSearchIndex("search_title_author", (q) => {
			const searched = q.search("searchText", search).eq("isActive", true);
			const withEdition =
				editionFilter === undefined
					? searched
					: searched.eq("edition", editionFilter);
			if (bundleFilter === undefined) {
				return withEdition;
			}
			return withEdition.eq("isBundle", bundleFilter);
		})
		.take(64);
}

async function loadComingCandidates(
	ctx: QueryCtx,
	now: number,
	filters: CatalogFilters,
): Promise<ReleaseDoc[]> {
	const upcoming = await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_catalogLaunchTime", (q) =>
			q.eq("isActive", true).gt("catalogLaunchTime", now),
		)
		.take(COMING_CAP);

	const undatedFalse = await takeByBundleSeason(
		ctx,
		false,
		"0000-00",
		SEASON_FILL_CAP,
	);
	const undatedTrue = filters.bundles
		? await takeByBundleSeason(ctx, true, "0000-00", SEASON_FILL_CAP)
		: [];
	const undatedComing = [...undatedFalse, ...undatedTrue].filter(
		(row) => row.isComingSoon === true,
	);

	return unionById([...upcoming, ...undatedComing]);
}

async function loadThisYearCandidates(
	ctx: QueryCtx,
	now: number,
): Promise<ReleaseDoc[]> {
	const year = new Date(now).getUTCFullYear();
	return await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_catalogLaunchTime", (q) =>
			q
				.eq("isActive", true)
				.gte("catalogLaunchTime", Date.UTC(year, 0, 1))
				.lt("catalogLaunchTime", Date.UTC(year + 1, 0, 1)),
		)
		.take(THIS_YEAR_CAP);
}

async function takeByBundleRange(
	ctx: QueryCtx,
	isBundle: boolean,
	beforeSeasonSortKey: string | undefined,
	limit: number,
): Promise<ReleaseDoc[]> {
	return await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_isBundle_seasonSortKey", (q) => {
			const base = q.eq("isActive", true).eq("isBundle", isBundle);
			if (beforeSeasonSortKey) {
				return base.lt("seasonSortKey", beforeSeasonSortKey);
			}
			return base;
		})
		.order("desc")
		.take(limit);
}

async function takeByBundleSeason(
	ctx: QueryCtx,
	isBundle: boolean,
	seasonSortKey: string,
	limit: number,
): Promise<ReleaseDoc[]> {
	return await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_isBundle_seasonSortKey", (q) =>
			q
				.eq("isActive", true)
				.eq("isBundle", isBundle)
				.eq("seasonSortKey", seasonSortKey),
		)
		.take(limit);
}

async function takeByEditionRange(
	ctx: QueryCtx,
	edition: FolioEdition,
	beforeSeasonSortKey: string | undefined,
	limit: number,
): Promise<ReleaseDoc[]> {
	return await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_edition_seasonSortKey", (q) => {
			const base = q.eq("isActive", true).eq("edition", edition);
			if (beforeSeasonSortKey) {
				return base.lt("seasonSortKey", beforeSeasonSortKey);
			}
			return base;
		})
		.order("desc")
		.take(limit);
}

async function takeByEditionSeason(
	ctx: QueryCtx,
	edition: FolioEdition,
	seasonSortKey: string,
	limit: number,
): Promise<ReleaseDoc[]> {
	return await ctx.db
		.query("folioSocietyReleases")
		.withIndex("by_isActive_edition_seasonSortKey", (q) =>
			q
				.eq("isActive", true)
				.eq("edition", edition)
				.eq("seasonSortKey", seasonSortKey),
		)
		.take(limit);
}

async function fetchIndexBatch(
	ctx: QueryCtx,
	filters: CatalogFilters,
	beforeSeasonSortKey: string | undefined,
	mode: "bundle" | "edition",
	limit: number,
): Promise<ReleaseDoc[]> {
	if (mode === "edition") {
		const parts: ReleaseDoc[] = [];
		if (filters.le) {
			parts.push(
				...(await takeByEditionRange(
					ctx,
					"limited",
					beforeSeasonSortKey,
					limit,
				)),
			);
		}
		if (filters.signed) {
			parts.push(
				...(await takeByEditionRange(
					ctx,
					"signed",
					beforeSeasonSortKey,
					limit,
				)),
			);
		}
		return sortSeasonDesc(unionById(parts)).slice(0, limit);
	}

	const notBundles = await takeByBundleRange(
		ctx,
		false,
		beforeSeasonSortKey,
		limit,
	);
	if (!filters.bundles) {
		return notBundles;
	}
	const bundles = await takeByBundleRange(
		ctx,
		true,
		beforeSeasonSortKey,
		limit,
	);
	return sortSeasonDesc(unionById([...notBundles, ...bundles])).slice(0, limit);
}

async function fetchFullSeason(
	ctx: QueryCtx,
	filters: CatalogFilters,
	seasonSortKey: string,
	mode: "bundle" | "edition",
): Promise<ReleaseDoc[]> {
	if (mode === "edition") {
		const parts: ReleaseDoc[] = [];
		if (filters.le) {
			parts.push(
				...(await takeByEditionSeason(
					ctx,
					"limited",
					seasonSortKey,
					SEASON_FILL_CAP,
				)),
			);
		}
		if (filters.signed) {
			parts.push(
				...(await takeByEditionSeason(
					ctx,
					"signed",
					seasonSortKey,
					SEASON_FILL_CAP,
				)),
			);
		}
		return unionById(parts);
	}

	const notBundles = await takeByBundleSeason(
		ctx,
		false,
		seasonSortKey,
		SEASON_FILL_CAP,
	);
	if (!filters.bundles) {
		return notBundles;
	}
	const bundles = await takeByBundleSeason(
		ctx,
		true,
		seasonSortKey,
		SEASON_FILL_CAP,
	);
	return unionById([...notBundles, ...bundles]);
}

function sortSeasonDesc(rows: ReleaseDoc[]): ReleaseDoc[] {
	return [...rows].sort((a, b) => {
		const cmp = seasonSortOf(b).localeCompare(seasonSortOf(a));
		if (cmp !== 0) {
			return cmp;
		}
		return a.id - b.id;
	});
}

async function walkIndexedSeasons(
	ctx: QueryCtx,
	filters: CatalogFilters,
	beforeSeasonSortKey: string | undefined,
	mode: "bundle" | "edition",
): Promise<{
	releases: ReleaseDoc[];
	ownershipByProduct: null;
	exhausted: boolean;
}> {
	const collected: ReleaseDoc[] = [];
	let before = beforeSeasonSortKey;
	let exhausted = false;

	for (let i = 0; i < INDEX_LOOPS; i++) {
		const batch = await fetchIndexBatch(
			ctx,
			filters,
			before,
			mode,
			INDEX_BATCH,
		);
		if (batch.length === 0) {
			exhausted = true;
			break;
		}

		let docs = batch;
		if (batch.length === INDEX_BATCH) {
			const last = batch[batch.length - 1];
			if (!last) {
				exhausted = true;
				break;
			}
			const oldestKey = seasonSortOf(last);
			const fullSeason = await fetchFullSeason(ctx, filters, oldestKey, mode);
			docs = [
				...batch.filter((row) => seasonSortOf(row) !== oldestKey),
				...fullSeason,
			];
		} else {
			exhausted = true;
		}

		collected.push(...docs);
		const oldest = docs.reduce(
			(min, row) => {
				const key = seasonSortOf(row);
				return min === undefined || key < min ? key : min;
			},
			undefined as string | undefined,
		);
		before = oldest;
		if (exhausted) {
			break;
		}

		const distinctSeasons = new Set(collected.map(seasonSortOf));
		if (distinctSeasons.size >= 4) {
			break;
		}
	}

	return {
		releases: unionById(collected),
		ownershipByProduct: null,
		exhausted,
	};
}

function groupIntoSeasons(
	releases: ReleaseDoc[],
	ownershipByProduct: OwnershipMap | null,
	filters: CatalogFilters,
): CatalogSeason[] {
	const groups = new Map<string, ReleaseDoc[]>();
	for (const release of releases) {
		const key = `${titleKeyOf(release)}::${seasonKeyOf(release)}`;
		const list = groups.get(key);
		if (list) {
			list.push(release);
		} else {
			groups.set(key, [release]);
		}
	}

	const seasons = new Map<string, CatalogSeason>();
	for (const skus of groups.values()) {
		const visible = pickVisibleSku(skus, ownershipByProduct, filters);
		const sample = visible;
		const seasonKey = seasonKeyOf(sample);
		const seasonSortKey = seasonSortOf(sample);
		const card: CatalogCard = {
			titleKey: titleKeyOf(sample),
			productId: sample.id,
			name: sample.name,
			authorName: sample.authorName ?? null,
			url: sample.url,
			price: sample.price ?? null,
			catalogLaunchTime: sample.catalogLaunchTime ?? 0,
			edition: sample.edition ?? "standard",
			isComingSoon: sample.isComingSoon === true,
			heroImageUrl: sample.heroImageUrl ?? null,
			familyHasLimited: sample.familyHasLimited === true,
			familyHasSigned: sample.familyHasSigned === true,
			owned: false,
			want: false,
		};
		const existing = seasons.get(seasonSortKey);
		if (existing) {
			existing.cards.push(card);
		} else {
			seasons.set(seasonSortKey, {
				seasonKey,
				seasonSortKey,
				label: seasonLabelFromKeys(seasonKey, seasonSortKey),
				cards: [card],
			});
		}
	}

	return [...seasons.values()].sort((a, b) =>
		b.seasonSortKey.localeCompare(a.seasonSortKey),
	);
}

function pickVisibleSku(
	skus: ReleaseDoc[],
	ownershipByProduct: OwnershipMap | null,
	filters: CatalogFilters,
): ReleaseDoc {
	function byEdition(rows: ReleaseDoc[]): ReleaseDoc {
		const sorted = [...rows].sort((a, b) => {
			const rank =
				editionRank(a.edition ?? "standard") -
				editionRank(b.edition ?? "standard");
			if (rank !== 0) {
				return rank;
			}
			return a.id - b.id;
		});
		const first = sorted[0];
		if (!first) {
			throw new Error("empty sku group");
		}
		return first;
	}

	if (filters.owned && ownershipByProduct) {
		const owned = skus.filter(
			(sku) => ownershipByProduct.get(sku.id) === "owned",
		);
		if (owned.length > 0) {
			return byEdition(owned);
		}
		if (filters.want) {
			const wanted = skus.filter(
				(sku) => ownershipByProduct.get(sku.id) === "want",
			);
			if (wanted.length > 0) {
				return byEdition(wanted);
			}
		}
	} else if (filters.want && ownershipByProduct) {
		const wanted = skus.filter(
			(sku) => ownershipByProduct.get(sku.id) === "want",
		);
		if (wanted.length > 0) {
			return byEdition(wanted);
		}
	}

	return byEdition(skus);
}

function pageCompleteSeasons(
	seasons: CatalogSeason[],
	beforeSeasonSortKey: string | undefined,
	pageSize: number,
	exhausted: boolean,
): {
	seasons: CatalogSeason[];
	continueCursor: { beforeSeasonSortKey: string } | null;
	isDone: boolean;
} {
	const eligible = seasons.filter((season) => {
		if (!beforeSeasonSortKey) {
			return true;
		}
		return season.seasonSortKey < beforeSeasonSortKey;
	});
	const page = eligible.slice(0, pageSize);
	const oldest = page[page.length - 1];
	const remaining = eligible.length > page.length;
	const isDone = !remaining && exhausted;
	return {
		seasons: page,
		continueCursor:
			oldest && !isDone ? { beforeSeasonSortKey: oldest.seasonSortKey } : null,
		isDone,
	};
}

async function loadOwnershipForProducts(
	ctx: QueryCtx,
	productIds: number[],
	known: OwnershipMap | null,
): Promise<OwnershipMap> {
	const map: OwnershipMap = new Map(known ?? []);
	for (const productId of productIds) {
		if (map.has(productId)) {
			continue;
		}
		const row = await ctx.db
			.query("folioSocietyOwnership")
			.withIndex("by_user_product", (q) =>
				q.eq("userId", FOLIO_OWNER_USER_ID).eq("productId", productId),
			)
			.first();
		if (row) {
			map.set(productId, row.status);
		}
	}
	return map;
}

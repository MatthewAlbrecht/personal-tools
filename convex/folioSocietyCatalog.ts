import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, internalMutation } from "./_generated/server";
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

// TCGplayer product pages captured by the extension. A page is one Printing's
// product, so its Listings and sales are matched by product id, without AI.
import type { Infer } from "convex/values";
import { saleTime } from "../../../src/lib/yugioh/deals";
import { normalizeSetCode } from "../../../src/lib/yugioh/deck";
import {
	checkTcgplayerProductUrl,
	rarityNamesAgree,
	readTcgplayerCondition,
	tcgplayerCardName,
} from "../../../src/lib/yugioh/tcgplayer";
import {
	type TitleRead,
	setCodeKey,
} from "../../../src/lib/yugioh/title-reading";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	type CapturedEbayListing,
	MAX_LISTINGS_PER_CAPTURE,
	observationChanged,
	observe,
} from "./listings";
import { queuePushCheck } from "./pushes";
import { savePastedLink } from "./tcgplayer";
import type {
	yugiohCapturedTcgplayerProductValidator,
	yugiohTcgplayerDetailsValidator,
} from "./validators";

export type CapturedTcgplayerProduct = Infer<
	typeof yugiohCapturedTcgplayerProductValidator
>;
type TcgplayerDetails = Infer<typeof yugiohTcgplayerDetailsValidator>;

/**
 * TCGplayer is a US marketplace, so its sellers pay no import fees.
 * **(assumption)**: the product page doesn't show a seller's country.
 */
export const TCGPLAYER_SELLER_LOCATION = "United States";

export type TcgplayerIngestReport = {
	/** The Printing the product page is for; null when none of mine is. */
	printing: { cardName: string; setCode: string; rarity: string } | null;
	/** Current Listings and latest sales on the page. */
	listings: number;
	sales: number;
	/** Listings and sales seen for the first time. */
	created: number;
	/** Listings and sales already known, updated in place. */
	updated: number;
	/** Whether this capture linked the Printing to the page. */
	linked: boolean;
	/** Why nothing was stored, as a sentence to show; null when it was. */
	reason: string | null;
};

/** More Printings than this sharing one set code aren't looked at. */
const MAX_PRINTINGS_PER_SET_CODE = 50;

/**
 * Stores one TCGplayer product page under the Printing with that product id.
 * Listings are upserted by TCGplayer's listing id; sales, which have no id,
 * by what they say (date, condition, price, shipping, quantity) plus how many
 * identical ones came before them on the page. Ones with photos carry the
 * seller's own title, which may be another card, so they're unsure until I
 * match them. A product none of my Printings has is reported and not stored.
 */
export async function ingestTcgplayerProduct(
	ctx: MutationCtx,
	product: CapturedTcgplayerProduct,
	now: number,
): Promise<TcgplayerIngestReport> {
	if (
		product.listings.length + product.sales.length >
		MAX_LISTINGS_PER_CAPTURE
	) {
		throw new Error(
			`A capture can carry at most ${MAX_LISTINGS_PER_CAPTURE} Listings and sales`,
		);
	}
	const report: TcgplayerIngestReport = {
		printing: null,
		listings: product.listings.length,
		sales: product.sales.length,
		created: 0,
		updated: 0,
		linked: false,
		reason: null,
	};
	let printing = await ctx.db
		.query("yugiohPrintings")
		.withIndex("by_tcgplayerProductId", (q) =>
			q.eq("tcgplayerProductId", product.productId),
		)
		.first();
	if (!printing) {
		const found = await linkPageToPrinting(ctx, product);
		if (typeof found === "string") return { ...report, reason: found };
		printing = found;
		report.linked = true;
	}
	report.printing = {
		cardName: printing.cardName,
		setCode: printing.setCode,
		rarity: printing.rarity,
	};

	// The first capture of a product page finds Listings that were already
	// there: they aren't new deals, so only later captures ask for pushes.
	const capturedBefore =
		(await ctx.db
			.query("yugiohListings")
			.withIndex("by_matchedPrintingId_and_marketplace_and_saleAt", (q) =>
				q.eq("matchedPrintingId", printing._id).eq("marketplace", "tcgplayer"),
			)
			.first()) !== null;

	const url = printing.tcgplayerProductUrl ?? product.url;
	const rows = new Map<string, Row>();
	for (const listing of product.listings) {
		rows.set(`listing:${listing.listingId}`, {
			customTitle: listing.customTitle,
			captured: {
				...baseFields(printing, url, listing.condition, listing.customTitle),
				price: listing.price,
				shipping: listing.shipping,
				sold: false,
				soldDate: null,
			},
			details: {
				seller: listing.seller,
				condition: listing.condition,
				quantity: listing.quantity,
			},
		});
	}
	const seen = new Map<string, number>();
	for (const sale of product.sales) {
		const what = [
			sale.soldDate,
			sale.condition.toLowerCase(),
			sale.price,
			sale.shipping ?? "?",
			sale.quantity,
			sale.customTitle ?? "",
		].join(":");
		const repeat = seen.get(what) ?? 0;
		seen.set(what, repeat + 1);
		rows.set(`sale:${what}#${repeat}`, {
			customTitle: sale.customTitle,
			captured: {
				...baseFields(printing, url, sale.condition, sale.customTitle),
				price: sale.price,
				shipping: sale.shipping,
				sold: true,
				soldDate: sale.soldDate,
			},
			details: {
				seller: null,
				condition: sale.condition,
				quantity: sale.quantity,
			},
		});
	}

	for (const [itemId, { captured, details, customTitle }] of rows) {
		const existing = await ctx.db
			.query("yugiohListings")
			.withIndex("by_marketplace_and_itemId", (q) =>
				q.eq("marketplace", "tcgplayer").eq("itemId", itemId),
			)
			.unique();
		const fields = {
			...captured,
			itemId,
			tcgplayer: details,
			titleRead: pageRead(printing, details.condition),
		};
		if (!existing) {
			const listingId = await ctx.db.insert("yugiohListings", {
				marketplace: "tcgplayer",
				...fields,
				firstSeenAt: now,
				lastSeenAt: now,
				titleReadStatus: "read",
				setCodeKey: setCodeKey(printing.setCode),
				...pageMatch(printing, customTitle),
				matchOverridden: false,
				saleAt: saleTime(fields, now),
				capturedUsdPerUnit: 1,
			});
			await observe(ctx, listingId, fields, now);
			if (capturedBefore && !fields.sold) {
				await queuePushCheck(ctx, listingId);
			}
			report.created++;
			continue;
		}
		await ctx.db.patch("yugiohListings", existing._id, {
			...fields,
			lastSeenAt: now,
			saleAt: saleTime(fields, existing.saleAt ?? now),
			// Photos added or removed since: the match follows, unless I set it.
			...(existing.matchOverridden ? {} : pageMatch(printing, customTitle)),
		});
		if (observationChanged(existing, { ...existing, ...fields })) {
			await observe(ctx, existing._id, fields, now);
		}
		report.updated++;
	}
	// The page lists Listings cheapest first, by price + shipping. When it
	// starts from the cheapest, an unseen Listing no pricier than the dearest
	// one it showed is gone; a pricier one may just be on a later page.
	if (product.listingsFromCheapest) {
		const landed = product.listings.map((l) => l.price + (l.shipping ?? 0));
		await ctx.db.patch("yugiohPrintings", printing._id, {
			tcgplayerListingsSeenAt: now,
			tcgplayerListingsSeenUpTo:
				landed.length === 0 ? null : Math.max(...landed),
		});
	}
	return report;
}

/**
 * A product page no Printing is linked to: its own set code and rarity say
 * which Printing it is. The one matching Printing without a link is linked,
 * after the same checks as a pasted URL (the URL fits the Card and rarity;
 * the page's details have the Printing's set code and rarity). Otherwise,
 * says why not.
 */
async function linkPageToPrinting(
	ctx: MutationCtx,
	product: CapturedTcgplayerProduct,
): Promise<Doc<"yugiohPrintings"> | string> {
	const details = product.details ?? null;
	if (!details) {
		return "This page's set code and rarity hadn't loaded, so it can't be matched to a Printing. Run again once the page has loaded.";
	}
	const setCode = normalizeSetCode(details.setCode);
	const matches = (
		await ctx.db
			.query("yugiohPrintings")
			.withIndex("by_setCode_and_rarity", (q) => q.eq("setCode", setCode))
			.take(MAX_PRINTINGS_PER_SET_CODE)
	).filter((printing) => rarityNamesAgree(printing.rarity, details.rarity));
	if (matches.length === 0) {
		const cardName = tcgplayerCardName(details.productName, details.rarity);
		return `${cardName} ${setCode} ${details.rarity} isn't in a Deck yet. Add it in the tracker first.`;
	}
	const [only] = matches;
	if (matches.length === 1 && only && !isLinked(only)) {
		const link = checkTcgplayerProductUrl(product.url, only);
		if (!link || link.productId !== product.productId) {
			return `This page is ${setCode} ${details.rarity}, but its URL doesn't match ${only.cardName}, so it wasn't linked.`;
		}
		await savePastedLink(ctx, only._id, link);
		return (await ctx.db.get("yugiohPrintings", only._id)) ?? only;
	}
	const names = matches.map(
		(printing) =>
			`${printing.cardName} ${printing.setCode} ${printing.rarity}${
				isLinked(printing) ? " (already linked to another TCGplayer page)" : ""
			}`,
	);
	return `This page could be ${orList(names)}. Paste this page's URL on the right Printing in the tracker, then run again.`;
}

function isLinked(printing: Doc<"yugiohPrintings">): boolean {
	return (
		printing.tcgplayerProductId != null || printing.tcgplayerProductUrl != null
	);
}

/** "A", "A or B", "A, B or C". */
function orList(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

type Row = {
	captured: Omit<CapturedEbayListing, "itemId">;
	details: TcgplayerDetails;
	customTitle: string | null;
};

/**
 * The fields every TCGplayer Listing and sale of a Printing shares. The title
 * is the seller's own, on one with photos, else the condition (first, since
 * rows already name the Card) and the Printing.
 */
function baseFields(
	printing: Doc<"yugiohPrintings">,
	url: string,
	condition: string,
	customTitle: string | null,
): Omit<
	CapturedEbayListing,
	"itemId" | "price" | "shipping" | "sold" | "soldDate"
> {
	return {
		url,
		title:
			customTitle ??
			`${condition} · ${printing.cardName} ${printing.setCode} ${printing.rarity}`,
		imageUrl: printing.tcgplayerImageUrl ?? null,
		currency: "USD",
		listingType: "buyItNow",
		bids: null,
		endsAt: null,
		listedAt: null,
		sellerLocation: TCGPLAYER_SELLER_LOCATION,
	};
}

/**
 * The page's own Printing, unless the seller's title (on one with photos)
 * says something else may be for sale: then it's unsure.
 */
function pageMatch(
	printing: Doc<"yugiohPrintings">,
	customTitle: string | null,
): {
	matchStatus: "match" | "unsure";
	matchedPrintingId: Id<"yugiohPrintings"> | null;
} {
	return customTitle === null
		? { matchStatus: "match", matchedPrintingId: printing._id }
		: { matchStatus: "unsure", matchedPrintingId: null };
}

/**
 * What a TCGplayer page states, in the shape of a title read, so the
 * Qualifying rule judges it like any Listing: the Printing's set code and
 * rarity, TCGplayer's condition and language, one raw Copy.
 */
function pageRead(
	printing: Doc<"yugiohPrintings">,
	condition: string,
): TitleRead {
	const read = readTcgplayerCondition(condition);
	return {
		setCode: printing.setCode,
		rarity: printing.rarity,
		condition: read.condition,
		copies: 1,
		language: read.language,
		graded: false,
		gradingCompany: null,
		grade: null,
	};
}

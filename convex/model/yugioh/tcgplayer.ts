import type { Infer } from "convex/values";
import {
	type TcgplayerProduct,
	type TcgplayerProductLink,
	checkTcgplayerProductUrl,
	rarityNamesAgree,
	tcgplayerImageUrl,
	tcgplayerSearchUrl,
} from "../../../src/lib/yugioh/tcgplayer";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { TcgplayerPick } from "./tcgplayerPicker";
import type { yugiohTcgplayerStatusValidator } from "./validators";

/** Below this, the AI's pick is left for the user to paste instead. */
export const MIN_PICK_PROBABILITY = 0.6;

export type TcgplayerStatus = Infer<typeof yugiohTcgplayerStatusValidator>;

export type TcgplayerView = {
	status: TcgplayerStatus;
	productUrl: string | null;
	imageUrl: string | null;
	/** Always there, for the fallback link. */
	searchUrl: string;
};

export function tcgplayerView(printing: Doc<"yugiohPrintings">): TcgplayerView {
	return {
		status: printing.tcgplayerStatus ?? "needsPaste",
		productUrl: printing.tcgplayerProductUrl ?? null,
		imageUrl: printing.tcgplayerImageUrl ?? null,
		searchUrl: tcgplayerSearchUrl(printing.setCode),
	};
}

export type LookupPrinting = {
	cardName: string;
	setCode: string;
	rarity: string;
};

/** Whether TCGplayer's own data says a product is this Printing. */
export function productIsPrinting(
	product: TcgplayerProduct,
	printing: LookupPrinting,
): boolean {
	return (
		product.setCode === printing.setCode &&
		rarityNamesAgree(product.rarityName, printing.rarity)
	);
}

/**
 * Turns the AI's pick into a product link, or null. The pick must be sure
 * enough and have the Printing's set code and rarity.
 */
export function acceptPick(
	printing: LookupPrinting,
	products: readonly TcgplayerProduct[],
	pick: TcgplayerPick,
): TcgplayerProductLink | null {
	if (pick.productId === null || pick.probability < MIN_PICK_PROBABILITY) {
		return null;
	}
	const product = products.find((p) => p.productId === pick.productId);
	if (!product) return null;
	return checkPastedUrl(product.productUrl, product, printing);
}

/**
 * A product URL checked against TCGplayer's details for that product: the
 * product is this Printing when its set code and rarity are the Printing's.
 * The URL need only be TCGplayer's page for that product id; neither its slug
 * nor TCGplayer's spelling of the Card's name is checked ("D.D. Crow" is
 * `dd-crow`, "Brionac" is "Brionac, Dragon of the Ice Barrier"). Returns the
 * URL without its query string, or null.
 */
export function checkPastedUrl(
	url: string,
	product: TcgplayerProduct | null,
	printing: LookupPrinting,
): TcgplayerProductLink | null {
	if (!product || !productIsPrinting(product, printing)) return null;
	return checkTcgplayerProductUrl(url, product.productId);
}

/** Saves a lookup's outcome, unless the user pasted a URL in the meantime. */
export async function recordLookup(
	ctx: MutationCtx,
	printingId: Id<"yugiohPrintings">,
	link: TcgplayerProductLink | null,
): Promise<void> {
	const printing = await ctx.db.get("yugiohPrintings", printingId);
	if (!printing || printing.tcgplayerStatus !== "searching") return;
	await ctx.db.patch("yugiohPrintings", printingId, linkFields(link));
}

/** Saves a product link the user pasted (already checked by the caller). */
export async function savePastedLink(
	ctx: MutationCtx,
	printingId: Id<"yugiohPrintings">,
	link: TcgplayerProductLink,
): Promise<void> {
	const printing = await ctx.db.get("yugiohPrintings", printingId);
	if (!printing) return;
	await ctx.db.patch("yugiohPrintings", printingId, linkFields(link));
}

function linkFields(link: TcgplayerProductLink | null): {
	tcgplayerStatus: TcgplayerStatus;
	tcgplayerProductUrl: string | null;
	tcgplayerImageUrl: string | null;
	tcgplayerProductId: number | null;
} {
	if (!link) {
		return {
			tcgplayerStatus: "needsPaste",
			tcgplayerProductUrl: null,
			tcgplayerImageUrl: null,
			tcgplayerProductId: null,
		};
	}
	return {
		tcgplayerStatus: "found",
		tcgplayerProductUrl: link.productUrl,
		tcgplayerImageUrl: tcgplayerImageUrl(link.productId),
		tcgplayerProductId: link.productId,
	};
}

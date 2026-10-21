import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
	REJECTED_PRODUCT_URL,
	type TcgplayerProduct,
	type TcgplayerProductLink,
	checkTcgplayerProductUrl,
	tcgplayerProductIdOf,
} from "../../src/lib/yugioh/tcgplayer";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { requireAuth } from "../auth";
import * as Tcgplayer from "../model/yugioh/tcgplayer";
import { pickTcgplayerProduct } from "../model/yugioh/tcgplayerPicker";
import {
	fetchTcgplayerProduct,
	searchTcgplayerProducts,
} from "../model/yugioh/tcgplayerSearch";

const linkValidator = v.object({
	productId: v.number(),
	productUrl: v.string(),
});

const lookupPrintingValidator = v.object({
	cardName: v.string(),
	setCode: v.string(),
	rarity: v.string(),
});

/**
 * Finds a new Printing's TCGplayer product page. Scheduled once when the
 * Printing is first saved (never on a timer). Anything that fails leaves the
 * Printing asking for a pasted URL.
 */
export const lookUpProduct = internalAction({
	args: { printingId: v.id("yugiohPrintings") },
	returns: v.null(),
	handler: async (ctx, { printingId }) => {
		const printing = await ctx.runQuery(internal.yugioh.tcgplayer.getPrinting, {
			printingId,
			onlyWhileSearching: true,
		});
		if (!printing) return null;
		let link: TcgplayerProductLink | null = null;
		try {
			const products = (await searchTcgplayerProducts(printing.setCode)).filter(
				(product) => product.setCode === printing.setCode,
			);
			if (products.length > 0) {
				const pick = await pickTcgplayerProduct(printing, products);
				link = Tcgplayer.acceptPick(printing, products, pick);
			}
		} catch (error) {
			console.error(
				`TCGplayer lookup failed for ${printing.setCode} ${printing.rarity}`,
				error,
			);
		}
		await ctx.runMutation(internal.yugioh.tcgplayer.recordLookup, {
			printingId,
			link,
		});
		return null;
	},
});

export const getPrinting = internalQuery({
	args: {
		printingId: v.id("yugiohPrintings"),
		onlyWhileSearching: v.boolean(),
	},
	returns: v.union(lookupPrintingValidator, v.null()),
	handler: async (ctx, { printingId, onlyWhileSearching }) => {
		const printing = await ctx.db.get("yugiohPrintings", printingId);
		if (!printing) return null;
		if (onlyWhileSearching && printing.tcgplayerStatus !== "searching") {
			return null;
		}
		return {
			cardName: printing.cardName,
			setCode: printing.setCode,
			rarity: printing.rarity,
		};
	},
});

export const recordLookup = internalMutation({
	args: {
		printingId: v.id("yugiohPrintings"),
		link: v.union(linkValidator, v.null()),
	},
	returns: v.null(),
	handler: async (ctx, { printingId, link }) => {
		await Tcgplayer.recordLookup(ctx, printingId, link);
		return null;
	},
});

export const savePastedLink = internalMutation({
	args: { printingId: v.id("yugiohPrintings"), link: linkValidator },
	returns: v.null(),
	handler: async (ctx, { printingId, link }) => {
		await Tcgplayer.savePastedLink(ctx, printingId, link);
		return null;
	},
});

/**
 * Saves a pasted TCGplayer product URL. It must pass the same pattern check
 * as a looked-up one; when TCGplayer answers, its product must also have the
 * Printing's set code and rarity. If TCGplayer can't be reached, the pattern
 * check alone decides.
 */
export const setProductUrl = action({
	args: { printingId: v.id("yugiohPrintings"), url: v.string() },
	returns: v.null(),
	handler: async (ctx, { printingId, url }) => {
		requireAuth(ctx);
		const printing = await ctx.runQuery(internal.yugioh.tcgplayer.getPrinting, {
			printingId,
			onlyWhileSearching: false,
		});
		if (!printing) throw new ConvexError("This Printing doesn't exist.");
		const link = checkTcgplayerProductUrl(url, printing);
		if (!link) throw new ConvexError(REJECTED_PRODUCT_URL);
		const product = await productDetails(printingId, link.productId);
		if (product !== undefined) {
			if (product === null || !Tcgplayer.productIsPrinting(product, printing)) {
				throw new ConvexError(REJECTED_PRODUCT_URL);
			}
		}
		await ctx.runMutation(internal.yugioh.tcgplayer.savePastedLink, {
			printingId,
			link,
		});
		return null;
	},
});

/** TCGplayer's product, null if there's none, undefined if unreachable. */
async function productDetails(
	printingId: Id<"yugiohPrintings">,
	productId: number,
): Promise<TcgplayerProduct | null | undefined> {
	try {
		return await fetchTcgplayerProduct(productId);
	} catch (error) {
		console.error(
			`TCGplayer details failed for product ${productId} (Printing ${printingId})`,
			error,
		);
		return undefined;
	}
}

/**
 * One-off: fills `tcgplayerProductId` on Printings whose product URL was
 * saved before TCGplayer capture, a page at a time, so captures of their
 * product pages find them. Run until `isDone`, passing back `cursor`:
 * `npx convex run yugioh/tcgplayer:backfillTcgplayerProductIds '{"paginationOpts":{"numItems":200,"cursor":null}}'`.
 */
export const backfillTcgplayerProductIds = internalMutation({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		updated: v.number(),
		isDone: v.boolean(),
		cursor: v.string(),
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("yugiohPrintings")
			.paginate(args.paginationOpts);
		let updated = 0;
		for (const printing of page.page) {
			if (printing.tcgplayerProductId != null) continue;
			const url = printing.tcgplayerProductUrl;
			const productId = url ? tcgplayerProductIdOf(url) : null;
			if (productId === null) continue;
			await ctx.db.patch("yugiohPrintings", printing._id, {
				tcgplayerProductId: productId,
			});
			updated++;
		}
		return { updated, isDone: page.isDone, cursor: page.continueCursor };
	},
});

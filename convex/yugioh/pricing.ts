import { v } from "convex/values";
import { DEFAULT_IMPORT_FEE_RATES } from "../../src/lib/yugioh/pricing";
import { internal } from "../_generated/api";
import {
	internalAction,
	internalMutation,
	mutation,
	query,
} from "../_generated/server";
import { requireAuth } from "../auth";
import { fetchUsdRates } from "../model/yugioh/exchangeRateSource";
import * as PricingModel from "../model/yugioh/pricing";
import { yugiohExchangeRateValidator } from "../model/yugioh/validators";

/** The import fee table and how fresh the exchange rates are, for Settings. */
export const getPricingSettings = query({
	args: {},
	returns: v.object({
		importFeeRates: v.array(
			v.object({ country: v.string(), percent: v.number() }),
		),
		defaultImportFeePercent: v.number(),
		exchangeRates: v.union(
			v.object({
				fetchedAt: v.number(),
				source: v.string(),
				currencies: v.number(),
			}),
			v.null(),
		),
	}),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await PricingModel.readPricingSettings(ctx);
	},
});

/** Sets a seller country's import fee rate (0-100%), adding it if it's new. */
export const setImportFeeRate = mutation({
	args: { country: v.string(), percent: v.number() },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await PricingModel.setImportFeeRate(ctx, args.country, args.percent);
		return null;
	},
});

/**
 * Fetches today's exchange rates and stores them. Run daily by the cron in
 * `convex/crons.ts`. If the source fails, yesterday's rates stay in use.
 */
export const refreshExchangeRates = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		let fetched: Awaited<ReturnType<typeof fetchUsdRates>>;
		try {
			fetched = await fetchUsdRates();
		} catch (error) {
			console.error("Couldn't refresh exchange rates", error);
			return null;
		}
		await ctx.runMutation(internal.yugioh.pricing.saveExchangeRates, {
			source: fetched.source,
			rates: fetched.rates,
		});
		return null;
	},
});

export const saveExchangeRates = internalMutation({
	args: { source: v.string(), rates: v.array(yugiohExchangeRateValidator) },
	returns: v.null(),
	handler: async (ctx, args) => {
		await PricingModel.saveExchangeRates(
			ctx,
			args.source,
			args.rates,
			Date.now(),
		);
		return null;
	},
});

/**
 * One-off: fills the import fee table with the researched defaults
 * (`docs/yugioh/references/exchange-rates-and-import-fees.md`). Countries
 * already in it keep their rate, so it's safe to re-run:
 * `npx convex run yugioh/pricing:seedImportFeeRates '{}'`.
 */
export const seedImportFeeRates = internalMutation({
	args: {},
	returns: v.object({ added: v.number() }),
	handler: async (ctx) => {
		return {
			added: await PricingModel.seedImportFeeRates(
				ctx,
				DEFAULT_IMPORT_FEE_RATES,
			),
		};
	},
});

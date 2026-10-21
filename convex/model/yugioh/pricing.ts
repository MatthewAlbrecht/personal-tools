// Exchange rates and import fees: what Per-copy prices are computed with.
import { ConvexError } from "convex/values";
import {
	DEFAULT_IMPORT_FEE_PERCENT,
	type ExchangeRate,
	HOME_COUNTRY,
	type ImportFeeRate,
	MAX_COUNTRY_LENGTH,
	type Pricing,
	cleanCountry,
	countryKey,
	isHomeCountry,
	pricingFrom,
} from "../../../src/lib/yugioh/pricing";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/** More than every ISO currency, so a read never misses one. */
const MAX_EXCHANGE_RATES = 400;
/** More than every country. */
const MAX_IMPORT_FEE_RATES = 300;

/** The stored rates, read once per query and shared by every Listing in it. */
export async function loadPricing(ctx: QueryCtx): Promise<Pricing> {
	const exchangeRates = await ctx.db
		.query("yugiohExchangeRates")
		.take(MAX_EXCHANGE_RATES);
	const importFeeRates = await ctx.db
		.query("yugiohImportFeeRates")
		.take(MAX_IMPORT_FEE_RATES);
	return pricingFrom(exchangeRates, importFeeRates);
}

/**
 * Stores the daily refresh: each currency's rate is overwritten in place, so
 * one row per currency is kept. Currencies the source dropped keep their last
 * rate.
 */
export async function saveExchangeRates(
	ctx: MutationCtx,
	source: string,
	rates: ExchangeRate[],
	fetchedAt: number,
): Promise<void> {
	if (rates.length > MAX_EXCHANGE_RATES) {
		throw new Error(`At most ${MAX_EXCHANGE_RATES} exchange rates`);
	}
	for (const rate of rates) {
		const currency = rate.currency.toUpperCase();
		if (!(rate.usdPerUnit > 0) || !Number.isFinite(rate.usdPerUnit)) continue;
		const existing = await ctx.db
			.query("yugiohExchangeRates")
			.withIndex("by_currency", (q) => q.eq("currency", currency))
			.unique();
		const row = { currency, usdPerUnit: rate.usdPerUnit, fetchedAt, source };
		if (existing) {
			await ctx.db.patch("yugiohExchangeRates", existing._id, row);
		} else {
			await ctx.db.insert("yugiohExchangeRates", row);
		}
	}
}

/**
 * Sets one seller country's import fee rate, adding the country if it's new.
 * My own country always pays none, so it can't be set.
 */
export async function setImportFeeRate(
	ctx: MutationCtx,
	country: string,
	percent: number,
): Promise<void> {
	const name = cleanCountry(country);
	if (name === "") throw new ConvexError("Enter a country.");
	if (name.length > MAX_COUNTRY_LENGTH) {
		throw new ConvexError("That country name is too long.");
	}
	if (isHomeCountry(name)) {
		throw new ConvexError(`${HOME_COUNTRY} Listings pay no import fees.`);
	}
	if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
		throw new ConvexError("Enter a rate from 0 to 100%.");
	}
	const key = countryKey(name);
	const existing = await ctx.db
		.query("yugiohImportFeeRates")
		.withIndex("by_countryKey", (q) => q.eq("countryKey", key))
		.unique();
	if (existing) {
		await ctx.db.patch("yugiohImportFeeRates", existing._id, { percent });
	} else {
		const count = (
			await ctx.db.query("yugiohImportFeeRates").take(MAX_IMPORT_FEE_RATES)
		).length;
		if (count >= MAX_IMPORT_FEE_RATES) {
			throw new ConvexError("The import fee table is full.");
		}
		await ctx.db.insert("yugiohImportFeeRates", {
			country: name,
			countryKey: key,
			percent,
		});
	}
}

/**
 * Adds the researched default rates for countries the table doesn't have yet.
 * Rates already there (including my edits) are left alone, so it's safe to
 * re-run. Returns how many it added.
 */
export async function seedImportFeeRates(
	ctx: MutationCtx,
	defaults: ImportFeeRate[],
): Promise<number> {
	let added = 0;
	for (const { country, percent } of defaults) {
		const key = countryKey(country);
		const existing = await ctx.db
			.query("yugiohImportFeeRates")
			.withIndex("by_countryKey", (q) => q.eq("countryKey", key))
			.unique();
		if (existing) continue;
		await setImportFeeRate(ctx, country, percent);
		added++;
	}
	return added;
}

export type PricingSettings = {
	importFeeRates: { country: string; percent: number }[];
	defaultImportFeePercent: number;
	/** When rates were last refreshed and from where; null before the first. */
	exchangeRates: {
		fetchedAt: number;
		source: string;
		currencies: number;
	} | null;
};

/** The import fee table, A to Z, and how fresh the exchange rates are. */
export async function readPricingSettings(
	ctx: QueryCtx,
): Promise<PricingSettings> {
	const fees = await ctx.db
		.query("yugiohImportFeeRates")
		.take(MAX_IMPORT_FEE_RATES);
	const rates = await ctx.db
		.query("yugiohExchangeRates")
		.take(MAX_EXCHANGE_RATES);
	const latest = rates.reduce<(typeof rates)[number] | null>(
		(newest, rate) =>
			newest === null || rate.fetchedAt > newest.fetchedAt ? rate : newest,
		null,
	);
	return {
		importFeeRates: fees
			.map(({ country, percent }) => ({ country, percent }))
			.sort((a, b) => a.country.localeCompare(b.country)),
		defaultImportFeePercent: DEFAULT_IMPORT_FEE_PERCENT,
		exchangeRates:
			latest === null
				? null
				: {
						fetchedAt: latest.fetchedAt,
						source: latest.source,
						currencies: rates.filter((r) => r.fetchedAt === latest.fetchedAt)
							.length,
					},
	};
}

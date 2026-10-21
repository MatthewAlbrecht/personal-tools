// Per-copy price: what one Copy from a Listing costs landed, in dollars.
// Relative imports only (Convex imports this).

/** Import fee rate for a seller country that isn't in my table. */
export const DEFAULT_IMPORT_FEE_PERCENT = 10;

/** Longer than any country name. */
export const MAX_COUNTRY_LENGTH = 80;

/** Where I live: Listings from here pay no import fees. */
export const HOME_COUNTRY = "United States";

/** One currency's daily rate: what 1 unit of it is worth in dollars. */
export type ExchangeRate = { currency: string; usdPerUnit: number };

/** One row of my import fee table. */
export type ImportFeeRate = { country: string; percent: number };

/** How a Listing's Per-copy price was reached, every amount in dollars. */
export type PerCopyPrice = {
	price: number;
	/** Null when the Listing doesn't say (local pickup only); counted as 0. */
	shipping: number | null;
	importFees: number;
	importFeePercent: number;
	/** True when the seller's country isn't in my table (or isn't known). */
	importFeeDefaulted: boolean;
	copies: number;
	perCopy: number;
};

/** The rates a Per-copy price needs, looked up by currency and country. */
export type Pricing = {
	usdPerUnit: (currency: string) => number | null;
	importFee: (country: string | null) => {
		percent: number;
		defaulted: boolean;
	};
};

type PricedListing = {
	price: number | null;
	currency: string | null;
	shipping: number | null;
	sellerLocation: string | null;
};

/** Other spellings eBay uses for a country, mapped to the one my table uses. */
const COUNTRY_ALIASES: Record<string, string> = {
	"korea, south": "south korea",
};

/**
 * Compares country names the way eBay writes them, ignoring case and spaces.
 * eBay spells some countries two ways ("Korea, South"); both give one key.
 */
export function countryKey(country: string): string {
	const key = cleanCountry(country).toLowerCase();
	return COUNTRY_ALIASES[key] ?? key;
}

/** A country name with its spaces tidied: "  United  Kingdom " → "United Kingdom". */
export function cleanCountry(country: string): string {
	return country.trim().replace(/\s+/g, " ");
}

/** Whether Listings from this country pay no import fees. */
export function isHomeCountry(country: string): boolean {
	return countryKey(country) === countryKey(HOME_COUNTRY);
}

/**
 * Pricing from the stored exchange rates and import fee table. Dollars are
 * always 1. My own country pays no import fees; a country not in the table,
 * or a Listing that doesn't say where it ships from, pays the default.
 */
export function pricingFrom(
	exchangeRates: ExchangeRate[],
	importFeeRates: ImportFeeRate[],
): Pricing {
	const rates = new Map(
		exchangeRates.map((r) => [r.currency.toUpperCase(), r.usdPerUnit]),
	);
	const fees = new Map(
		importFeeRates.map((r) => [countryKey(r.country), r.percent]),
	);
	return {
		usdPerUnit(currency) {
			const code = currency.toUpperCase();
			if (code === "USD") return 1;
			return rates.get(code) ?? null;
		},
		importFee(country) {
			if (country !== null && isHomeCountry(country)) {
				return { percent: 0, defaulted: false };
			}
			const percent =
				country === null ? undefined : fees.get(countryKey(country));
			return percent === undefined
				? { percent: DEFAULT_IMPORT_FEE_PERCENT, defaulted: true }
				: { percent, defaulted: false };
		},
	};
}

/**
 * Price plus shipping plus import fees, converted to dollars, divided by the
 * Copies in the Listing. Null when the Listing has no price or there's no
 * exchange rate for its currency yet. Each amount is rounded to cents.
 */
export function perCopyPrice(
	listing: PricedListing,
	copies: number,
	pricing: Pricing,
): PerCopyPrice | null {
	if (listing.price === null) return null;
	const usdPerUnit = pricing.usdPerUnit(listing.currency ?? "USD");
	if (usdPerUnit === null) return null;
	const price = cents(listing.price * usdPerUnit);
	const shipping =
		listing.shipping === null ? null : cents(listing.shipping * usdPerUnit);
	const importFee = pricing.importFee(listing.sellerLocation);
	const importFees = cents(
		((price + (shipping ?? 0)) * importFee.percent) / 100,
	);
	const lot = Math.max(1, Math.floor(copies));
	return {
		price,
		shipping,
		importFees,
		importFeePercent: importFee.percent,
		importFeeDefaulted: importFee.defaulted,
		copies: lot,
		perCopy: cents((price + (shipping ?? 0) + importFees) / lot),
	};
}

function cents(amount: number): number {
	return Math.round(amount * 100) / 100;
}

/**
 * The researched starting rates for the import fee table, seeded once
 * (`internal.yugioh.pricing.seedImportFeeRates`). Country names are spelled
 * as eBay's "Located in …" row writes them. Sources:
 * `docs/yugioh/references/exchange-rates-and-import-fees.md`.
 */
export const DEFAULT_IMPORT_FEE_RATES: ImportFeeRate[] = [
	// Section 301 at 10%, plus a 3-point allowance for carrier fees.
	...[
		"Canada",
		"Mexico",
		"United Kingdom",
		"Ireland",
		"Germany",
		"France",
		"Italy",
		"Spain",
		"Netherlands",
		"Belgium",
		"Austria",
		"Portugal",
		"Poland",
		"Sweden",
		"Denmark",
		"Finland",
		"Greece",
		"Taiwan",
		"Malaysia",
		"Indonesia",
		"India",
	].map((country) => ({ country, percent: 13 })),
	// Section 301 at 12.5%, plus the same allowance.
	...[
		"Japan",
		"South Korea",
		"China",
		"Hong Kong",
		"Singapore",
		"Philippines",
		"Thailand",
		"Vietnam",
		"Australia",
		"New Zealand",
		"Switzerland",
	].map((country) => ({ country, percent: 16 })),
	// 12.5% plus Brazil's own 25% tariff, plus the allowance. Deliberately
	// high: whether cards are exempt from the 25% couldn't be checked.
	{ country: "Brazil", percent: 41 },
];

/**
 * Today's rates from Frankfurter's v2 API (`/v2/rates?base=USD`): a list of
 * `{ date, base, quote, rate }`, where `rate` is units of `quote` per dollar.
 * Returns what 1 unit of each currency is worth in dollars, skipping dollars
 * themselves and any row without a usable rate.
 */
export function parseFrankfurterRates(body: unknown): ExchangeRate[] {
	if (!Array.isArray(body)) {
		throw new Error("Frankfurter didn't return a list of rates");
	}
	const rates: ExchangeRate[] = [];
	for (const row of body) {
		if (typeof row !== "object" || row === null) continue;
		const { base, quote, rate } = row as Record<string, unknown>;
		if (base !== "USD" || typeof quote !== "string" || quote === "USD") {
			continue;
		}
		if (typeof rate !== "number" || !(rate > 0) || !Number.isFinite(rate)) {
			continue;
		}
		rates.push({ currency: quote.toUpperCase(), usdPerUnit: 1 / rate });
	}
	return rates;
}

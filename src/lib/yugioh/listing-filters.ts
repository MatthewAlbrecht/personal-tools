// Filters for a Deck's Listings, kept in the URL. A Deck's Listings show in
// two views, Available and Sold, that never share a Listing; the other filters
// only narrow a view. Relative imports only (Convex imports this).

import { isSale, listingLanguage } from "./deals";
import { countryKey } from "./pricing";
import {
	LANGUAGES,
	type Language,
	type MatchStatus,
	READ_CONDITIONS,
	type ReadCondition,
	type TitleRead,
	shownMatchStatus,
} from "./title-reading";
import { isNewListing } from "./whats-new";

export const MARKETPLACES = ["ebay", "tcgplayer"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

/** Available: still for sale (the default). Sold: sold, or ended with bids. */
export const LISTING_VIEWS = ["available", "sold"] as const;
export type ListingsView = (typeof LISTING_VIEWS)[number];

/** How a Listing sells, as the type filter sees it: Best Offer is buy it now. */
export const LISTING_KINDS = ["buyItNow", "auction"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const CONDITION_FILTERS = [...READ_CONDITIONS, "unknown"] as const;
export type ConditionFilter = ReadCondition | "unknown";

export const MATCH_FILTERS = [
	"match",
	"unsure",
	"notMatch",
	"reading",
] as const;
export type MatchFilter = MatchStatus | "reading";

/** Every filter is optional; an unset filter lets every Listing in the view through. */
export type ListingFilters = {
	/** Available (unset) or Sold. */
	view?: ListingsView;
	/** Only Listings first seen since my last visit, within the view. */
	new?: boolean;
	marketplace?: Marketplace;
	type?: ListingKind;
	language?: Language;
	/** As read from the title; "unknown" when the title doesn't say. */
	condition?: ConditionFilter;
	graded?: boolean;
	match?: MatchFilter;
	/** The seller's country, as eBay names it. */
	location?: string;
	/** A Card in the Deck (its ID): Listings matched to the Printings it searches. */
	card?: string;
};

/** What filtering needs to know about a stored Listing. */
export type FilterableListing = {
	marketplace: Marketplace;
	title: string;
	listingType: "buyItNow" | "bestOffer" | "auction";
	sold: boolean;
	soldDate: string | null;
	endsAt: number | null;
	bids: number | null;
	firstSeenAt: number;
	sellerLocation: string | null;
	titleRead?: TitleRead | null;
	titleReadStatus?: "reading" | "read" | "failed";
	matchStatus?: MatchStatus;
	matchOverridden?: boolean;
	matchedPrintingId?: string | null;
};

/** What the filters are judged against, besides the Listing itself. */
export type FilterContext = {
	now: number;
	/** Where this visit's "new" starts; null before my first visit. */
	newSince: number | null;
	/** The Printings each Card of the Deck searches, by Card ID. */
	cardPrintings: ReadonlyMap<string, ReadonlySet<string>>;
};

/** Which view a Listing shows in: Sold once it's a sale, else Available. */
export function listingsViewOf(
	listing: FilterableListing,
	now: number,
): ListingsView {
	return isSale(listing, now) ? "sold" : "available";
}

/** Auction, or buy it now (with Best Offer), whether sold or not. */
export function listingKind(listing: FilterableListing): ListingKind {
	return listing.listingType === "auction" ? "auction" : "buyItNow";
}

/** The Listings in the filters' view that the filters let through, in the order given. */
export function applyListingFilters<L extends FilterableListing>(
	listings: readonly L[],
	filters: ListingFilters,
	context: FilterContext,
): L[] {
	return listings.filter((listing) => passes(listing, filters, context));
}

function passes(
	listing: FilterableListing,
	filters: ListingFilters,
	{ now, newSince, cardPrintings }: FilterContext,
): boolean {
	if (listingsViewOf(listing, now) !== (filters.view ?? "available")) {
		return false;
	}
	if (filters.new && !isNewListing(listing, newSince)) return false;
	if (filters.marketplace && listing.marketplace !== filters.marketplace) {
		return false;
	}
	if (filters.type && listingKind(listing) !== filters.type) return false;
	if (filters.language && listingLanguage(listing) !== filters.language) {
		return false;
	}
	if (
		filters.condition &&
		(listing.titleRead?.condition ?? "unknown") !== filters.condition
	) {
		return false;
	}
	if (
		filters.graded !== undefined &&
		(listing.titleRead?.graded ?? false) !== filters.graded
	) {
		return false;
	}
	if (filters.match && shownMatchStatus(listing) !== filters.match) {
		return false;
	}
	if (
		filters.location !== undefined &&
		(listing.sellerLocation === null ||
			countryKey(listing.sellerLocation) !== countryKey(filters.location))
	) {
		return false;
	}
	if (filters.card !== undefined) {
		const printings = cardPrintings.get(filters.card);
		const printingId = listing.matchedPrintingId ?? null;
		if (!printings || printingId === null || !printings.has(printingId)) {
			return false;
		}
	}
	return true;
}

// --- The URL ---------------------------------------------------------------

/** Search params the filters own; any other param (`listing`, `sort`) is left alone. */
const FILTER_PARAMS = [
	"view",
	"new",
	"marketplace",
	"type",
	"language",
	"condition",
	"graded",
	"match",
	"location",
	"card",
] as const satisfies ReadonlyArray<keyof ListingFilters>;

type ParamReader = { get(name: string): string | null };

function oneOf<T extends string>(
	values: readonly T[],
	value: string | null,
): T | undefined {
	return values.find((v) => v === value);
}

function text(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function yesNo(value: string | null): boolean | undefined {
	if (value === "yes") return true;
	if (value === "no") return false;
	return undefined;
}

/**
 * Params from before Available and Sold: `type=sold` was the Sold view, and
 * `ending=1` the Ending soon view (now a sort, see `listingSortFromParams`).
 */
const LEGACY_PARAMS = ["ending"] as const;

/**
 * The filters a URL's search params hold. A value the filters don't know is
 * ignored, so a stale or mistyped link shows more, never nothing. Old links
 * (`type=sold`) still open the view they meant.
 */
export function listingFiltersFromParams(params: ParamReader): ListingFilters {
	const legacySold = params.get("type") === "sold";
	const view = legacySold ? "sold" : oneOf(LISTING_VIEWS, params.get("view"));
	const filters: ListingFilters = {
		view: view === "available" ? undefined : view,
		new: params.get("new") === "1" || undefined,
		marketplace: oneOf(MARKETPLACES, params.get("marketplace")),
		type: oneOf(LISTING_KINDS, params.get("type")),
		language: oneOf(LANGUAGES, params.get("language")),
		condition: oneOf(CONDITION_FILTERS, params.get("condition")),
		graded: yesNo(params.get("graded")),
		match: oneOf(MATCH_FILTERS, params.get("match")),
		location: text(params.get("location")),
		card: text(params.get("card")),
	};
	return withoutUnset(filters);
}

/** `params` with its filter params replaced by `filters`; other params kept. */
export function withListingFilters(
	params: URLSearchParams,
	filters: ListingFilters,
): URLSearchParams {
	const next = new URLSearchParams(params);
	for (const name of [...FILTER_PARAMS, ...LEGACY_PARAMS]) next.delete(name);
	for (const name of FILTER_PARAMS) {
		const value = paramValue(name, filters[name]);
		if (value !== undefined) next.set(name, value);
	}
	return next;
}

/** How a filter reads in the URL: `view=sold`, `new=1`, `graded=no`. */
function paramValue(
	name: keyof ListingFilters,
	value: ListingFilters[keyof ListingFilters],
): string | undefined {
	if (value === undefined) return undefined;
	if (name === "view" && value === "available") return undefined;
	if (name === "graded") return value ? "yes" : "no";
	if (typeof value === "boolean") return value ? "1" : undefined;
	return value;
}

function withoutUnset(filters: ListingFilters): ListingFilters {
	return Object.fromEntries(
		Object.entries(filters).filter(([, value]) => value !== undefined),
	) as ListingFilters;
}

// --- The Filters button ----------------------------------------------------

/**
 * The filters set beyond the view and the New toggle, in URL order: the ones
 * the Filters button counts and lists as removable chips.
 */
export function extraFilters(
	filters: ListingFilters,
): Array<keyof ListingFilters> {
	return FILTER_PARAMS.filter(
		(name) => name !== "view" && name !== "new" && filters[name] !== undefined,
	);
}

/** How many filters are set beyond the view and the New toggle. */
export function activeFilterCount(filters: ListingFilters): number {
	return extraFilters(filters).length;
}

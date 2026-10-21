// Filters for a Deck's Listings, kept in the URL. Filters only narrow: with
// none set, every Listing shows. Relative imports only (Convex imports this).

import { isRunningAuction, isSale, listingLanguage } from "./deals";
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

/** How a Listing sells, as the type filter sees it: Best Offer is buy it now. */
export const LISTING_KINDS = ["buyItNow", "auction", "sold"] as const;
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

/** Every filter is optional; an unset filter lets every Listing through. */
export type ListingFilters = {
	/** Only Listings first seen since my last visit. */
	new?: boolean;
	/** Only running auctions, the soonest end first. */
	ending?: boolean;
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

/** Sold (or an auction that ended with bids), auction, or buy it now. */
export function listingKind(
	listing: FilterableListing,
	now: number,
): ListingKind {
	if (isSale(listing, now)) return "sold";
	return listing.listingType === "auction" ? "auction" : "buyItNow";
}

/**
 * The Listings the filters let through. They keep the order given, except
 * that "ending soon" puts the soonest end first (unknown end times last).
 */
export function applyListingFilters<L extends FilterableListing>(
	listings: readonly L[],
	filters: ListingFilters,
	context: FilterContext,
): L[] {
	const matching = listings.filter((listing) =>
		passes(listing, filters, context),
	);
	if (!filters.ending) return matching;
	return matching.sort(
		(a, b) =>
			(a.endsAt ?? Number.POSITIVE_INFINITY) -
			(b.endsAt ?? Number.POSITIVE_INFINITY),
	);
}

function passes(
	listing: FilterableListing,
	filters: ListingFilters,
	{ now, newSince, cardPrintings }: FilterContext,
): boolean {
	if (filters.new && !isNewListing(listing, newSince)) return false;
	if (filters.ending && !isRunningAuction(listing, now)) return false;
	if (filters.marketplace && listing.marketplace !== filters.marketplace) {
		return false;
	}
	if (filters.type && listingKind(listing, now) !== filters.type) return false;
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

/** Search params the filters own; any other param (`listing`) is left alone. */
const FILTER_PARAMS = [
	"new",
	"ending",
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
 * The filters a URL's search params hold. A value the filters don't know is
 * ignored, so a stale or mistyped link shows more, never nothing.
 */
export function listingFiltersFromParams(params: ParamReader): ListingFilters {
	const filters: ListingFilters = {
		new: params.get("new") === "1" || undefined,
		ending: params.get("ending") === "1" || undefined,
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
	for (const name of FILTER_PARAMS) next.delete(name);
	for (const name of FILTER_PARAMS) {
		const value = paramValue(name, filters[name]);
		if (value !== undefined) next.set(name, value);
	}
	return next;
}

/** How a filter reads in the URL: `new=1`, `graded=no`, `type=sold`. */
function paramValue(
	name: keyof ListingFilters,
	value: ListingFilters[keyof ListingFilters],
): string | undefined {
	if (value === undefined) return undefined;
	if (name === "graded") return value ? "yes" : "no";
	if (typeof value === "boolean") return value ? "1" : undefined;
	return value;
}

function withoutUnset(filters: ListingFilters): ListingFilters {
	return Object.fromEntries(
		Object.entries(filters).filter(([, value]) => value !== undefined),
	) as ListingFilters;
}

// --- Quick views -----------------------------------------------------------

/** The always-visible row: All · New · Ending soon · Sold. */
export const QUICK_VIEWS = ["all", "new", "ending", "sold"] as const;
export type QuickView = (typeof QUICK_VIEWS)[number];

/**
 * Which quick view the filters show, or null when they mix several (New
 * Listings that sold, say); the other filters don't affect it.
 */
export function quickView(filters: ListingFilters): QuickView | null {
	const shown: QuickView[] = [];
	if (filters.new) shown.push("new");
	if (filters.ending) shown.push("ending");
	if (filters.type === "sold") shown.push("sold");
	else if (filters.type !== undefined) return null;
	if (shown.length > 1) return null;
	return shown[0] ?? "all";
}

/** The filters with one quick view picked; the other filters are kept. */
export function withQuickView(
	filters: ListingFilters,
	view: QuickView,
): ListingFilters {
	const { new: _new, ending: _ending, type: _type, ...rest } = filters;
	if (view === "new") return { ...rest, new: true };
	if (view === "ending") return { ...rest, ending: true };
	if (view === "sold") return { ...rest, type: "sold" };
	return rest;
}

/**
 * The filters set beyond what the quick view shows, in URL order: the ones
 * the Filters button counts and lists as removable badges.
 */
export function extraFilters(
	filters: ListingFilters,
): Array<keyof ListingFilters> {
	const view = quickView(filters);
	return FILTER_PARAMS.filter((name) => {
		if (filters[name] === undefined) return false;
		if (view === null) return true;
		if (name === "new" || name === "ending") return false;
		return !(name === "type" && view === "sold");
	});
}

/** How many filters are set beyond the quick view. */
export function activeFilterCount(filters: ListingFilters): number {
	return extraFilters(filters).length;
}

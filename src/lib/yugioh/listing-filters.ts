// Filters for a Deck's Listings, kept in the URL. A Deck's Listings show in
// two views, Available and Sold, that never share a Listing; the other filters
// only narrow a view. Relative imports only (Convex imports this).

import { isSale, listingLanguage } from "./deals";
import { PRIORITIES, type Priority, SECTIONS, type Section } from "./deck";
import { type ConditionChoice, listingCondition } from "./listing-edits";
import { type Rejection, isRejected } from "./listing-rejection";
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

/**
 * How the language filter groups the languages: English on its own, the
 * European printings (German, French, Italian, Spanish, Portuguese) and the
 * Asian ones (Japanese, Korean, Chinese).
 */
export const LANGUAGE_GROUPS = ["english", "european", "asian"] as const;
export type LanguageGroup = (typeof LANGUAGE_GROUPS)[number];

export const LANGUAGE_GROUP_LABELS: Record<LanguageGroup, string> = {
	english: "English",
	european: "European",
	asian: "Asian",
};

const GROUP_OF_LANGUAGE: Record<Language, LanguageGroup> = {
	english: "english",
	german: "european",
	french: "european",
	italian: "european",
	spanish: "european",
	portuguese: "european",
	japanese: "asian",
	korean: "asian",
	chinese: "asian",
};

/** The language group a language is in. */
export function languageGroupOf(language: Language): LanguageGroup {
	return GROUP_OF_LANGUAGE[language];
}

export const CONDITION_FILTERS = [...READ_CONDITIONS, "unknown"] as const;
export type ConditionFilter = ReadCondition | "unknown";

/**
 * Every filter is optional; an unset filter lets every Listing in the view
 * through. The URL is another matter: there, English and not graded are the
 * defaults (see `listingFiltersFromParams`).
 */
export type ListingFilters = {
	/** Available (unset) or Sold. */
	view?: ListingsView;
	/** Only Listings first seen since my last visit, within the view. */
	new?: boolean;
	marketplace?: Marketplace;
	type?: ListingKind;
	/** English, European or Asian (see `LANGUAGE_GROUPS`). */
	language?: LanguageGroup;
	/** As read from the title; "unknown" when the title doesn't say. */
	condition?: ConditionFilter;
	graded?: boolean;
	/** Only Rejected Listings (marked wrong), within the view; unset hides them. */
	rejected?: boolean;
	/** The seller's country, as eBay names it. */
	location?: string;
	/** A Card in the Deck (its ID): Listings matched to the Printings it searches. */
	card?: string;
	/** A Printing (its ID): Listings matched to it. */
	printing?: string;
	/**
	 * Cards in the Deck (their IDs) whose Listings are hidden: the Printings
	 * each searches, as with `card`. In the URL as `hide`.
	 */
	excludeCards?: string[];
	/**
	 * Only Listings for Cards of these priorities (one or more): the Printings
	 * each such Card searches, as with `card`. Empty lets everything through.
	 */
	priority?: Priority[];
	/**
	 * Only Listings for Cards in these Sections (Main, Extra, Side): the
	 * Printings each such Card searches, as with `card`. Empty lets everything
	 * through.
	 */
	section?: Section[];
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
	conditionOverride?: ConditionChoice | null;
	titleReadStatus?: "reading" | "read" | "failed";
	matchStatus?: MatchStatus;
	matchOverridden?: boolean;
	matchedPrintingId?: string | null;
	rejection?: Rejection | null;
};

/** What the filters are judged against, besides the Listing itself. */
export type FilterContext = {
	now: number;
	/** Where this visit's "new" starts; null before my first visit. */
	newSince: number | null;
	/** The Printings each Card of the Deck searches, by Card ID. */
	cardPrintings: ReadonlyMap<string, ReadonlySet<string>>;
	/** The Printings the Deck still needs (`neededPrintingIds`). */
	neededPrintings: ReadonlySet<string>;
	/** Each Card's priority, by Card ID. */
	cardPriorities: ReadonlyMap<string, Priority>;
	/** Each Card's Section, by Card ID. */
	cardSections: ReadonlyMap<string, Section>;
};

/**
 * Whether a Listing shows in a Deck's Listings at all: matched to a Printing
 * the Deck still needs (a Card missing copies; its Chosen Printing once it
 * has one). Unsure, not-a-match, still-being-read Listings and Listings for
 * done Cards or un-chosen Printings never show; they still count toward
 * prices wherever they qualify.
 */
export function isShownInDeck(
	listing: FilterableListing,
	neededPrintings: ReadonlySet<string>,
): boolean {
	const printingId = listing.matchedPrintingId ?? null;
	return (
		shownMatchStatus(listing) === "match" &&
		printingId !== null &&
		neededPrintings.has(printingId)
	);
}

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
	{
		now,
		newSince,
		cardPrintings,
		neededPrintings,
		cardPriorities,
		cardSections,
	}: FilterContext,
): boolean {
	if (!isShownInDeck(listing, neededPrintings)) return false;
	if (isRejected(listing) !== (filters.rejected ?? false)) return false;
	if (listingsViewOf(listing, now) !== (filters.view ?? "available")) {
		return false;
	}
	if (filters.new && !isNewListing(listing, newSince)) return false;
	if (filters.marketplace && listing.marketplace !== filters.marketplace) {
		return false;
	}
	if (filters.type && listingKind(listing) !== filters.type) return false;
	if (
		filters.language &&
		languageGroupOf(listingLanguage(listing)) !== filters.language
	) {
		return false;
	}
	if (
		filters.condition &&
		(listingCondition(listing) ?? "unknown") !== filters.condition
	) {
		return false;
	}
	if (
		filters.graded !== undefined &&
		(listing.titleRead?.graded ?? false) !== filters.graded
	) {
		return false;
	}
	if (
		filters.location !== undefined &&
		(listing.sellerLocation === null ||
			countryKey(listing.sellerLocation) !== countryKey(filters.location))
	) {
		return false;
	}
	if (filters.excludeCards?.length) {
		const printingId = listing.matchedPrintingId ?? null;
		if (
			printingId !== null &&
			filters.excludeCards.some((cardId) =>
				cardPrintings.get(cardId)?.has(printingId),
			)
		) {
			return false;
		}
	}
	if (filters.priority?.length) {
		const printingId = listing.matchedPrintingId ?? null;
		const wanted = new Set(filters.priority);
		const forWantedCard =
			printingId !== null &&
			[...cardPrintings].some(([cardId, printings]) => {
				const priority = cardPriorities.get(cardId);
				return (
					priority !== undefined &&
					wanted.has(priority) &&
					printings.has(printingId)
				);
			});
		if (!forWantedCard) return false;
	}
	if (filters.section?.length) {
		const printingId = listing.matchedPrintingId ?? null;
		const wanted = new Set(filters.section);
		const inWantedSection =
			printingId !== null &&
			[...cardPrintings].some(([cardId, printings]) => {
				const section = cardSections.get(cardId);
				return (
					section !== undefined &&
					wanted.has(section) &&
					printings.has(printingId)
				);
			});
		if (!inWantedSection) return false;
	}
	if (
		filters.printing !== undefined &&
		(listing.matchedPrintingId ?? null) !== filters.printing
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

// --- The defaults ----------------------------------------------------------

/** Set when the URL doesn't say: the Listings that could count toward prices. */
const DEFAULT_FILTERS = {
	language: "english",
	graded: false,
} as const satisfies ListingFilters;

/** The default filters, keeping the view and the New and Marked wrong toggles. */
export function defaultListingFilters(filters: ListingFilters): ListingFilters {
	return {
		view: filters.view,
		new: filters.new,
		rejected: filters.rejected,
		...DEFAULT_FILTERS,
	};
}

/** `filters` with the Card's Listings hidden too. */
export function withCardHidden(
	filters: ListingFilters,
	cardId: string,
): ListingFilters {
	const hidden = filters.excludeCards ?? [];
	return hidden.includes(cardId)
		? filters
		: { ...filters, excludeCards: [...hidden, cardId] };
}

/** `filters` with the Card's Listings shown again. */
export function withCardShown(
	filters: ListingFilters,
	cardId: string,
): ListingFilters {
	const hidden = (filters.excludeCards ?? []).filter((id) => id !== cardId);
	return withoutUnset({
		...filters,
		excludeCards: hidden.length > 0 ? hidden : undefined,
	});
}

/** Whether only the defaults are set, beyond the view and the New toggle. */
export function isDefaultListingFilters(filters: ListingFilters): boolean {
	const extra = extraFilters(filters);
	return (
		extra.length === Object.keys(DEFAULT_FILTERS).length &&
		filters.language === DEFAULT_FILTERS.language &&
		filters.graded === DEFAULT_FILTERS.graded
	);
}

// --- The URL ---------------------------------------------------------------

/** A filter with a default is turned off with `=any` in the URL. */
const ANY_PARAM = "any";

/** Search params the filters own; any other param (`listing`, `sort`) is left alone. */
const FILTER_PARAMS = [
	"view",
	"new",
	"marketplace",
	"type",
	"language",
	"condition",
	"graded",
	"location",
	"card",
	"printing",
	"excludeCards",
	"priority",
	"section",
	"rejected",
] as const satisfies ReadonlyArray<keyof ListingFilters>;

/** A filter's param in the URL: its own name, but for the hidden Cards. */
function paramName(name: keyof ListingFilters): string {
	return name === "excludeCards" ? "hide" : name;
}

/** The hidden Cards' IDs, comma-separated, once each; none when empty. */
function idList(value: string | null): string[] | undefined {
	const ids = [
		...new Set(
			(value ?? "")
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean),
		),
	];
	return ids.length > 0 ? ids : undefined;
}

/** Priorities, comma-separated, once each and most first; unknown ones dropped. */
function priorityList(value: string | null): Priority[] | undefined {
	const named = new Set(idList(value));
	const priorities = PRIORITIES.filter((priority) => named.has(priority));
	return priorities.length > 0 ? priorities : undefined;
}

/** Sections, comma-separated, once each in Deck order; unknown ones dropped. */
function sectionList(value: string | null): Section[] | undefined {
	const named = new Set(idList(value));
	const sections = SECTIONS.filter((section) => named.has(section));
	return sections.length > 0 ? sections : undefined;
}

type ParamReader = { get(name: string): string | null };

function oneOf<T extends string>(
	values: readonly T[],
	value: string | null,
): T | undefined {
	return values.find((v) => v === value);
}

/**
 * A language group from the URL; an old link's single language
 * (`language=korean`) opens its group, anything else English.
 */
function languageGroupParam(value: string | null): LanguageGroup {
	const group = oneOf(LANGUAGE_GROUPS, value);
	if (group) return group;
	const language = oneOf(LANGUAGES, value);
	return language ? languageGroupOf(language) : DEFAULT_FILTERS.language;
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
 * The filters a URL's search params hold. With no `language` or `graded`
 * param, English and not graded apply; `language=any` and `graded=any` turn
 * them off. Old links naming one language (`language=korean`) open its
 * group. Any other value the filters don't know is ignored (a defaulted
 * filter keeps its default), so a stale or mistyped link never shows nothing.
 * Old links (`type=sold`) still open the view they meant.
 */
export function listingFiltersFromParams(params: ParamReader): ListingFilters {
	const legacySold = params.get("type") === "sold";
	const view = legacySold ? "sold" : oneOf(LISTING_VIEWS, params.get("view"));
	const filters: ListingFilters = {
		view: view === "available" ? undefined : view,
		new: params.get("new") === "1" || undefined,
		marketplace: oneOf(MARKETPLACES, params.get("marketplace")),
		type: oneOf(LISTING_KINDS, params.get("type")),
		language:
			params.get("language") === ANY_PARAM
				? undefined
				: languageGroupParam(params.get("language")),
		condition: oneOf(CONDITION_FILTERS, params.get("condition")),
		graded:
			params.get("graded") === ANY_PARAM
				? undefined
				: (yesNo(params.get("graded")) ?? DEFAULT_FILTERS.graded),
		location: text(params.get("location")),
		card: text(params.get("card")),
		printing: text(params.get("printing")),
		excludeCards: idList(params.get("hide")),
		priority: priorityList(params.get("priority")),
		section: sectionList(params.get("section")),
		rejected: params.get("rejected") === "1" || undefined,
	};
	return withoutUnset(filters);
}

/** `params` with its filter params replaced by `filters`; other params kept. */
export function withListingFilters(
	params: URLSearchParams,
	filters: ListingFilters,
): URLSearchParams {
	const next = new URLSearchParams(params);
	for (const name of LEGACY_PARAMS) next.delete(name);
	for (const name of FILTER_PARAMS) next.delete(paramName(name));
	for (const name of FILTER_PARAMS) {
		const value = paramValue(name, filters[name]);
		if (value !== undefined) next.set(paramName(name), value);
	}
	return next;
}

/**
 * How a filter reads in the URL: `view=sold`, `new=1`, `graded=yes`. A
 * default leaves no param; a defaulted filter that's off is `any`.
 */
function paramValue(
	name: keyof ListingFilters,
	value: ListingFilters[keyof ListingFilters],
): string | undefined {
	if (name === "language" || name === "graded") {
		if (value === undefined) return ANY_PARAM;
		if (value === DEFAULT_FILTERS[name]) return undefined;
	}
	if (value === undefined) return undefined;
	if (Array.isArray(value)) {
		return value.length > 0 ? value.join(",") : undefined;
	}
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
 * The filters set beyond the view and the New and Marked wrong toggles, in
 * URL order: the ones the Filters button counts and lists as removable chips.
 */
export function extraFilters(
	filters: ListingFilters,
): Array<keyof ListingFilters> {
	return FILTER_PARAMS.filter(
		(name) =>
			name !== "view" &&
			name !== "new" &&
			name !== "rejected" &&
			filters[name] !== undefined &&
			!(name === "excludeCards" && filters.excludeCards?.length === 0) &&
			!(name === "priority" && filters.priority?.length === 0) &&
			!(name === "section" && filters.section?.length === 0),
	);
}

/**
 * How many filters are set beyond the view and the New toggle, each hidden
 * Card counted on its own (each is its own chip).
 */
export function activeFilterCount(filters: ListingFilters): number {
	return extraFilters(filters).reduce(
		(count, name) =>
			count +
			(name === "excludeCards" ? (filters.excludeCards?.length ?? 0) : 1),
		0,
	);
}

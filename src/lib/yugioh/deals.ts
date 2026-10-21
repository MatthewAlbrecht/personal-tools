// Qualifying Listings, Reference prices and Deal grades.
// Relative imports only (Convex imports this).

import type { Condition } from "./deck";
import {
	type Language,
	type ReadCondition,
	type TitleRead,
	languageOfSetCode,
	titleSetCode,
} from "./title-reading";

/** A Reference price looks back this far for sales. */
export const REFERENCE_WINDOW_DAYS = 60;
export const REFERENCE_WINDOW_MS = REFERENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Fewer Qualifying sales than this is "not enough sales": no Reference price. */
export const MIN_REFERENCE_SALES = 3;

export const DEAL_GRADES = ["great", "good", "fair", "poor"] as const;
export type DealGrade = (typeof DEAL_GRADES)[number];

export const DEAL_GRADE_LABELS: Record<DealGrade, string> = {
	great: "Great",
	good: "Good",
	fair: "Fair",
	poor: "Poor",
};

/** The highest percent of the Reference price each grade allows. */
const GRADE_CEILINGS: ReadonlyArray<[DealGrade, number]> = [
	["great", 80],
	["good", 95],
	["fair", 110],
];

/**
 * A Printing's Reference price on one marketplace: the median Per-copy price
 * of its Qualifying sales, or null with fewer than `MIN_REFERENCE_SALES`.
 */
export type Reference = { price: number | null; sales: number };

/** How each condition ranks, best first. Damaged is below every Card's floor. */
const CONDITION_RANK: Record<ReadCondition, number> = {
	nearMint: 4,
	lightlyPlayed: 3,
	moderatelyPlayed: 2,
	heavilyPlayed: 1,
	damaged: 0,
};

/** What Qualifying needs to know about a Listing. */
type JudgedListing = { title: string; titleRead?: TitleRead | null };

/**
 * The Listing's language: as read from the title, else the region of its set
 * code. A title that says neither is taken as English (it's on eBay US).
 */
function listingLanguage(listing: JudgedListing): Language {
	if (listing.titleRead) return listing.titleRead.language;
	const setCode = titleSetCode(listing.title);
	return (setCode === null ? null : languageOfSetCode(setCode)) ?? "english";
}

/**
 * Whether the Listing's condition is below the Lowest acceptable condition.
 * A title that doesn't state a condition isn't below it: it counts, flagged.
 */
export function isBelowCondition(
	listing: JudgedListing,
	lowestAcceptable: Condition,
): boolean {
	const condition = listing.titleRead?.condition ?? null;
	return (
		condition !== null &&
		CONDITION_RANK[condition] < CONDITION_RANK[lowestAcceptable]
	);
}

/**
 * Whether a Listing matched to a Printing I want is a Qualifying Listing:
 * English, not graded, and at or above the Card's Lowest acceptable
 * condition (or of unknown condition).
 */
export function isQualifying(
	listing: JudgedListing,
	lowestAcceptable: Condition,
): boolean {
	return (
		getsDealGrade(listing, lowestAcceptable) &&
		!(listing.titleRead?.graded ?? false)
	);
}

/**
 * Whether a matched Listing gets a Deal grade: Qualifying, except that a
 * Graded Listing is still graded (and flagged). A running auction is decided
 * separately (`isRunningAuction`).
 */
export function getsDealGrade(
	listing: JudgedListing,
	lowestAcceptable: Condition,
): boolean {
	return (
		listingLanguage(listing) === "english" &&
		!isBelowCondition(listing, lowestAcceptable)
	);
}

/**
 * The most lenient of several Lowest acceptable conditions: a Printing wanted
 * by two Cards in one Deck takes a Listing either Card would accept.
 */
export function mostLenientCondition(
	conditions: readonly Condition[],
): Condition | null {
	let lenient: Condition | null = null;
	for (const condition of conditions) {
		if (
			lenient === null ||
			CONDITION_RANK[condition] < CONDITION_RANK[lenient]
		) {
			lenient = condition;
		}
	}
	return lenient;
}

type SaleFields = {
	listingType: "buyItNow" | "bestOffer" | "auction";
	sold: boolean;
	soldDate: string | null;
	endsAt: number | null;
	bids: number | null;
};

/**
 * When a Listing sold or will end, Unix ms: the sold date (midnight UTC) for
 * a sold Listing, the end time for an auction. A sold Listing without either
 * takes `seenSoldAt`, when a capture first saw it sold. Null for a
 * fixed-price Listing still for sale.
 */
export function saleTime(
	listing: SaleFields,
	seenSoldAt: number,
): number | null {
	if (listing.sold) {
		if (listing.soldDate !== null) {
			const time = Date.parse(`${listing.soldDate}T00:00:00Z`);
			if (Number.isFinite(time)) return time;
		}
		return listing.endsAt ?? seenSoldAt;
	}
	return listing.listingType === "auction" ? listing.endsAt : null;
}

/** An auction still taking bids: its price isn't final, so it gets no grade. */
export function isRunningAuction(listing: SaleFields, now: number): boolean {
	return (
		listing.listingType === "auction" &&
		!listing.sold &&
		(listing.endsAt === null || listing.endsAt > now)
	);
}

/**
 * Whether a Listing is a sale: sold, or an auction that ended with bids (an
 * ended auction counts as sold even when no Sold page has shown it yet).
 */
export function isSale(listing: SaleFields, now: number): boolean {
	if (listing.sold) return true;
	return (
		listing.listingType === "auction" &&
		listing.endsAt !== null &&
		listing.endsAt <= now &&
		listing.bids !== 0
	);
}

/**
 * The Reference price from Qualifying sales' Per-copy prices: their median,
 * rounded to cents, or null with fewer than `MIN_REFERENCE_SALES`.
 */
export function referencePrice(perCopyPrices: readonly number[]): Reference {
	const sales = perCopyPrices.length;
	if (sales < MIN_REFERENCE_SALES) return { price: null, sales };
	const sorted = [...perCopyPrices].sort((a, b) => a - b);
	const middle = Math.floor(sales / 2);
	const median =
		sales % 2 === 1
			? (sorted[middle] ?? 0)
			: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
	return { price: Math.round(median * 100) / 100, sales };
}

/** A Per-copy price as a whole percent of the Reference price: 78. */
export function percentOfReference(
	perCopy: number,
	referencePrice: number,
): number {
	return Math.round((perCopy / referencePrice) * 100);
}

/**
 * The Deal grade for a whole percent of the Reference price: Great at 80% or
 * less, Good at 95%, Fair at 110%, Poor above. Graded on the shown percent,
 * so "80% of ref" always reads Great.
 */
export function dealGrade(percent: number): DealGrade {
	for (const [grade, ceiling] of GRADE_CEILINGS) {
		if (percent <= ceiling) return grade;
	}
	return "poor";
}

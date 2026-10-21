import { format, intervalToDuration, parseISO } from "date-fns";

import type { Marketplace } from "./listing-filters";
import {
	LANGUAGE_CODES,
	READ_CONDITION_LABELS,
	type ReadCondition,
	type TitleRead,
} from "./title-reading";
import { LISTING_RATE_WEEKS } from "./whats-new";

// Display helpers for Listings. Relative imports only.

type ListingTypeFields = {
	listingType: "buyItNow" | "bestOffer" | "auction";
	bids: number | null;
	endsAt: number | null;
	sold: boolean;
	soldDate: string | null;
};

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
	ebay: "eBay",
	tcgplayer: "TCGplayer",
};

/**
 * Who sells a Listing, as far as the page says: an eBay seller's country
 * ("United Kingdom"), or a TCGplayer seller's name with how many Copies they
 * have ("Card Castle · 3 Copies"). Null when unknown, as for a TCGplayer
 * sale.
 */
export function listingSeller(listing: {
	marketplace: Marketplace;
	sellerLocation: string | null;
	tcgplayer: {
		seller: string | null;
		condition: string;
		quantity: number | null;
	} | null;
}): string | null {
	if (listing.marketplace === "ebay") return listing.sellerLocation;
	const seller = listing.tcgplayer?.seller ?? null;
	if (seller === null) return null;
	const quantity = listing.tcgplayer?.quantity ?? null;
	return quantity !== null && quantity > 1
		? `${seller} · ${quantity} Copies`
		: seller;
}

/** A Listing price in its own currency, with cents: `$42.15`, `£31.00`. */
export function formatMoney(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
		}).format(amount);
	} catch {
		return `${currency} ${amount.toFixed(2)}`;
	}
}

/** An auction countdown: "2d 4h", "1h 12m", "14m", "<1m" or "Ended". */
export function timeLeft(endsAt: number, now: number): string {
	if (endsAt <= now) return "Ended";
	const { years, months, days, hours, minutes } = intervalToDuration({
		start: now,
		end: endsAt,
	});
	if (years || months) return format(endsAt, "MMM d");
	if (days) return `${days}d ${hours ?? 0}h`;
	if (hours) return `${hours}h ${minutes ?? 0}m`;
	if (minutes) return `${minutes}m`;
	return "<1m";
}

/** "Buy it now", "Best offer", "Auction · 1h 12m · 4 bids" or "Sold Oct 18". */
export function listingTypeLabel(
	listing: ListingTypeFields,
	now: number,
): string {
	if (listing.sold) {
		return listing.soldDate
			? `Sold ${format(parseISO(listing.soldDate), "MMM d")}`
			: "Sold";
	}
	if (listing.listingType === "buyItNow") return "Buy it now";
	if (listing.listingType === "bestOffer") return "Best offer";
	const parts = ["Auction"];
	if (listing.endsAt !== null) parts.push(timeLeft(listing.endsAt, now));
	if (listing.bids !== null) {
		parts.push(`${listing.bids} ${listing.bids === 1 ? "bid" : "bids"}`);
	}
	return parts.join(" · ");
}

export type TitleFlag = {
	kind: "graded" | "language" | "lot";
	label: string;
};

/** Short condition labels: "LP", "DMG". */
const READ_CONDITION_ABBREVIATIONS: Record<ReadCondition, string> = {
	nearMint: "NM",
	lightlyPlayed: "LP",
	moderatelyPlayed: "MP",
	heavilyPlayed: "HP",
	damaged: "DMG",
};

/**
 * A Listing's condition for the Condition column: its acronym ("LP"), its
 * full name, and whether it's below the Card's Lowest acceptable condition.
 * Null when the title doesn't state one (or isn't read yet).
 */
export function conditionCell(
	condition: ReadCondition | null,
	belowCondition: boolean,
): { short: string; name: string; below: boolean } | null {
	if (condition === null) return null;
	return {
		short: READ_CONDITION_ABBREVIATIONS[condition],
		name: READ_CONDITION_LABELS[condition],
		below: belowCondition,
	};
}

/**
 * What a Listing's title says that sets it apart from a raw, English single,
 * besides its condition (which has its own column): "PSA 10", "KR",
 * "×3 copies".
 */
export function titleFlags(read: TitleRead | null): TitleFlag[] {
	if (read === null) return [];
	const flags: TitleFlag[] = [];
	if (read.graded) {
		flags.push({ kind: "graded", label: gradingLabel(read) });
	}
	if (read.language !== "english") {
		flags.push({ kind: "language", label: LANGUAGE_CODES[read.language] });
	}
	if (read.copies > 1) {
		flags.push({ kind: "lot", label: `×${read.copies} copies` });
	}
	return flags;
}

/** "PSA 10", "Graded" when the title names no company, or "Not graded". */
export function gradingLabel(
	read: Pick<TitleRead, "graded" | "gradingCompany" | "grade">,
): string {
	if (!read.graded) return "Not graded";
	return (
		[read.gradingCompany, read.grade]
			.filter((part) => part !== null)
			.join(" ") || "Graded"
	);
}

/**
 * A Card's new Listings a week, in words: "About 3 new a week", "Under 1 new
 * a week", or "No new Listings in 4 weeks".
 */
export function newListingsRate(perWeek: number): string {
	if (perWeek === 0) return `No new Listings in ${LISTING_RATE_WEEKS} weeks`;
	if (perWeek < 1) return "Under 1 new a week";
	const rounded = Math.round(perWeek);
	return `${rounded === perWeek ? "" : "About "}${rounded} new a week`;
}

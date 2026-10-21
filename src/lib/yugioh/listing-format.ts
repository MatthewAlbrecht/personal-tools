import { format, intervalToDuration, parseISO } from "date-fns";

import {
	LANGUAGE_CODES,
	type ReadCondition,
	type TitleRead,
} from "./title-reading";

// Display helpers for Listings. Relative imports only.

type ListingTypeFields = {
	listingType: "buyItNow" | "bestOffer" | "auction";
	bids: number | null;
	endsAt: number | null;
	sold: boolean;
	soldDate: string | null;
};

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
	kind: "graded" | "unknownCondition" | "belowCondition" | "language" | "lot";
	label: string;
};

/** Short condition labels for flags: "LP", "DMG". */
const READ_CONDITION_ABBREVIATIONS: Record<ReadCondition, string> = {
	nearMint: "NM",
	lightlyPlayed: "LP",
	moderatelyPlayed: "MP",
	heavilyPlayed: "HP",
	damaged: "DMG",
};

/**
 * What a Listing's title says that sets it apart from a raw, English, Near
 * Mint single: "PSA 10", "Condition?", "LP" (below the Card's Lowest
 * acceptable condition), "KR", "×3 copies". A Graded Listing never asks for
 * its condition.
 */
export function titleFlags(
	read: TitleRead | null,
	{ belowCondition = false }: { belowCondition?: boolean } = {},
): TitleFlag[] {
	if (read === null) return [];
	const flags: TitleFlag[] = [];
	if (read.graded) {
		flags.push({ kind: "graded", label: gradingLabel(read) });
	} else if (read.condition === null) {
		flags.push({ kind: "unknownCondition", label: "Condition?" });
	}
	if (belowCondition && read.condition !== null) {
		flags.push({
			kind: "belowCondition",
			label: READ_CONDITION_ABBREVIATIONS[read.condition],
		});
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

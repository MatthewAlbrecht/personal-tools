import { format, intervalToDuration, parseISO } from "date-fns";

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

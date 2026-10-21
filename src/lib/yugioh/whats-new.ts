// What's new in a Deck since my last visit, and how often a Card gets new
// Listings. Relative imports only (Convex imports this).

import { millisecondsInMinute, millisecondsInWeek } from "date-fns/constants";

/**
 * A gap this long between two looks at a Deck starts a new visit. Within a
 * visit, what's new stays new, so a reload or a tab change doesn't clear it.
 */
export const VISIT_GAP_MS = 30 * millisecondsInMinute;

/**
 * My visits to one Deck: when I last looked (`viewedAt`), and where this
 * visit's "new" starts (`newSince`, when the visit before it ended).
 */
export type DeckVisit = { viewedAt: number; newSince: number };

/**
 * The Deck's visit after I look at it at `now`. Looking again within
 * `VISIT_GAP_MS` continues the visit; a longer gap starts a new one, whose
 * "new" starts where the last visit ended. The first visit ever marks
 * nothing new.
 */
export function nextVisit(previous: DeckVisit | null, now: number): DeckVisit {
	if (previous === null) return { viewedAt: now, newSince: now };
	const viewedAt = Math.max(previous.viewedAt, now);
	if (now - previous.viewedAt <= VISIT_GAP_MS) {
		return { viewedAt, newSince: previous.newSince };
	}
	return { viewedAt, newSince: previous.viewedAt };
}

/**
 * Whether a Listing is new to me in a Deck: first captured after `newSince`.
 * Nothing is new before my first visit.
 */
export function isNewListing(
	listing: { firstSeenAt: number },
	newSince: number | null,
): boolean {
	return newSince !== null && listing.firstSeenAt > newSince;
}

/** A Card's new-Listing rate looks back this many weeks. */
export const LISTING_RATE_WEEKS = 4;
export const LISTING_RATE_WINDOW_MS = LISTING_RATE_WEEKS * millisecondsInWeek;

type DatedListing = {
	listedAt: number | null;
	firstSeenAt: number;
	sold: boolean;
};

/**
 * When a Listing went up: its listing date, else when it was first captured.
 * A sale without a listing date has no known time (the Sold page doesn't say
 * when it went up), so it isn't counted.
 */
function listedTime(listing: DatedListing): number | null {
	if (listing.listedAt !== null) return listing.listedAt;
	return listing.sold ? null : listing.firstSeenAt;
}

/**
 * How many new Listings a Card gets a week: those listed in the last
 * `LISTING_RATE_WEEKS` weeks, divided by the weeks. `listings` are the ones
 * matched to the Card's Printings, each once.
 */
export function newListingsPerWeek(
	listings: readonly DatedListing[],
	now: number,
): number {
	const since = now - LISTING_RATE_WINDOW_MS;
	const count = listings.filter((listing) => {
		const time = listedTime(listing);
		return time !== null && time > since && time <= now;
	}).length;
	return count / LISTING_RATE_WEEKS;
}

import {
	differenceInDays,
	differenceInHours,
	differenceInMinutes,
} from "date-fns";
import { millisecondsInHour } from "date-fns/constants";
import { CHECK_PAGE_COOL_DOWN_MS } from "./automation";
import type { DealGrade } from "./deals";
import { DEAL_GRADE_LABELS } from "./deals";
import { rarityAbbreviation } from "./deck";
import type { Marketplace } from "./listing-filters";
import { MARKETPLACE_LABELS, formatMoney } from "./listing-format";

// Push notifications: when a deal push may go out, and what pushes say.
// Relative imports only (Convex imports this).

/** Deal pushes are held from this hour (11pm)… */
export const QUIET_HOURS_START = 23;
/** …until this one (8am), in the device's time zone. */
export const QUIET_HOURS_END = 8;

/** Used until a device tells us its time zone, or when it names an unknown one. */
export const DEFAULT_TIME_ZONE = "America/Denver";

/**
 * When a deal push found at `now` may be delivered: now, or 8am when `now`
 * falls in quiet hours (11pm-8am) in `timeZone`.
 */
export function pushDeliveryTime(now: number, timeZone: string): number {
	const zone = isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
	const { hour, minute, second } = wallClock(now, zone);
	if (hour >= QUIET_HOURS_END && hour < QUIET_HOURS_START) return now;
	const hoursToGo =
		hour >= QUIET_HOURS_START
			? 24 - hour + QUIET_HOURS_END
			: QUIET_HOURS_END - hour;
	const startOfHour = now - (minute * 60 + second) * 1000 - (now % 1000);
	let deliverAt = startOfHour + hoursToGo * millisecondsInHour;
	// A clock change overnight moves 8am by an hour either way.
	const reached = wallClock(deliverAt, zone).hour;
	if (reached !== QUIET_HOURS_END) {
		deliverAt += (QUIET_HOURS_END - reached) * millisecondsInHour;
	}
	return deliverAt;
}

export type DealPushFacts = {
	grade: Extract<DealGrade, "great" | "good">;
	cardName: string;
	rarity: string;
	perCopy: number;
	percentOfReference: number;
	reference: number;
	marketplace: Marketplace;
	listingType: "buyItNow" | "bestOffer";
};

/**
 * A deal push: "Great deal: Ash Blossom & Joyous Spring QCSR" over
 * "$42.15 a copy, 78% of $54 ref · eBay, buy it now".
 */
export function dealPushText(deal: DealPushFacts): {
	title: string;
	body: string;
} {
	const type = deal.listingType === "buyItNow" ? "buy it now" : "best offer";
	return {
		title: `${DEAL_GRADE_LABELS[deal.grade]} deal: ${deal.cardName} ${rarityAbbreviation(deal.rarity)}`,
		body: `${formatMoney(deal.perCopy, "USD")} a copy, ${deal.percentOfReference}% of ${referenceMoney(deal.reference)} ref · ${MARKETPLACE_LABELS[deal.marketplace]}, ${type}`,
	};
}

export type AuctionPushFacts = {
	cardName: string;
	rarity: string;
	/** The Per-copy price at the last capture; null when it showed no price. */
	perCopy: number | null;
	/** The eBay Reference price; null while there are too few sales. */
	reference: number | null;
	bids: number | null;
	endsAt: number;
	/** When a capture last saw the Listing (and its price). */
	lastSeenAt: number;
};

/**
 * An auction push, sent as it's about to end: "Ending in 15 min: Ash Blossom
 * & Joyous Spring QCSR" over "Last seen $40.00 a copy (22m ago) · ref $54 ·
 * 4 bids". The price is the last one a capture saw, so it says how old it is.
 */
export function auctionPushText(
	auction: AuctionPushFacts,
	now: number,
): { title: string; body: string } {
	// Whole minutes left, never rounded up: a check may run a little early.
	const minutesLeft = Math.max(1, differenceInMinutes(auction.endsAt, now));
	const price =
		auction.perCopy === null
			? "No price seen yet"
			: `Last seen ${formatMoney(auction.perCopy, "USD")} a copy (${age(auction.lastSeenAt, now)})`;
	const parts = [
		price,
		auction.reference === null
			? "no ref yet"
			: `ref ${referenceMoney(auction.reference)}`,
	];
	if (auction.bids !== null) {
		parts.push(
			auction.bids === 0
				? "no bids yet"
				: `${auction.bids} ${auction.bids === 1 ? "bid" : "bids"}`,
		);
	}
	return {
		title: `Ending in ${minutesLeft} min: ${auction.cardName} ${rarityAbbreviation(auction.rarity)}`,
		body: parts.join(" · "),
	};
}

/**
 * The push when a run stops on a check page: "Run stopped on a check page at
 * eBay" over what to do about it.
 */
export function checkPagePushText(marketplace: Marketplace): {
	title: string;
	body: string;
} {
	const name = MARKETPLACE_LABELS[marketplace];
	const hours = CHECK_PAGE_COOL_DOWN_MS / millisecondsInHour;
	return {
		title: `Run stopped on a check page at ${name}`,
		body: `Open ${name} in the automation Chrome profile and solve it. Scheduled runs wait ${hours} hours.`,
	};
}

/** How long ago `then` was: "just now", "22m ago", "3h ago", "2d ago". */
function age(then: number, now: number): string {
	const minutes = differenceInMinutes(now, then);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = differenceInHours(now, then);
	if (hours < 24) return `${hours}h ago`;
	return `${differenceInDays(now, then)}d ago`;
}

/** "$54" for a whole-dollar Reference price, "$12.18" otherwise. */
function referenceMoney(amount: number): string {
	return Number.isInteger(amount)
		? `$${amount.toLocaleString("en-US")}`
		: formatMoney(amount, "USD");
}

function isTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone });
		return true;
	} catch {
		return false;
	}
}

function wallClock(
	ms: number,
	timeZone: string,
): { hour: number; minute: number; second: number } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
	}).formatToParts(new Date(ms));
	const part = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((p) => p.type === type)?.value ?? 0);
	return { hour: part("hour"), minute: part("minute"), second: part("second") };
}

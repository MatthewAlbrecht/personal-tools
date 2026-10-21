import { millisecondsInHour } from "date-fns/constants";
import type { DealGrade } from "./deals";
import { DEAL_GRADE_LABELS } from "./deals";
import { rarityAbbreviation } from "./deck";
import type { Marketplace } from "./listing-filters";
import { MARKETPLACE_LABELS, formatMoney } from "./listing-format";

// Push notifications: when a deal push may go out, and what it says.
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

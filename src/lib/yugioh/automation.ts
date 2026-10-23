// Automated browser runs: which pages a run visits, and the run rules shared
// by Convex (relative imports only) and the /yugioh UI.
// How the runs are driven: docs/yugioh/automation.md.

import { type RunSlot, dueSlot } from "./run-timing";
import { type Search, ebayEndingSoonUrl } from "./searches";

/** `app`: Run now in Settings; the Mac starts it at its next ask. */
export type RunTrigger = "launchAgent" | "t3" | "manual" | "app";

/**
 * A full run visits every page; a refresh run only the pages of auctions
 * ending in about 20 minutes (ticket 16).
 */
export type RunKind = "full" | "refresh";

/** `challenged`: the run stopped on a check page (a captcha or bot challenge). */
export type RunStatus =
	| "requested"
	| "running"
	| "finished"
	| "failed"
	| "challenged";

export type VisitKind =
	| "ebayNewlyListed"
	| "ebaySold"
	| "ebayEndingSoon"
	| "tcgplayer";

/** The marketplace a visit's page is on. */
export function visitMarketplace(kind: VisitKind): "ebay" | "tcgplayer" {
	return kind === "tcgplayer" ? "tcgplayer" : "ebay";
}

export type PlannedVisit = {
	url: string;
	kind: VisitKind;
	/** The set codes of a Search, or a Printing's Card name and set code. */
	label: string;
};

/**
 * A run still open this long is treated as abandoned (the Mac slept, the
 * script was killed): the next request closes it as failed. Longer than the
 * script's own 3-hour limit, so a live run is never cut short.
 */
export const RUN_ABANDONED_AFTER_MS = 3.5 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

/**
 * An auction's refresh window, before it ends: it opens 28 minutes before
 * (wider than one tick, so some ask always lands in it: 18–28 minutes
 * before, about 23 on average) and closes 17 minutes before, when a visit would no
 * longer land before the push at 15.
 */
export const REFRESH_OPENS_BEFORE_END_MS = 28 * MINUTE_MS;
export const REFRESH_CLOSES_BEFORE_END_MS = 17 * MINUTE_MS;

/**
 * A refresh run also visits every auction ending within this long, so
 * auctions ending close together share one run. An auction seen this close
 * to its end needs no refresh of its own.
 */
export const REFRESH_COALESCE_MS = 45 * MINUTE_MS;

/**
 * No refresh run within this long of the last run asked for: one try per
 * window, so a captcha or a failed page isn't hammered every 10 minutes.
 */
export const REFRESH_MIN_GAP_MS = 15 * MINUTE_MS;

/**
 * After a run stops on a check page (a captcha or bot challenge), no
 * scheduled run of any kind for this long, so one check page doesn't turn
 * into a string of them. Hand runs still start.
 */
export const CHECK_PAGE_COOL_DOWN_MS = 6 * 60 * MINUTE_MS;

/** Whether scheduled runs are still waiting after a run hit a check page. */
export function inCheckPageCoolDown(
	lastCheckPageAt: number | null,
	now: number,
): boolean {
	return (
		lastCheckPageAt !== null && now - lastCheckPageAt < CHECK_PAGE_COOL_DOWN_MS
	);
}

/** A scheduled full run waits up to this long before it starts… */
export const MAX_FULL_START_DELAY_MS = 4 * MINUTE_MS;
/**
 * …and a refresh run up to this long, so its visits still land about 20
 * minutes before the auction ends.
 */
export const MAX_REFRESH_START_DELAY_MS = 90 * 1000;

/**
 * How long `run.sh` waits after asking before it opens Chrome, from a draw
 * in [0, 1], so scheduled runs don't start on the 10-minute marks. The app
 * doesn't hold the run back: an automation profile that's already open
 * claims it at once. T3 Code and hand runs don't wait.
 */
export function startDelay(
	trigger: RunTrigger,
	kind: RunKind,
	draw: number,
): number {
	if (trigger !== "launchAgent") return 0;
	const max =
		kind === "refresh" ? MAX_REFRESH_START_DELAY_MS : MAX_FULL_START_DELAY_MS;
	return Math.round(draw * max);
}

/** A running auction that may want a refresh visit before its push. */
export type EndingAuction = {
	endsAt: number;
	/** When a capture last saw it. */
	lastSeenAt: number;
};

/**
 * The slot of today's plan a scheduled ask runs, as its index (see
 * `dueSlot`), or null. Slots in a check page's 6-hour cool-down are skipped,
 * not made up for, and so is a slot that came due while a full run (of any
 * trigger) was going: that run covered it.
 */
export function scheduledSlot({
	slots,
	lastFullRunEndedAt,
	lastCheckPageAt,
	now,
}: {
	slots: readonly RunSlot[];
	/** When the last full run ended (or was asked for, if still open). */
	lastFullRunEndedAt: number | null;
	lastCheckPageAt: number | null;
	now: number;
}): number | null {
	const coolDownEnd =
		lastCheckPageAt === null ? null : lastCheckPageAt + CHECK_PAGE_COOL_DOWN_MS;
	const notBefore = Math.max(
		coolDownEnd ?? Number.NEGATIVE_INFINITY,
		lastFullRunEndedAt ?? Number.NEGATIVE_INFINITY,
	);
	return dueSlot(slots, Number.isFinite(notBefore) ? notBefore : null, now);
}

/**
 * Which run a scheduled ask starts: a full run when a slot of today's plan
 * is due (`scheduledSlot`), a refresh run when an auction's refresh window is
 * open and it hasn't been seen since, or none. Nothing at all within 6 hours
 * of a run stopping on a check page (`lastCheckPageAt`). `auctions` are the
 * matched, Qualifying auctions on Cards still needed.
 */
export function scheduledRunDue({
	slots,
	lastFullRunEndedAt,
	lastRunAt,
	lastCheckPageAt,
	auctions,
	now,
}: {
	slots: readonly RunSlot[];
	lastFullRunEndedAt: number | null;
	lastRunAt: number | null;
	lastCheckPageAt: number | null;
	auctions: readonly EndingAuction[];
	now: number;
}): RunKind | null {
	if (inCheckPageCoolDown(lastCheckPageAt, now)) return null;
	const slot = scheduledSlot({
		slots,
		lastFullRunEndedAt,
		lastCheckPageAt,
		now,
	});
	if (slot !== null) return "full";
	if (lastRunAt !== null && now - lastRunAt < REFRESH_MIN_GAP_MS) return null;
	const windowOpen = auctions.some(
		(auction) =>
			needsRefresh(auction, now) &&
			auction.endsAt - now <= REFRESH_OPENS_BEFORE_END_MS,
	);
	return windowOpen ? "refresh" : null;
}

/**
 * A scheduled full run visits TCGplayer product pages only when no run
 * that visited any started within this long, so TCGplayer gets about two
 * runs a day (about the first and last slots, 12 hours apart).
 */
export const TCGPLAYER_EVERY_MS = 10 * 60 * MINUTE_MS;

/**
 * Whether a full run visits the TCGplayer product pages, or only the eBay
 * Searches. `lastTcgplayerRunAt`: when the latest run that visited a
 * TCGplayer page was asked for; null when none did lately. T3 Code and
 * hand runs always do.
 */
export function visitsTcgplayer({
	trigger,
	lastTcgplayerRunAt,
	now,
}: {
	trigger: RunTrigger;
	lastTcgplayerRunAt: number | null;
	now: number;
}): boolean {
	if (trigger !== "launchAgent") return true;
	return (
		lastTcgplayerRunAt === null ||
		now - lastTcgplayerRunAt >= TCGPLAYER_EVERY_MS
	);
}

/**
 * The auctions a run starting now refreshes, soonest ending first: those
 * ending within 45 minutes (but not too soon to help) that no capture has
 * seen that close to their end.
 */
export function auctionsToRefresh<A extends EndingAuction>(
	auctions: readonly A[],
	now: number,
): A[] {
	return auctions
		.filter(
			(auction) =>
				needsRefresh(auction, now) &&
				auction.endsAt - now <= REFRESH_COALESCE_MS,
		)
		.sort((a, b) => a.endsAt - b.endsAt);
}

function needsRefresh(auction: EndingAuction, now: number): boolean {
	return (
		auction.endsAt - now > REFRESH_CLOSES_BEFORE_END_MS &&
		auction.lastSeenAt < auction.endsAt - REFRESH_COALESCE_MS
	);
}

/**
 * The refresh pages for auctions (soonest ending first), by the Search
 * holding each one's set code: that Search's running auctions, ending
 * soonest first. One page per Search; set codes no Search holds are skipped.
 */
export function buildRefreshVisits(
	searches: ReadonlyArray<Pick<Search, "setCodes" | "keywords">>,
	setCodes: readonly string[],
): PlannedVisit[] {
	const visits: PlannedVisit[] = [];
	for (const setCode of setCodes) {
		const search = searches.find((s) => s.setCodes.includes(setCode));
		if (!search) continue;
		const url = ebayEndingSoonUrl(search.keywords);
		if (visits.some((visit) => visit.url === url)) continue;
		visits.push({
			url,
			kind: "ebayEndingSoon",
			label: search.setCodes.join(", "),
		});
	}
	return visits;
}

/** At most this many pages a run: well past a full Deck's Searches and products. */
export const MAX_VISITS_PER_RUN = 300;

/**
 * The pages one run visits, in order: the refresh pages, then each
 * Search's Newly Listed page then its Sold page, then each TCGplayer product
 * page. A URL is visited once.
 */
export function buildVisitPlan(
	searches: ReadonlyArray<
		Pick<Search, "setCodes" | "newlyListedUrl" | "soldUrl">
	>,
	products: ReadonlyArray<{
		cardName: string;
		setCode: string;
		productUrl: string;
	}>,
	refreshVisits: readonly PlannedVisit[],
): PlannedVisit[] {
	const visits: PlannedVisit[] = [
		...refreshVisits,
		...searches.flatMap((search): PlannedVisit[] => {
			const label = search.setCodes.join(", ");
			return [
				{ url: search.newlyListedUrl, kind: "ebayNewlyListed", label },
				{ url: search.soldUrl, kind: "ebaySold", label },
			];
		}),
		...products.map(
			(product): PlannedVisit => ({
				url: product.productUrl,
				kind: "tcgplayer",
				label: `${product.cardName} ${product.setCode}`,
			}),
		),
	];
	const seen = new Set<string>();
	return visits
		.filter((visit) => {
			if (seen.has(visit.url)) return false;
			seen.add(visit.url);
			return true;
		})
		.slice(0, MAX_VISITS_PER_RUN);
}

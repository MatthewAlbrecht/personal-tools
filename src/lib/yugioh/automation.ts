// Automated browser runs: which pages a run visits, and the run rules shared
// by Convex (relative imports only) and the /yugioh UI.
// How the runs are driven: docs/yugioh/automation.md.

import { type Search, ebayEndingSoonUrl, searchKeywords } from "./searches";

export type RunTrigger = "launchAgent" | "t3" | "manual";

/**
 * A full run visits every page; a refresh run only the pages of auctions
 * ending in about 20 minutes (ticket 16).
 */
export type RunKind = "full" | "refresh";

export type RunStatus = "requested" | "running" | "finished" | "failed";

export type VisitKind =
	| "ebayNewlyListed"
	| "ebaySold"
	| "ebayEndingSoon"
	| "tcgplayer";

export type PlannedVisit = {
	url: string;
	kind: VisitKind;
	/** The set codes of a Search, or a Printing's Card name and set code. */
	label: string;
};

/**
 * A run still open this long is treated as abandoned (the Mac slept, the
 * script was killed): the next request closes it as failed. Longer than the
 * script's own 90-minute limit, so a live run is never cut short.
 */
export const RUN_ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

/** The LaunchAgent asks the app whether a run is due this often. */
export const SCHEDULE_TICK_MS = 10 * MINUTE_MS;

/** A scheduled full run this often. */
export const FULL_RUN_EVERY_MS = 3 * 60 * MINUTE_MS;

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

/** A running auction that may want a refresh visit before its push. */
export type EndingAuction = {
	endsAt: number;
	/** When a capture last saw it. */
	lastSeenAt: number;
};

/**
 * Which run a scheduled ask starts: a full run 3 hours after the last one,
 * a refresh run when an auction's refresh window is open and it hasn't been
 * seen since, or none. `auctions` are the matched, Qualifying auctions on
 * Cards still needed.
 */
export function scheduledRunDue({
	lastFullRunAt,
	lastRunAt,
	auctions,
	now,
}: {
	lastFullRunAt: number | null;
	lastRunAt: number | null;
	auctions: readonly EndingAuction[];
	now: number;
}): RunKind | null {
	// Half a tick early, so a run asked for a few seconds late still counts.
	if (
		lastFullRunAt === null ||
		now - lastFullRunAt >= FULL_RUN_EVERY_MS - SCHEDULE_TICK_MS / 2
	) {
		return "full";
	}
	if (lastRunAt !== null && now - lastRunAt < REFRESH_MIN_GAP_MS) return null;
	const windowOpen = auctions.some(
		(auction) =>
			needsRefresh(auction, now) &&
			auction.endsAt - now <= REFRESH_OPENS_BEFORE_END_MS,
	);
	return windowOpen ? "refresh" : null;
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
	searches: ReadonlyArray<Pick<Search, "setCodes" | "exclusions">>,
	setCodes: readonly string[],
): PlannedVisit[] {
	const visits: PlannedVisit[] = [];
	for (const setCode of setCodes) {
		const search = searches.find((s) => s.setCodes.includes(setCode));
		if (!search) continue;
		const url = ebayEndingSoonUrl(
			searchKeywords(search.setCodes, search.exclusions),
		);
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

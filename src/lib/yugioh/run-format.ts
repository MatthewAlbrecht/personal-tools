// How automated runs and capture freshness read in the /yugioh UI.

import {
	differenceInDays,
	differenceInHours,
	differenceInMinutes,
	format,
	isToday,
} from "date-fns";
import { millisecondsInHour } from "date-fns/constants";
import {
	CHECK_PAGE_COOL_DOWN_MS,
	type PlannedVisit,
	type RunKind,
	type RunStatus,
	type RunTrigger,
} from "./automation";
import type { Marketplace } from "./listing-filters";
import { MARKETPLACE_LABELS } from "./listing-format";
import {
	FALLBACK_GAP,
	HOURS_IN_WEEK,
	LEARNING_DAYS,
	MAX_FULL_RUN_GAP_MS,
	OVERNIGHT_FROM_HOUR,
	OVERNIGHT_UNTIL_HOUR,
	type RunTiming,
	WEEKDAYS,
	gapWithin,
} from "./run-timing";

/** The Deck header's note shows once the last capture is older than this. */
export const STALE_CAPTURE_HOURS = 6;

/** "Last captured 9h ago" once captures are over 6 hours old; otherwise null. */
export function captureStaleness(
	lastCapturedAt: number | null,
	now: number,
): string | null {
	if (lastCapturedAt === null) return null;
	if (differenceInMinutes(now, lastCapturedAt) <= STALE_CAPTURE_HOURS * 60) {
		return null;
	}
	const hours = differenceInHours(now, lastCapturedAt);
	return hours < 48
		? `Last captured ${hours}h ago`
		: `Last captured ${differenceInDays(now, lastCapturedAt)} days ago`;
}

export type RunSummary = {
	trigger: RunTrigger;
	/** Missing on runs from before refresh runs: those were full runs. */
	kind?: RunKind;
	status: RunStatus;
	requestedAt: number;
	startedAt: number | null;
	endedAt: number | null;
	pagesPlanned: number;
	pagesVisited: number;
	searchPagesVisited: number;
	productPagesVisited: number;
	failedPages: number;
	listingsCaptured: number;
	newListings: number;
	/** Matched running auctions shown with no time left; missing on older runs. */
	auctionsWithoutEndTime?: number;
	error: string | null;
	/** The check page a `challenged` run stopped on; missing on older runs. */
	checkPage?: (PlannedVisit & { marketplace: Marketplace }) | null;
};

export type RunLines = {
	/** "Today, 3:00 PM · Scheduled" */
	when: string;
	/** "Done in 14 min", "Running, 4 of 11 pages", "Failed: …" */
	outcome: string;
	/** "8 Search pages, 3 TCGplayer pages"; null before any page */
	pages: string | null;
	/**
	 * "340 Listings captured, 18 new", plus ", 2 auctions with no end time"
	 * when some had none; null before any page
	 */
	listings: string | null;
	tone: "running" | "done" | "warn" | "failed";
};

const TRIGGER_LABELS: Record<RunTrigger, string> = {
	launchAgent: "Scheduled",
	t3: "From T3 Code",
	manual: "By hand",
};

/** One run as the Settings list shows it. */
export function describeRun(run: RunSummary, now: number): RunLines {
	const start = run.startedAt ?? run.requestedAt;
	const day = isToday(start) ? "Today" : format(start, "MMM d");
	const why =
		run.kind === "refresh"
			? "Before an auction ends"
			: TRIGGER_LABELS[run.trigger];
	const when = `${day}, ${format(start, "h:mm a")} · ${why}`;
	const pages =
		run.pagesVisited === 0
			? null
			: [
					run.searchPagesVisited > 0 &&
						plural(run.searchPagesVisited, "Search page"),
					run.productPagesVisited > 0 &&
						plural(run.productPagesVisited, "TCGplayer page"),
				]
					.filter(Boolean)
					.join(", ");
	const noEndTime = run.auctionsWithoutEndTime ?? 0;
	const listings =
		run.pagesVisited === 0
			? null
			: `${plural(run.listingsCaptured, "Listing")} captured, ${run.newListings} new${
					noEndTime > 0
						? `, ${plural(noEndTime, "auction")} with no end time`
						: ""
				}`;

	if (run.status === "requested") {
		return {
			when,
			outcome: "Waiting for Chrome",
			pages,
			listings,
			tone: "running",
		};
	}
	if (run.status === "running") {
		return {
			when,
			outcome: `Running, ${run.pagesVisited} of ${run.pagesPlanned} pages`,
			pages,
			listings,
			tone: "running",
		};
	}
	if (run.status === "challenged") {
		return {
			when,
			outcome: checkPageOutcome(run, now),
			pages,
			listings,
			tone: "failed",
		};
	}
	if (run.status === "failed") {
		return {
			when,
			outcome: `Failed: ${run.error ?? "no reason given."}`,
			pages,
			listings,
			tone: "failed",
		};
	}
	const took = duration(start, run.endedAt ?? now);
	return run.failedPages > 0
		? {
				when,
				outcome: `Done in ${took}, ${plural(run.failedPages, "page")} failed`,
				pages,
				listings,
				tone: "warn",
			}
		: { when, outcome: `Done in ${took}`, pages, listings, tone: "done" };
}

/**
 * "Stopped on a check page at eBay (RA01-EN008).", plus what to do while
 * scheduled runs still wait after it.
 */
function checkPageOutcome(run: RunSummary, now: number): string {
	const page = run.checkPage;
	if (!page) return run.error ?? "Stopped on a check page.";
	const stopped = `Stopped on a check page at ${MARKETPLACE_LABELS[page.marketplace]} (${page.label}).`;
	const resumesAt = (run.endedAt ?? now) + CHECK_PAGE_COOL_DOWN_MS;
	if (now >= resumesAt) return stopped;
	return `${stopped} Solve it in the automation Chrome profile. Scheduled runs wait until ${format(resumesAt, "h:mm a")}.`;
}

function plural(count: number, one: string): string {
	return `${count} ${count === 1 ? one : `${one}s`}`;
}

function duration(from: number, to: number): string {
	const minutes = Math.max(
		1,
		differenceInMinutes(to, from, { roundingMethod: "round" }),
	);
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export type RunTimingLines = { summary: string; busyTimes: string[] };

/** The middle of the fallback gap, in whole hours. */
const FIXED_HOURS = Math.round(
	gapWithin(FALLBACK_GAP, 0.5) / millisecondsInHour,
);
const OVERNIGHT = `${OVERNIGHT_FROM_HOUR} to ${OVERNIGHT_UNTIL_HOUR} AM`;
const MAX_GAP_HOURS = MAX_FULL_RUN_GAP_MS / millisecondsInHour;

/**
 * When scheduled full runs happen, for Settings: a sentence, and the busy
 * times of the week ("Sun 7–9 PM"), each run of busy hours as one.
 */
export function describeRunTiming(
	timing: RunTiming,
	now: number,
): RunTimingLines {
	if (timing.status === "learning") {
		if (timing.dataSince === null) {
			return {
				summary: `About every ${FIXED_HOURS} hours for now, and not from ${OVERNIGHT}. Once it has about ${LEARNING_DAYS / 7} weeks of Listings, it learns when sellers post and runs around those times.`,
				busyTimes: [],
			};
		}
		const days = differenceInDays(now, timing.dataSince);
		const data =
			days === 0 ? "Under a day" : `${days} ${days === 1 ? "day" : "days"}`;
		return {
			summary: `About every ${FIXED_HOURS} hours for now, and not from ${OVERNIGHT}. Still learning when sellers post: ${data} of data so far, of about ${LEARNING_DAYS}.`,
			busyTimes: [],
		};
	}
	if (timing.busyHours.length === 0) {
		return {
			summary: `About every ${FIXED_HOURS} hours, and not from ${OVERNIGHT}. No hours of the week stand out yet for when sellers post.`,
			busyTimes: [],
		};
	}
	return {
		summary: `Sellers post most at these times (${zoneName(timing.timeZone)} time). It runs about every hour during them and the hour after, and at least every ${MAX_GAP_HOURS} hours otherwise, but not from ${OVERNIGHT}.`,
		busyTimes: busyStretches(timing.busyHours).map(stretchLabel),
	};
}

/** "America/New_York" reads "New York". */
function zoneName(timeZone: string): string {
	return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
}

/**
 * Busy hours as stretches of consecutive hours: each its first hour and how
 * many. A stretch running past Saturday midnight joins the one from Sunday
 * midnight.
 */
function busyStretches(
	busyHours: readonly number[],
): Array<{ start: number; hours: number }> {
	const busy = new Set(busyHours);
	if (busy.size === HOURS_IN_WEEK) return [{ start: 0, hours: HOURS_IN_WEEK }];
	const stretches: Array<{ start: number; hours: number }> = [];
	for (const hour of [...busy].sort((a, b) => a - b)) {
		const previous = (hour + HOURS_IN_WEEK - 1) % HOURS_IN_WEEK;
		if (busy.has(previous)) continue;
		let hours = 1;
		while (busy.has((hour + hours) % HOURS_IN_WEEK)) hours++;
		stretches.push({ start: hour, hours });
	}
	return stretches;
}

/** "Sun 7–9 PM", "Mon 11 AM–1 PM", "Sat 11 PM–1 AM". */
function stretchLabel({
	start,
	hours,
}: { start: number; hours: number }): string {
	const day = WEEKDAYS[Math.floor(start / 24)];
	const from = start % 24;
	const to = (from + hours) % 24;
	const sameHalf = hours < 12 && from < 12 === to < 12 && to > from;
	return `${day} ${clockHour(from, sameHalf ? "h" : "h a")}–${clockHour(to, "h a")}`;
}

/** An hour of the day on the clock: 19 reads "7 PM" ("h a") or "7" ("h"). */
function clockHour(hour: number, pattern: "h" | "h a"): string {
	return format(new Date(2000, 0, 1, hour), pattern);
}

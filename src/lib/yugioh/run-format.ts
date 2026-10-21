// How automated runs and capture freshness read in the /yugioh UI.

import {
	differenceInDays,
	differenceInHours,
	differenceInMinutes,
	format,
	isToday,
} from "date-fns";
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
	FIRST_SLOT_FROM_MINUTES,
	FIRST_SLOT_UNTIL_MINUTES,
	type RunDay,
	type RunSlotStatus,
	SLOTS_PER_DAY,
	SLOT_GAP_MINUTES,
	localDate,
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

export type RunDayLines = { summary: string; slots: string[] };

const SCHEDULE = `About ${SLOTS_PER_DAY} times a day, ${SLOT_GAP_MINUTES / 60} hours apart, from between ${FIRST_SLOT_FROM_MINUTES / 60} and ${FIRST_SLOT_UNTIL_MINUTES / 60} AM`;
const AFTER_SCHEDULE =
	"Some days skip one. TCGplayer pages are visited about twice a day.";

const SLOT_NOTES: Record<RunSlotStatus, string | null> = {
	planned: null,
	ran: "ran",
	skipped: "skipped",
	passed: "missed",
};

/**
 * When scheduled full runs happen, for Settings: a sentence, and today's
 * slots ("7:12 AM, ran") once today's plan is drawn, in its time zone.
 */
export function describeRunDay(day: RunDay | null, now: number): RunDayLines {
	if (day === null) {
		return { summary: `${SCHEDULE}. ${AFTER_SCHEDULE}`, slots: [] };
	}
	const summary = `${SCHEDULE} (${zoneName(day.timeZone)} time). ${AFTER_SCHEDULE}`;
	if (day.date !== localDate(now, day.timeZone)) return { summary, slots: [] };
	const clock = new Intl.DateTimeFormat("en-US", {
		timeZone: day.timeZone,
		hour: "numeric",
		minute: "2-digit",
	});
	return {
		summary,
		slots: day.slots.map((slot) => {
			const time = clock.format(slot.at);
			const note = SLOT_NOTES[slot.status];
			return note === null ? time : `${time}, ${note}`;
		}),
	};
}

/** "America/New_York" reads "New York". */
function zoneName(timeZone: string): string {
	return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
}

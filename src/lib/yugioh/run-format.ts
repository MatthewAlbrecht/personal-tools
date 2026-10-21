// How automated runs and capture freshness read in the /yugioh UI.

import {
	differenceInDays,
	differenceInHours,
	differenceInMinutes,
	format,
	isToday,
} from "date-fns";
import type { RunStatus, RunTrigger } from "./automation";

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
	error: string | null;
};

export type RunLines = {
	/** "Today, 3:00 PM · Scheduled" */
	when: string;
	/** "Done in 14 min", "Running, 4 of 11 pages", "Failed: …" */
	outcome: string;
	/** "8 Search pages, 3 TCGplayer pages"; null before any page */
	pages: string | null;
	/** "340 Listings captured, 18 new"; null before any page */
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
	const when = `${day}, ${format(start, "h:mm a")} · ${TRIGGER_LABELS[run.trigger]}`;
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
	const listings =
		run.pagesVisited === 0
			? null
			: `${plural(run.listingsCaptured, "Listing")} captured, ${run.newListings} new`;

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

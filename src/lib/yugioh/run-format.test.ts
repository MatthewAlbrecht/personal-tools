import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { captureStaleness, describeRun, describeRunDay } from "./run-format";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// Tue Oct 20 2026, 15:00 local time.
const NOW = new Date(2026, 9, 20, 15, 0).getTime();

// "Today" is relative to the clock, so the clock is NOW.
beforeAll(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterAll(() => {
	vi.useRealTimers();
});

const finished = {
	trigger: "launchAgent" as const,
	status: "finished" as const,
	requestedAt: NOW - 20 * MINUTE,
	startedAt: NOW - 19 * MINUTE,
	endedAt: NOW - 5 * MINUTE,
	pagesPlanned: 11,
	pagesVisited: 11,
	searchPagesVisited: 8,
	productPagesVisited: 3,
	failedPages: 0,
	listingsCaptured: 340,
	newListings: 18,
	error: null,
};

describe("last captured", () => {
	test("says nothing within 6 hours of a capture", () => {
		expect(captureStaleness(NOW - 6 * HOUR, NOW)).toBe(null);
	});

	test("says how long ago once it's been longer", () => {
		expect(captureStaleness(NOW - 9 * HOUR, NOW)).toBe("Last captured 9h ago");
		expect(captureStaleness(NOW - 50 * HOUR, NOW)).toBe(
			"Last captured 2 days ago",
		);
	});

	test("says nothing before the first capture", () => {
		expect(captureStaleness(null, NOW)).toBe(null);
	});
});

describe("a run in the list", () => {
	test("a finished run: when, how long, pages and Listings", () => {
		expect(describeRun(finished, NOW)).toEqual({
			when: "Today, 2:41 PM · Scheduled",
			outcome: "Done in 14 min",
			pages: "8 Search pages, 3 TCGplayer pages",
			listings: "340 Listings captured, 18 new",
			tone: "done",
		});
	});

	test("a refresh run says it ran before an auction ends", () => {
		expect(
			describeRun(
				{
					...finished,
					kind: "refresh",
					pagesPlanned: 1,
					pagesVisited: 1,
					searchPagesVisited: 1,
					productPagesVisited: 0,
				},
				NOW,
			),
		).toMatchObject({
			when: "Today, 2:41 PM · Before an auction ends",
			pages: "1 Search page",
		});
	});

	test("a run counts the matched auctions it found no end time for", () => {
		expect(
			describeRun({ ...finished, auctionsWithoutEndTime: 2 }, NOW).listings,
		).toBe("340 Listings captured, 18 new, 2 auctions with no end time");
		expect(
			describeRun({ ...finished, auctionsWithoutEndTime: 1 }, NOW).listings,
		).toBe("340 Listings captured, 18 new, 1 auction with no end time");
	});

	test("says nothing about end times when every auction had one, or before it was counted", () => {
		expect(
			describeRun({ ...finished, auctionsWithoutEndTime: 0 }, NOW).listings,
		).toBe("340 Listings captured, 18 new");
		expect(describeRun(finished, NOW).listings).toBe(
			"340 Listings captured, 18 new",
		);
	});

	test("a finished run with failed pages says how many", () => {
		expect(
			describeRun({ ...finished, failedPages: 2, trigger: "t3" }, NOW),
		).toMatchObject({
			when: "Today, 2:41 PM · From T3 Code",
			outcome: "Done in 14 min, 2 pages failed",
			tone: "warn",
		});
	});

	test("a running run counts its pages so far", () => {
		expect(
			describeRun(
				{
					...finished,
					status: "running",
					endedAt: null,
					pagesVisited: 4,
					searchPagesVisited: 4,
					productPagesVisited: 0,
					listingsCaptured: 120,
					newListings: 1,
					trigger: "manual",
				},
				NOW,
			),
		).toEqual({
			when: "Today, 2:41 PM · By hand",
			outcome: "Running, 4 of 11 pages",
			pages: "4 Search pages",
			listings: "120 Listings captured, 1 new",
			tone: "running",
		});
	});

	test("a run Chrome hasn't started yet", () => {
		expect(
			describeRun(
				{
					...finished,
					status: "requested",
					startedAt: null,
					endedAt: null,
					pagesPlanned: 0,
					pagesVisited: 0,
					searchPagesVisited: 0,
					productPagesVisited: 0,
					listingsCaptured: 0,
					newListings: 0,
				},
				NOW,
			),
		).toEqual({
			when: "Today, 2:40 PM · Scheduled",
			outcome: "Waiting for Chrome",
			pages: null,
			listings: null,
			tone: "running",
		});
	});

	test("a failed run on an earlier day gives its reason", () => {
		expect(
			describeRun(
				{
					...finished,
					status: "failed",
					requestedAt: NOW - 30 * HOUR,
					startedAt: null,
					endedAt: NOW - 30 * HOUR + 3 * MINUTE,
					pagesPlanned: 0,
					pagesVisited: 0,
					searchPagesVisited: 0,
					productPagesVisited: 0,
					listingsCaptured: 0,
					newListings: 0,
					error: "The extension didn't start the run within 3 minutes.",
				},
				NOW,
			),
		).toEqual({
			when: "Oct 19, 9:00 AM · Scheduled",
			outcome: "Failed: The extension didn't start the run within 3 minutes.",
			pages: null,
			listings: null,
			tone: "failed",
		});
	});

	const stopped = {
		...finished,
		status: "challenged" as const,
		endedAt: NOW - 10 * MINUTE,
		pagesVisited: 3,
		searchPagesVisited: 3,
		productPagesVisited: 0,
		failedPages: 1,
		error: "Stopped on a check page at eBay.",
		checkPage: {
			marketplace: "ebay" as const,
			url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
			kind: "ebayNewlyListed" as const,
			label: "RA01-EN008",
		},
	};

	test("a run stopped on a check page says where, and when scheduled runs resume", () => {
		expect(describeRun(stopped, NOW)).toEqual({
			when: "Today, 2:41 PM · Scheduled",
			outcome:
				"Stopped on a check page at eBay (RA01-EN008). Solve it in the automation Chrome profile. Scheduled runs wait until 8:50 PM.",
			pages: "3 Search pages",
			listings: "340 Listings captured, 18 new",
			tone: "failed",
		});
	});

	test("once scheduled runs resume, it only says where it stopped", () => {
		expect(describeRun(stopped, NOW + 7 * HOUR).outcome).toBe(
			"Stopped on a check page at eBay (RA01-EN008).",
		);
	});
});

describe("the run schedule", () => {
	const ZONE = "America/New_York";
	/** A time on Wednesday 21 October 2026 in New York (EDT, UTC-4). */
	function wednesday(hour: number, minute = 0): number {
		return Date.UTC(2026, 9, 21, hour + 4, minute);
	}
	const today = {
		date: "2026-10-21",
		timeZone: ZONE,
		slots: [
			{ at: wednesday(7, 12), status: "ran" as const },
			{ at: wednesday(11, 5), status: "skipped" as const },
			{ at: wednesday(15, 2), status: "planned" as const },
			{ at: wednesday(18, 57), status: "planned" as const },
		],
	};
	const SUMMARY =
		"About 4 times a day, 4 hours apart, from between 6 and 9 AM (New York time). Some days skip one. TCGplayer pages are visited about twice a day.";

	test("names today's slots in my time zone, and what became of each", () => {
		expect(describeRunDay(today, wednesday(12))).toEqual({
			summary: SUMMARY,
			slots: ["7:12 AM, ran", "11:05 AM, skipped", "3:02 PM", "6:57 PM"],
		});
	});

	test("a slot missed and folded into a later run reads missed", () => {
		const missed = {
			...today,
			slots: today.slots.map((slot, index) =>
				index === 0 ? { ...slot, status: "passed" as const } : slot,
			),
		};
		expect(describeRunDay(missed, wednesday(12)).slots[0]).toBe(
			"7:12 AM, missed",
		);
	});

	test("before today's plan is drawn, only the summary", () => {
		expect(describeRunDay(today, wednesday(24, 10))).toEqual({
			summary: SUMMARY,
			slots: [],
		});
		expect(describeRunDay(null, wednesday(12))).toEqual({
			summary:
				"About 4 times a day, 4 hours apart, from between 6 and 9 AM. Some days skip one. TCGplayer pages are visited about twice a day.",
			slots: [],
		});
	});
});

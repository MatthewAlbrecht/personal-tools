import { describe, expect, test } from "vitest";
import { captureStaleness, describeRun } from "./run-format";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// Tue Oct 20 2026, 15:00 local time.
const NOW = new Date(2026, 9, 20, 15, 0).getTime();

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
});

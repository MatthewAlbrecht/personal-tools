import type { Infer } from "convex/values";
import {
	CHECK_PAGE_COOL_DOWN_MS,
	type EndingAuction,
	MAX_VISITS_PER_RUN,
	type PlannedVisit,
	REFRESH_CLOSES_BEFORE_END_MS,
	REFRESH_COALESCE_MS,
	RUN_ABANDONED_AFTER_MS,
	type RunKind,
	type RunTrigger,
	auctionsToRefresh,
	buildRefreshVisits,
	buildVisitPlan,
	inCheckPageCoolDown,
	scheduledRunDue,
	startDelay,
	visitMarketplace,
} from "../../../src/lib/yugioh/automation";
import { MARKETPLACE_LABELS } from "../../../src/lib/yugioh/listing-format";
import {
	buildDeckSearches,
	searchedCandidates,
} from "../../../src/lib/yugioh/searches";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { matchedPrintingId } from "./deals";
import { MAX_DECKS, readDeck } from "./decks";
import { awaitsAuctionPush, queueCheckPagePush } from "./pushes";
import { readRunTiming, relearnRunTiming } from "./runTiming";
import type { yugiohLastCheckPageValidator } from "./validators";

/** How many failed pages a run keeps on itself for the runs list. */
export const MAX_PAGE_ERRORS_SHOWN = 20;

/** How many runs the app lists. */
export const MAX_RUNS_SHOWN = 20;

/**
 * How many recent runs a scheduled ask looks through for the last full run:
 * more than the refresh runs that fit between two full runs.
 */
const RECENT_RUNS_READ = 50;

/**
 * The gap draw for a full run that has none (from before ticket 19): the
 * 3 hours of the fixed schedule while learning.
 */
const LEGACY_GAP_DRAW = 0.4;

/** Most auctions ending in the next 45 minutes read for refresh visits. */
const MAX_ENDING_AUCTIONS = 100;

/**
 * A run asked for (or the one already open), with its kind; `runId` and
 * `kind` are null when a scheduled ask finds nothing due. `lastCheckPage`
 * is set while scheduled runs wait after a run stopped on a check page.
 * `startDelayMs`: how long the script waits before opening Chrome for a new
 * run (0 unless a new scheduled run).
 */
export type RunRequest = {
	runId: Id<"yugiohAutomationRuns"> | null;
	alreadyOpen: boolean;
	kind: RunKind | null;
	lastCheckPage: LastCheckPage | null;
	startDelayMs: number;
};

export type LastCheckPage = Infer<typeof yugiohLastCheckPageValidator>;

export type ClaimedRun = {
	runId: Id<"yugiohAutomationRuns">;
	visits: PlannedVisit[];
};

export type VisitReport = PlannedVisit & {
	listingsCaptured: number;
	newListings: number;
	auctionsWithoutEndTime?: number;
	error: string | null;
	/** A check page: the run stops here. */
	challenged?: boolean;
};

const OPEN_STATUSES = ["requested", "running"] as const;

/**
 * Asks for a run. While one is still open (asked for or running) it's
 * returned instead, so two triggers never run at once. An open run older than
 * RUN_ABANDONED_AFTER_MS is closed as failed first.
 *
 * T3 Code and hand runs are always full runs. The LaunchAgent asks every 10
 * minutes and gets a full run when the run timing says one is due (every 3
 * hours until posting times are learned), a refresh run when an auction
 * awaiting its push ends in about 20 minutes, or nothing.
 *
 * For 6 hours after a run stopped on a check page, the LaunchAgent gets no
 * run. Hand and T3 Code runs (started with "Run now") still start, and the
 * reply says where the last run stopped.
 *
 * A new scheduled run comes with a random start delay (`startDelay`), so
 * runs don't start on the 10-minute marks. Draws come from Math.random.
 */
export async function requestRun(
	ctx: MutationCtx,
	trigger: RunTrigger,
	now: number,
): Promise<RunRequest> {
	const lastCheckPage = await readLastCheckPage(ctx, now);
	for (const status of OPEN_STATUSES) {
		const open = await ctx.db
			.query("yugiohAutomationRuns")
			.withIndex("by_status", (q) => q.eq("status", status))
			.take(10);
		for (const run of open) {
			if (now - (run.startedAt ?? run.requestedAt) < RUN_ABANDONED_AFTER_MS) {
				return {
					runId: run._id,
					alreadyOpen: true,
					kind: runKind(run),
					lastCheckPage,
					startDelayMs: 0,
				};
			}
			await ctx.db.patch("yugiohAutomationRuns", run._id, {
				status: "failed",
				endedAt: now,
				error: "Didn't finish. Closed when the next run was asked for.",
				...nextGapDraw(run),
			});
		}
	}
	const kind =
		trigger === "launchAgent"
			? await scheduledRun(ctx, lastCheckPage, now)
			: "full";
	if (kind === null) {
		return {
			runId: null,
			alreadyOpen: false,
			kind: null,
			lastCheckPage,
			startDelayMs: 0,
		};
	}
	const runId = await ctx.db.insert("yugiohAutomationRuns", {
		trigger,
		kind,
		status: "requested",
		requestedAt: now,
		startedAt: null,
		endedAt: null,
		pagesPlanned: 0,
		pagesVisited: 0,
		searchPagesVisited: 0,
		productPagesVisited: 0,
		failedPages: 0,
		listingsCaptured: 0,
		newListings: 0,
		auctionsWithoutEndTime: 0,
		error: null,
		pageErrors: [],
		checkPage: null,
	});
	return {
		runId,
		alreadyOpen: false,
		kind,
		lastCheckPage,
		startDelayMs: startDelay(trigger, kind, Math.random()),
	};
}

/**
 * The last run that stopped on a check page, while scheduled runs still wait
 * after it; null otherwise.
 */
async function readLastCheckPage(
	ctx: QueryCtx,
	now: number,
): Promise<LastCheckPage | null> {
	const run = await ctx.db
		.query("yugiohAutomationRuns")
		.withIndex("by_status", (q) => q.eq("status", "challenged"))
		.order("desc")
		.first();
	const at = run?.endedAt ?? null;
	if (!run?.checkPage || at === null || !inCheckPageCoolDown(at, now)) {
		return null;
	}
	return {
		marketplace: run.checkPage.marketplace,
		at,
		coolDownEndsAt: at + CHECK_PAGE_COOL_DOWN_MS,
	};
}

/** Which run a scheduled ask starts now, if any. */
async function scheduledRun(
	ctx: QueryCtx,
	lastCheckPage: LastCheckPage | null,
	now: number,
): Promise<RunKind | null> {
	const recent = await ctx.db
		.query("yugiohAutomationRuns")
		.order("desc")
		.take(RECENT_RUNS_READ);
	const lastFull = recent.find((run) => runKind(run) === "full");
	return scheduledRunDue({
		lastFullRunAt: lastFull?.requestedAt ?? null,
		lastRunAt: recent[0]?.requestedAt ?? null,
		lastCheckPageAt: lastCheckPage?.at ?? null,
		gapDraw: lastFull?.gapDraw ?? LEGACY_GAP_DRAW,
		auctions: await readEndingAuctions(ctx, now),
		timing: await readRunTiming(ctx),
		now,
	});
}

type EndingAuctionWithSetCode = EndingAuction & { setCode: string };

/**
 * Running eBay auctions ending in the next 45 minutes (but not within 17)
 * that will get an auction push, with their matched Printing's set code.
 */
async function readEndingAuctions(
	ctx: QueryCtx,
	now: number,
): Promise<EndingAuctionWithSetCode[]> {
	const ending = await ctx.db
		.query("yugiohListings")
		.withIndex("by_marketplace_and_saleAt", (q) =>
			q
				.eq("marketplace", "ebay")
				.gt("saleAt", now + REFRESH_CLOSES_BEFORE_END_MS)
				.lte("saleAt", now + REFRESH_COALESCE_MS),
		)
		.take(MAX_ENDING_AUCTIONS);
	const auctions: EndingAuctionWithSetCode[] = [];
	for (const listing of ending) {
		if (listing.endsAt === null) continue;
		if (!(await awaitsAuctionPush(ctx, listing, now))) continue;
		const printingId = matchedPrintingId(listing);
		const printing =
			printingId === null
				? null
				: await ctx.db.get("yugiohPrintings", printingId);
		if (!printing) continue;
		auctions.push({
			endsAt: listing.endsAt,
			lastSeenAt: listing.lastSeenAt,
			setCode: printing.setCode,
		});
	}
	return auctions;
}

/**
 * The extension takes the oldest run asked for and gets its visit plan, or
 * null when there's none. A run is claimed once.
 */
export async function claimRun(
	ctx: MutationCtx,
	now: number,
): Promise<ClaimedRun | null> {
	const run = await ctx.db
		.query("yugiohAutomationRuns")
		.withIndex("by_status", (q) => q.eq("status", "requested"))
		.first();
	if (!run) return null;
	// The auctions to refresh are those of the ask, not the claim: a
	// scheduled run's start delay must not push one under 17 minutes.
	const visits = await readVisitPlan(ctx, runKind(run), run.requestedAt);
	await ctx.db.patch("yugiohAutomationRuns", run._id, {
		status: "running",
		startedAt: now,
		pagesPlanned: visits.length,
	});
	return { runId: run._id, visits };
}

/**
 * The pages a run visits, across all Decks. First the refresh pages of
 * auctions ending within 45 minutes of `now` that await their push. Then, for a
 * full run, the Searches packed from every Card's searched Printings (as the
 * Searches tab packs one Deck's), then the TCGplayer product page of each of
 * those Printings that has one.
 */
export async function readVisitPlan(
	ctx: QueryCtx,
	kind: RunKind,
	now: number,
): Promise<PlannedVisit[]> {
	const decks = await ctx.db.query("yugiohDecks").take(MAX_DECKS);
	const views = await Promise.all(decks.map((deck) => readDeck(ctx, deck._id)));
	const cards = views.flatMap(
		(deck) => deck?.sections.flatMap((section) => section.cards) ?? [],
	);
	const products = new Map<
		string,
		{ cardName: string; setCode: string; productUrl: string }
	>();
	for (const card of cards) {
		for (const candidate of searchedCandidates(card)) {
			const productUrl = candidate.tcgplayer.productUrl;
			if (productUrl === null || products.has(candidate.printingId)) continue;
			products.set(candidate.printingId, {
				cardName: card.cardName,
				setCode: candidate.setCode,
				productUrl,
			});
		}
	}
	const byName = [...products.values()].sort(
		(a, b) =>
			a.cardName.localeCompare(b.cardName) ||
			a.setCode.localeCompare(b.setCode),
	);
	const searches = buildDeckSearches(cards);
	const refresh = buildRefreshVisits(
		searches,
		auctionsToRefresh(await readEndingAuctions(ctx, now), now).map(
			(auction) => auction.setCode,
		),
	);
	return kind === "full"
		? buildVisitPlan(searches, byName, refresh)
		: refresh.slice(0, MAX_VISITS_PER_RUN);
}

/**
 * Records one visited page on a running run and adds it to the run's totals.
 * Returns whether the run is still running. A report for a run that isn't
 * (the script gave up on it) is dropped, and the extension stops. A check
 * page ends the run there (`stopOnCheckPage`).
 */
export async function recordVisit(
	ctx: MutationCtx,
	runId: Id<"yugiohAutomationRuns">,
	visit: VisitReport,
	now: number,
): Promise<boolean> {
	const run = await ctx.db.get("yugiohAutomationRuns", runId);
	if (!run || run.status !== "running") return false;
	// More reports than any plan has pages: stop the extension.
	if (run.pagesVisited >= MAX_VISITS_PER_RUN) return false;
	await ctx.db.insert("yugiohAutomationVisits", {
		runId,
		visitedAt: now,
		...visit,
	});
	const isSearch = visit.kind !== "tcgplayer";
	await ctx.db.patch("yugiohAutomationRuns", runId, {
		pagesVisited: run.pagesVisited + 1,
		searchPagesVisited: run.searchPagesVisited + (isSearch ? 1 : 0),
		productPagesVisited: run.productPagesVisited + (isSearch ? 0 : 1),
		failedPages: run.failedPages + (visit.error === null ? 0 : 1),
		listingsCaptured: run.listingsCaptured + visit.listingsCaptured,
		newListings: run.newListings + visit.newListings,
		auctionsWithoutEndTime:
			(run.auctionsWithoutEndTime ?? 0) + (visit.auctionsWithoutEndTime ?? 0),
		pageErrors:
			visit.error === null || run.pageErrors.length >= MAX_PAGE_ERRORS_SHOWN
				? run.pageErrors
				: [
						...run.pageErrors,
						{ kind: visit.kind, label: visit.label, error: visit.error },
					],
	});
	if (visit.challenged) {
		await stopOnCheckPage(ctx, run, visit, now);
		return false;
	}
	return true;
}

/**
 * Ends a run on the check page it hit: `challenged`, with the page, and a
 * push to go and solve it. Scheduled runs then wait 6 hours.
 */
async function stopOnCheckPage(
	ctx: MutationCtx,
	run: Doc<"yugiohAutomationRuns">,
	visit: PlannedVisit,
	now: number,
): Promise<void> {
	const marketplace = visitMarketplace(visit.kind);
	await ctx.db.patch("yugiohAutomationRuns", run._id, {
		status: "challenged",
		endedAt: now,
		error: `Stopped on a check page at ${MARKETPLACE_LABELS[marketplace]}.`,
		checkPage: {
			marketplace,
			url: visit.url,
			kind: visit.kind,
			label: visit.label,
		},
		...nextGapDraw(run),
	});
	await queueCheckPagePush(ctx, run._id, marketplace, now);
	if (runKind(run) === "full") await relearnRunTiming(ctx, now);
}

/**
 * Ends a run: finished, or failed with `error`. A run that was never claimed
 * can't finish, so it fails. Ending an ended run changes nothing. A full run
 * ending relearns the run timing from what it captured.
 */
export async function finishRun(
	ctx: MutationCtx,
	runId: Id<"yugiohAutomationRuns">,
	error: string | null,
	now: number,
): Promise<void> {
	const run = await ctx.db.get("yugiohAutomationRuns", runId);
	if (!run || !OPEN_STATUSES.some((status) => status === run.status)) return;
	const failure =
		error ?? (run.status === "requested" ? "The run never started." : null);
	await ctx.db.patch("yugiohAutomationRuns", runId, {
		status: failure === null ? "finished" : "failed",
		endedAt: now,
		error: failure,
		...nextGapDraw(run),
	});
	if (runKind(run) === "full") await relearnRunTiming(ctx, now);
}

/**
 * A full run that ends draws where the gap to the next scheduled full run
 * falls, stored on it so every ask until then gets the same answer.
 */
function nextGapDraw(run: Doc<"yugiohAutomationRuns">): { gapDraw?: number } {
	return runKind(run) === "full" ? { gapDraw: Math.random() } : {};
}

/** Runs from before refresh runs have no kind: they were all full runs. */
function runKind(run: Doc<"yugiohAutomationRuns">): RunKind {
	return run.kind ?? "full";
}

export type RunView = Omit<Doc<"yugiohAutomationRuns">, "_creationTime">;

function runView(run: Doc<"yugiohAutomationRuns">): RunView {
	const { _creationTime: _, ...view } = run;
	return view;
}

/** One run, for the script waiting on it; null when there's no such run. */
export async function readRun(
	ctx: QueryCtx,
	runId: Id<"yugiohAutomationRuns">,
): Promise<RunView | null> {
	const run = await ctx.db.get("yugiohAutomationRuns", runId);
	return run ? runView(run) : null;
}

/** The latest runs, newest first. */
export async function listRuns(ctx: QueryCtx): Promise<RunView[]> {
	const runs = await ctx.db
		.query("yugiohAutomationRuns")
		.order("desc")
		.take(MAX_RUNS_SHOWN);
	return runs.map(runView);
}

/** When any capture (automated or by hand) last saw a Listing; null before any. */
export async function readLastCapturedAt(
	ctx: QueryCtx,
): Promise<number | null> {
	const latest = await ctx.db
		.query("yugiohListings")
		.withIndex("by_lastSeenAt")
		.order("desc")
		.first();
	return latest?.lastSeenAt ?? null;
}

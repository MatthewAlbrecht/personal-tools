# RYM Scrape Spotify Album Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new or refreshed RYM scrape attempt to link against canonical Spotify albums, and add a manual bounded backfill for existing scrapes.

**Architecture:** The existing code already writes generic links to `rateYourMusicSpotifyAlbumLinks`, and `upsertRateYourMusicScrape` already calls a misleadingly named `matchForLaterAlbumsForRymScrape` helper. This plan makes that scrape-to-Spotify matching explicit as `matchRymScrapeToSpotifyAlbums`, adds a summary return shape, keeps a backwards-compatible wrapper for existing For Later-oriented tests, wires the scrape ingest path to the explicit helper, and adds a manual backfill mutation. No new branch or worktree should be created; work on the current branch/worktree only.

**Tech Stack:** Convex mutations/queries, TypeScript, Node test runner via `tsx`, existing RYM/Spotify matching helpers.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `convex/_utils/albumMatching.ts` | Modify | Add explicit scrape-to-Spotify matcher, summary type, and keep old helper as wrapper |
| `convex/_utils/albumMatching.test.ts` | Modify | Add export/source-level coverage for the explicit matcher |
| `convex/rateYourMusicScrapes.ts` | Modify | Use explicit matcher in scrape upsert; add manual bounded backfill mutation |
| `convex/rateYourMusicScrapes.matching-source.test.ts` | Create | Source-level test proving scrape upsert and backfill call the explicit matcher |

---

## Task 1: Explicit Scrape-To-Spotify Matcher

**Files:**
- Modify: `convex/_utils/albumMatching.ts`
- Modify: `convex/_utils/albumMatching.test.ts`

- [ ] **Step 1: Add failing export test**

Add this import and test to `convex/_utils/albumMatching.test.ts`:

```ts
import {
	matchForLaterAlbumsForRymScrape,
	matchRymForForLaterAlbum,
	matchRymForSpotifyAlbum,
	matchRymScrapeToSpotifyAlbums,
} from "./albumMatching";

test("albumMatching exports the explicit RYM scrape to Spotify albums matcher", () => {
	assert.equal(typeof matchRymScrapeToSpotifyAlbums, "function");
});
```

Keep the existing `matchForLaterAlbumsForRymScrape` export test; this preserves compatibility while the new name becomes the primary API.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumMatching.test.ts
```

Expected: FAIL because `matchRymScrapeToSpotifyAlbums` is not exported yet.

- [ ] **Step 3: Add explicit helper and summary type**

In `convex/_utils/albumMatching.ts`, add:

```ts
export type RymScrapeSpotifyAlbumMatchSummary = {
	scrapeId: Id<"rateYourMusicScrapes">;
	checkedAlbums: number;
	linkedAlbums: number;
	skippedAlreadyLinked: number;
};
```

Then replace the body of the existing `matchForLaterAlbumsForRymScrape` with a wrapper around a new helper:

```ts
export async function matchRymScrapeToSpotifyAlbums(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		spotifyAlbumId?: string;
		albumTitle: string;
		artists: Array<{ name: string }>;
		now: number;
		limit?: number;
	},
): Promise<RymScrapeSpotifyAlbumMatchSummary> {
	const limit = Math.min(Math.max(args.limit ?? 1024, 1), 5000);
	const summary: RymScrapeSpotifyAlbumMatchSummary = {
		scrapeId: args.scrapeId,
		checkedAlbums: 0,
		linkedAlbums: 0,
		skippedAlreadyLinked: 0,
	};

	const existingLinks = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", args.scrapeId))
		.collect();
	const linkedAlbumIds = new Set(existingLinks.map((link) => link.albumId));

	if (args.spotifyAlbumId) {
		const spotifyAlbumId = args.spotifyAlbumId;
		const album = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", spotifyAlbumId),
			)
			.first();

		if (!album) return summary;
		summary.checkedAlbums += 1;

		if (linkedAlbumIds.has(album._id)) {
			summary.skippedAlreadyLinked += 1;
			return summary;
		}

		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: args.scrapeId,
			albumId: album._id,
			spotifyAlbumId,
			method: "spotify_id",
			now: args.now,
		});
		await patchScrapeAlbumConvexId(ctx, args.scrapeId, album._id);
		summary.linkedAlbums += 1;
		return summary;
	}

	const albumTitleKey = normalizeAlbumTitle(args.albumTitle);
	const rymArtistKeys = buildArtistKeys(
		args.artists.map((artist) => artist.name),
	);

	const albums = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_createdAt")
		.order("desc")
		.take(limit);

	const matchedCanonical: Array<{
		album: Doc<"spotifyAlbums">;
		matchedArtistKey: string;
	}> = [];

	for (const album of albums) {
		summary.checkedAlbums += 1;
		if (normalizeAlbumTitle(album.name) !== albumTitleKey) {
			continue;
		}
		const matchedArtistKey = artistKeysIntersect(
			canonicalAlbumArtistKeys(album),
			rymArtistKeys,
		);
		if (matchedArtistKey) {
			matchedCanonical.push({ album, matchedArtistKey });
		}
	}

	if (matchedCanonical.length !== 1) return summary;

	const match = matchedCanonical[0];
	if (!match) return summary;

	if (linkedAlbumIds.has(match.album._id)) {
		summary.skippedAlreadyLinked += 1;
		return summary;
	}

	await upsertRymSpotifyAlbumLink(ctx, {
		scrapeId: args.scrapeId,
		albumId: match.album._id,
		spotifyAlbumId: match.album.spotifyAlbumId,
		method: "title_artist",
		matchedArtistKey: match.matchedArtistKey,
		now: args.now,
	});
	await patchScrapeAlbumConvexId(ctx, args.scrapeId, match.album._id);
	summary.linkedAlbums += 1;

	return summary;
}

export async function matchForLaterAlbumsForRymScrape(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		spotifyAlbumId?: string;
		albumTitle: string;
		artists: Array<{ name: string }>;
		now: number;
	},
): Promise<number> {
	const summary = await matchRymScrapeToSpotifyAlbums(ctx, args);
	return summary.linkedAlbums;
}
```

Important behavior:
- The old helper remains exported and returns `number`.
- The new helper returns structured summary data.
- Matching remains conservative: one title/artist match only.
- Existing links for the same scrape/album are skipped, not duplicated.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumMatching.test.ts
```

Expected: PASS.

---

## Task 2: Wire Scrape Ingest To Explicit Matcher

**Files:**
- Modify: `convex/rateYourMusicScrapes.ts`
- Create: `convex/rateYourMusicScrapes.matching-source.test.ts`

- [ ] **Step 1: Write source-flow test**

Create `convex/rateYourMusicScrapes.matching-source.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/rateYourMusicScrapes.ts", "utf8");

test("RYM scrape upsert imports explicit Spotify album matcher", () => {
	assert.match(source, /matchRymScrapeToSpotifyAlbums/);
});

test("RYM scrape upsert calls explicit Spotify album matcher after taxonomy sync", () => {
	const taxonomyIndex = source.indexOf("await syncReleaseTaxonomy");
	const matchIndex = source.indexOf("await matchRymScrapeToSpotifyAlbums");

	assert.ok(taxonomyIndex >= 0, "taxonomy sync call must exist");
	assert.ok(matchIndex > taxonomyIndex, "Spotify album matching must run after taxonomy sync");
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm exec tsx --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: FAIL because `rateYourMusicScrapes.ts` still imports/calls `matchForLaterAlbumsForRymScrape`.

- [ ] **Step 3: Update import and call**

In `convex/rateYourMusicScrapes.ts`, replace:

```ts
import { matchForLaterAlbumsForRymScrape } from "./_utils/albumMatching";
```

with:

```ts
import { matchRymScrapeToSpotifyAlbums } from "./_utils/albumMatching";
```

Then replace the call:

```ts
await matchForLaterAlbumsForRymScrape(ctx, {
	scrapeId,
	spotifyAlbumId: args.spotifyAlbumId?.trim() || undefined,
	albumTitle: args.albumTitle,
	artists: args.artists,
	now,
});
```

with:

```ts
await matchRymScrapeToSpotifyAlbums(ctx, {
	scrapeId,
	spotifyAlbumId: args.spotifyAlbumId?.trim() || undefined,
	albumTitle: args.albumTitle,
	artists: args.artists,
	now,
});
```

Do not remove the existing `refreshFilterProjectionsForScrape` call.

- [ ] **Step 4: Run source-flow test**

Run:

```bash
pnpm exec tsx --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS.

---

## Task 3: Manual Bounded Backfill

**Files:**
- Modify: `convex/rateYourMusicScrapes.ts`
- Modify: `convex/rateYourMusicScrapes.matching-source.test.ts`

- [ ] **Step 1: Add source test for backfill**

Append this test to `convex/rateYourMusicScrapes.matching-source.test.ts`:

```ts
test("manual backfill processes recent RYM scrapes with explicit matcher", () => {
	assert.match(source, /export const backfillRymScrapeSpotifyAlbumMatches = mutation/);
	assert.match(source, /withIndex\("by_updatedAt"\)/);
	assert.match(source, /take\(limit\)/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm exec tsx --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: FAIL because the backfill mutation does not exist yet.

- [ ] **Step 3: Add return validators**

Near the existing validators in `convex/rateYourMusicScrapes.ts`, add:

```ts
const rymScrapeSpotifyAlbumMatchSummaryValidator = v.object({
	scrapeId: v.id("rateYourMusicScrapes"),
	checkedAlbums: v.number(),
	linkedAlbums: v.number(),
	skippedAlreadyLinked: v.number(),
});

const rymScrapeSpotifyAlbumBackfillSummaryValidator = v.object({
	processedScrapes: v.number(),
	checkedAlbums: v.number(),
	linkedAlbums: v.number(),
	skippedAlreadyLinked: v.number(),
	summaries: v.array(rymScrapeSpotifyAlbumMatchSummaryValidator),
});
```

- [ ] **Step 4: Add backfill mutation**

Add this mutation after `upsertRateYourMusicScrape`:

```ts
export const backfillRymScrapeSpotifyAlbumMatches = mutation({
	args: {
		limit: v.optional(v.number()),
		albumLimit: v.optional(v.number()),
	},
	returns: rymScrapeSpotifyAlbumBackfillSummaryValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
		const albumLimit = Math.min(Math.max(args.albumLimit ?? 1024, 1), 5000);
		const scrapes = await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(limit);

		const summaries = [];
		for (const scrape of scrapes) {
			const summary = await matchRymScrapeToSpotifyAlbums(ctx, {
				scrapeId: scrape._id,
				spotifyAlbumId: scrape.spotifyAlbumId,
				albumTitle: scrape.albumTitle,
				artists: scrape.artists,
				now: Date.now(),
				limit: albumLimit,
			});
			summaries.push(summary);
		}

		return {
			processedScrapes: summaries.length,
			checkedAlbums: summaries.reduce(
				(total, summary) => total + summary.checkedAlbums,
				0,
			),
			linkedAlbums: summaries.reduce(
				(total, summary) => total + summary.linkedAlbums,
				0,
			),
			skippedAlreadyLinked: summaries.reduce(
				(total, summary) => total + summary.skippedAlreadyLinked,
				0,
			),
			summaries,
		};
	},
});
```

Do not call this mutation automatically. It is manual only.

- [ ] **Step 5: Run source-flow test**

Run:

```bash
pnpm exec tsx --test convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS.

---

## Task 4: Verification

**Files:**
- Existing files from prior tasks

- [ ] **Step 1: Run matching tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumMatching.test.ts convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run scoped Biome checks**

Run:

```bash
pnpm exec biome check convex/_utils/albumMatching.ts convex/_utils/albumMatching.test.ts convex/rateYourMusicScrapes.ts convex/rateYourMusicScrapes.matching-source.test.ts
```

Expected: PASS, unless `convex/rateYourMusicScrapes.ts` has unrelated pre-existing diagnostics. If unrelated diagnostics appear, run a formatter-only check for that file and report the unrelated failures.

---

## Self-Review Notes

- Spec coverage: The plan adds explicit scrape-to-Spotify matching, uses it on new/updated scrapes, adds manual bounded backfill, preserves For Later behavior through a wrapper, and avoids UI/global queues.
- Scope: No `/albums/all` filter changes, no automatic one-time backfill, no destructive unlink/rematch behavior.
- Type consistency: The summary type and validator use the same fields: `scrapeId`, `checkedAlbums`, `linkedAlbums`, `skippedAlreadyLinked`.
- Execution constraint: Despite the generic Superpowers guidance recommending worktrees, the user explicitly requested this branch/worktree. Do not create a new branch or worktree.

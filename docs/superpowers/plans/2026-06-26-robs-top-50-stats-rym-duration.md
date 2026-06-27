# Rob's Top 50 Stats, Duration, and RYM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship public artist stats at `/public/robs-top-50/stats`, capture playlist-track duration during For Later sync for list + recommendation filters, and opportunistically RYM-match albums added via Rob's rankings paths.

**Architecture:** Phase 1 adds a public Convex aggregation query + stats page (no schema changes). Phase 2 extends `buildForLaterPlaylistAlbums` to sum `duration_ms`, stores on `spotifyAlbums.totalDurationMs`, projects to `forLaterAlbumItems.filterDurationMs`, and wires list/recommendation filters. Phase 3 extracts `matchRymForSpotifyAlbum` from existing For Later matcher and calls it from rankings import/add/replace paths.

**Tech Stack:** Next.js 15 App Router, React 19, Convex, Tailwind v4, `node:test` via `pnpm exec tsx --test`, Biome, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-26-robs-top-50-stats-rym-duration-design.md`

---

## File Structure

| File | Phase | Responsibility |
|---|---|---|
| `convex/_utils/robRankingArtistStats.ts` | 1 | Pure artist key extraction + tier counting |
| `convex/_utils/robRankingArtistStats.test.ts` | 1 | Unit tests for stats aggregation |
| `convex/robRankings.ts` | 1, 3 | `getPublishedArtistStats`; RYM hooks on add/replace |
| `src/app/public/robs-top-50/stats/page.tsx` | 1 | Public stats page |
| `src/app/public/robs-top-50/_components/artist-stats-table.tsx` | 1 | Table + skeleton |
| `src/app/public/robs-top-50/_components/public-top-50-nav.tsx` | 1 | Shared Lists / Stats nav |
| `src/app/public/robs-top-50/page.tsx` | 1 | Add nav link |
| `convex/schema.ts` | 2 | `totalDurationMs`, `filterDurationMs` |
| `convex/_utils/forLaterAlbums.ts` | 2 | Sum duration in playlist album builder |
| `convex/_utils/forLaterAlbums.test.ts` | 2 | Duration sum tests |
| `src/lib/for-later-albums-sync.ts` | 2 | Pass duration to upsert |
| `convex/forLaterAlbums.ts` | 2 | upsert + projection + filter args |
| `convex/_utils/forLaterProjectionPredicate.ts` | 2 | Duration min/max predicate |
| `convex/_utils/forLaterProjectionPredicate.test.ts` | 2 | Duration filter tests |
| `convex/_utils/forLaterRecommendations.ts` | 2 | Duration tier matching |
| `convex/_utils/forLaterRecommendations.test.ts` | 2 | Duration tier tests |
| `src/app/for-later-albums/_utils/recommendation-state.ts` | 2 | Duration question |
| `src/app/for-later-albums/_components/for-later-filters.tsx` | 2 | Duration filter UI |
| `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx` | 2 | Duration question UI |
| `convex/_utils/albumMatching.ts` | 3 | `matchRymForSpotifyAlbum` helper |
| `src/app/api/spotify/import-robs-top-50/route.ts` | 3 | Call matcher after upsert |

No commit steps unless user explicitly requests commits.

---

### Task 1: Public Artist Stats (Phase 1)

**Files:**
- Create: `convex/_utils/robRankingArtistStats.ts`
- Create: `convex/_utils/robRankingArtistStats.test.ts`
- Create: `src/app/public/robs-top-50/_components/public-top-50-nav.tsx`
- Create: `src/app/public/robs-top-50/_components/artist-stats-table.tsx`
- Create: `src/app/public/robs-top-50/stats/page.tsx`
- Modify: `convex/robRankings.ts`
- Modify: `src/app/public/robs-top-50/page.tsx`

- [ ] **Step 1: Write failing stats unit tests**

Create `convex/_utils/robRankingArtistStats.test.ts` with cases:
- Single artist single win
- Multi-artist album credits each artist
- Manual entry uses `manualArtistName`
- Top tier counts are cumulative (position 1 counts in top3/top5/.../top50)

- [ ] **Step 2: Implement pure stats helpers**

Create `convex/_utils/robRankingArtistStats.ts`:

```typescript
export type ArtistFinishInput = {
	position: number;
	artistNames: string[];
	year: number;
};

export type ArtistStatsRow = {
	artistKey: string;
	displayName: string;
	wins: number;
	top3: number;
	top5: number;
	top10: number;
	top25: number;
	top50: number;
	yearsAppeared: number;
};

export function splitArtistNames(raw: string): string[] { /* split on ", " */ }
export function buildArtistStatsRows(entries: ArtistFinishInput[]): ArtistStatsRow[] { /* aggregate + sort */ }
```

Use `normalizeArtistName` from `convex/_utils/albumMatchingCore.ts` for keys.

- [ ] **Step 3: Add public query**

In `convex/robRankings.ts`:

```typescript
export const getPublishedArtistStats = query({
	args: {},
	returns: v.array(v.object({
		artistKey: v.string(),
		displayName: v.string(),
		wins: v.number(),
		top3: v.number(),
		top5: v.number(),
		top10: v.number(),
		top25: v.number(),
		top50: v.number(),
		yearsAppeared: v.number(),
	})),
	handler: async (ctx) => {
		// Load published years → albums → resolve artist names → buildArtistStatsRows
	},
});
```

- [ ] **Step 4: Build stats UI**

- `public-top-50-nav.tsx`: `Lists` | `Artist stats` tabs using `Link`
- `artist-stats-table.tsx`: scrollable table, skeleton component after main export
- `stats/page.tsx`: `useQuery(api.robRankings.getPublishedArtistStats)`, footnote about collabs
- Update main public page header to include nav

- [ ] **Step 5: Verify**

Run: `pnpm exec tsx --test convex/_utils/robRankingArtistStats.test.ts`
Run: `pnpm typecheck && pnpm check`

---

### Task 2: For Later Duration Capture + Filters (Phase 2)

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/_utils/forLaterAlbums.ts`
- Create/Modify: `convex/_utils/forLaterAlbums.test.ts`
- Modify: `src/lib/for-later-albums-sync.ts`
- Modify: `convex/forLaterAlbums.ts`
- Modify: `convex/_utils/forLaterProjectionPredicate.ts`
- Modify: `convex/_utils/forLaterRecommendations.ts`
- Modify: `src/app/for-later-albums/_utils/recommendation-state.ts`
- Modify: `src/app/for-later-albums/_components/for-later-filters.tsx`
- Modify: `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx`

- [ ] **Step 1: Schema**

Add to `spotifyAlbums`: `totalDurationMs: v.optional(v.number())`
Add to `forLaterAlbumItems`: `filterDurationMs: v.optional(v.number())`

- [ ] **Step 2: Sum duration in playlist builder**

Extend `ForLaterPlaylistAlbumInput` with `totalDurationMs: number`.
In `buildForLaterPlaylistAlbums`, accumulate `item.track.duration_ms ?? 0` per album.
Add unit tests.

- [ ] **Step 3: Persist on sync**

In `for-later-albums-sync.ts`, pass `totalDurationMs` to upsert mutation.
Extend `upsertForLaterAlbumItem` to patch `spotifyAlbums.totalDurationMs`.
Extend `syncForLaterItemFilterProjection` to write `filterDurationMs`.

- [ ] **Step 4: List filter**

Add `durationMinMinutes` / `durationMaxMinutes` to filter types + URL params.
Update `projectionMatchesFilters` and list query filter path.
Add preset chips or min/max inputs in `for-later-filters.tsx`.

- [ ] **Step 5: Recommendation duration tier**

Add `durationTier: "short" | "medium" | "long" | "any"` to recommendation answers.
Thresholds: short `< 35*60*1000`, medium `35–55`, long `> 55*60*1000`.
Add question to drawer after release time.
Update `candidateMatchesRecommendationAnswers` + tests.

- [ ] **Step 6: Verify**

Run duration-related tests + `pnpm typecheck && pnpm check`

---

### Task 3: RYM Matching for Rankings (Phase 3)

**Files:**
- Modify: `convex/_utils/albumMatching.ts`
- Modify: `convex/robRankings.ts`
- Modify: `src/app/api/spotify/import-robs-top-50/route.ts`

- [ ] **Step 1: Extract shared matcher**

Create `matchRymForSpotifyAlbum(ctx, { albumId, spotifyAlbumId, albumTitleKey, artistKeys, now })`.
Refactor `matchRymForForLaterAlbum` to load item context then delegate.

- [ ] **Step 2: Rankings mutations**

After `addAlbumToYear` insert and each album in `replaceYearFromAlbums`, call matcher with album metadata from `spotifyAlbums`.

- [ ] **Step 3: Import route**

After each `upsertAlbum` in import route, call Convex mutation or internal action to attempt match (follow existing For Later pattern — may need internal mutation `attemptRymMatchForAlbum` callable from API route via ConvexHttpClient).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm check`
Manual: import playlist with known RYM-linked album → link appears in `rateYourMusicSpotifyAlbumLinks`

---

## Verification Checklist

- [ ] `/public/robs-top-50/stats` loads without auth
- [ ] Artist stats counts match manual spot-check
- [ ] For Later sync sets `totalDurationMs` on new albums
- [ ] Duration list filter works
- [ ] Recommendation duration tier works
- [ ] Rankings import triggers RYM match when scrape exists

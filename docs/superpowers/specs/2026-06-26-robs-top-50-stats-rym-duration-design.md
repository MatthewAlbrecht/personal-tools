# Rob's Top 50 Stats, RYM Enrichment, and For Later Duration — Product/Technical Spec

## Overview

Extend the existing Rob's Top 50 public archive with a **public artist stats page**, opportunistically connect ranking albums to Rate Your Music (RYM) metadata, and capture **album duration** during For Later playlist sync for list filtering and recommendation.

These are related data-enrichment and discovery features built on top of systems that already exist:

- Published yearly lists at `/public/robs-top-50` (`robRankingYears`, `robRankingAlbums`, manual + Spotify entries)
- RYM scrape/link tables (`rateYourMusicScrapes`, `rateYourMusicSpotifyAlbumLinks`) and bidirectional matching in `convex/_utils/albumMatching.ts`
- For Later sync (`src/lib/for-later-albums-sync.ts`), filter projection (`syncForLaterItemFilterProjection`), and recommendation flow (`convex/_utils/forLaterRecommendations.ts`)

**Recommended build order:** (1) public artist stats → (2) duration capture + For Later filters/recommendations → (3) opportunistic RYM matching for ranking albums → (4) RYM-powered stats UI.

## Goals

### Public artist stats (Rob's Top 50)

- Add a public, unauthenticated stats view linked from `/public/robs-top-50`.
- Show per-artist finish counts across **all published years**:
  - `#1` (most wins)
  - Top 3 (`position ≤ 3`)
  - Top 5
  - Top 10
  - Top 25
  - Top 50
- Handle both Spotify-linked entries and manual entries consistently.
- Sort artists by a sensible default (most `#1` wins, then top-3, then alphabetical tie-break).

### RYM connection for ranking albums

- When a Spotify album enters the rankings pipeline (import or manual add from catalog), **attempt RYM matching** using existing matchers (`spotify_id`, then `title_artist`).
- Do **not** block editor or public list UX on RYM success.
- Preserve manual ranking entries without Spotify IDs as a separate path (no auto-match unless user links later).

### For Later album duration

- On For Later playlist sync, sum `track.duration_ms` from playlist rows per unique album and persist to the database.
- Expose duration in For Later **list filters** (URL-backed, same pattern as year/listened/RYM).
- Expose duration in the **recommendation drawer** as a filter dimension.

## Non-Goals

- Cross-year comparison matrix UI (all #1s in a row) — suggested as a later stat, not MVP.
- Automated RYM scrape/discovery triggered specifically from Rob's rankings editor.
- Full manual RYM associate UI in the rankings editor (Phase 2+; reuse For Later drawer pattern when built).
- Genre/descriptor breakdown on the public stats page in MVP (depends on RYM match rate).
- Backfilling duration for albums outside the For Later playlist sync path (except optional one-off migration script).
- Changing Rob's rankings editor UX beyond what RYM/duration work requires.
- AI recommendation scoring changes beyond adding duration as a filter.

## Existing Patterns To Match

| Area | Reference |
|---|---|
| Public unauthenticated pages | `src/app/public/robs-top-50/` — no auth on `/public/*` |
| Public Convex queries | `listPublishedYears`, `getPublishedAlbumsForYear` in `convex/robRankings.ts` |
| Manual ranking entries | `source: "manual"`, `manualArtistName`, `manualAlbumTitle` in `robRankingAlbums` |
| Artist normalization | `normalizeArtistName`, `buildArtistKeys` in `convex/_utils/albumMatchingCore.ts` |
| RYM matching | `matchRymForForLaterAlbum`, `matchForLaterAlbumsForRymScrape` in `convex/_utils/albumMatching.ts` |
| RYM link source of truth | `rateYourMusicSpotifyAlbumLinks` |
| For Later sync | `src/lib/for-later-albums-sync.ts` → `buildForLaterPlaylistAlbums` |
| Filter projection | `syncForLaterItemFilterProjection` in `convex/forLaterAlbums.ts` |
| Filter predicate | `projectionMatchesFilters` in `convex/_utils/forLaterProjectionPredicate.ts` |
| Recommendation filters | `candidateMatchesRecommendationAnswers` in `convex/_utils/forLaterRecommendations.ts` |
| Playlist track shape | `PlaylistTrackItem.track.duration_ms` in `src/lib/spotify.ts` |

---

## Phasing

### Phase 1 — MVP: Public artist stats

**Scope:** Stats page + aggregation query only. No schema changes required.

| Deliverable | Notes |
|---|---|
| `getPublishedArtistStats` public query | Aggregate from published years |
| `/public/robs-top-50/stats` page | Table UI + link from main public page |
| Artist normalization rules | Documented below |

**Defer:** RYM-powered stats, year-scoped stats toggle, album-level drill-down.

### Phase 2 — For Later duration capture + filters

**Scope:** Schema + sync + filter projection + list UI + recommendation filter.

| Deliverable | Notes |
|---|---|
| `spotifyAlbums.totalDurationMs` | Canonical sum from playlist tracks |
| `forLaterAlbumItems.filterDurationMs` | Denormalized projection |
| Sync change | Sum durations in `buildForLaterPlaylistAlbums` path |
| List filter UI | Min/max duration (minutes) in `ForLaterFilters` |
| Recommendation | New duration answer (e.g. short / medium / long / any) |

**Defer:** Indexed duration pagination if post-filter scan is acceptable at backlog size; backfill job for existing rows.

### Phase 3 — Opportunistic RYM matching for ranking albums

**Scope:** Shared matcher hook on Spotify album upsert paths used by rankings.

| Deliverable | Notes |
|---|---|
| `matchRymForSpotifyAlbum` helper | Extract/refactor from `matchRymForForLaterAlbum` |
| Call sites | `import-robs-top-50` route, `addAlbumToYear`, optionally `upsertAlbum` |
| Reverse path | Already exists: `matchForLaterAlbumsForRymScrape` on scrape ingest |

**Defer:** Rankings editor manual RYM associate drawer, automated RYM discovery queue for unmatched ranking albums.

### Phase 4 — RYM-powered stats (later)

**Scope:** Public stats enriched with genre/descriptor/year breakdowns where `albumId → rateYourMusicSpotifyAlbumLinks` exists.

| Deliverable | Notes |
|---|---|
| Genre share by year | From `rateYourMusicReleaseGenres` |
| Top descriptors | From `rateYourMusicReleaseDescriptors` |
| Match coverage metric | % of published entries with RYM link |

---

## Product Behavior

### Public stats page — `/public/robs-top-50/stats`

**Audience:** Anyone, no sign-in.

**Entry:** Link/tab from `/public/robs-top-50` header: `Lists` | `Artist stats` (or `Stats`).

**Data scope:** All rows in `robRankingAlbums` whose parent `robRankingYears.published === true`. Unpublished years are excluded entirely.

**Artist attribution rules:**

1. **Spotify entries** (`albumId` set): split `spotifyAlbums.artistName` on `", "` (same convention as elsewhere), normalize each segment with `normalizeArtistName`, dedupe within the album.
2. **Manual entries** (`source: "manual"` or `manualAlbumTitle` without `albumId`): use `manualArtistName` as a single artist (no split unless user entered comma-separated names — if comma present, split same as Spotify).
3. **Multi-artist albums:** each normalized artist receives full credit for that finish tier (standard collab handling; document in UI footnote).
4. **Display name:** prefer first-seen casing from the most recent published entry; fallback to title-cased normalized key.

**Table columns (default sort: `#1` desc, then top3 desc, then artist name asc):**

| Column | Definition |
|---|---|
| Artist | Display name |
| `#1` | Count of `position === 1` |
| Top 3 | Count of `position ≤ 3` |
| Top 5 | Count of `position ≤ 5` |
| Top 10 | Count of `position ≤ 10` |
| Top 25 | Count of `position ≤ 25` |
| Top 50 | Count of `position ≤ 50` |
| Years | Count of distinct published years with any finish (optional MVP column) |

**UX notes:**

- Mobile: horizontal scroll on table or stacked card per artist (prefer scrollable table for MVP).
- Empty state when no published years: same tone as main public page.
- Optional v1.1: column header click to resort; default sort sufficient for MVP.
- Footnote: "Collaborative albums credit each listed artist."

**Wireframe (desktop):**

```
┌─────────────────────────────────────────────────────────────┐
│  ♪ Rob's Top 50          [ Lists ]  [ Artist stats ● ]        │
├─────────────────────────────────────────────────────────────┤
│  Artist stats across all published years (2016–2025)          │
│  Collaborative albums credit each listed artist.              │
│                                                               │
│  ┌──────────────┬────┬──────┬──────┬───────┬───────┬───────┐ │
│  │ Artist       │ #1 │ Top3 │ Top5 │ Top10 │ Top25 │ Top50 │ │
│  ├──────────────┼────┼──────┼──────┼───────┼───────┼───────┤ │
│  │ Big Thief    │  2 │    4 │    6 │     8 │    10 │    12 │ │
│  │ boygenius    │  1 │    3 │    4 │     5 │     7 │     9 │ │
│  │ …            │    │      │      │       │       │       │ │
│  └──────────────┴────┴──────┴──────┴───────┴───────┴───────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Suggested additional stats (future phases)

Prioritized by value vs. effort given existing data:

| Stat | Phase | Data source |
|---|---|---|
| **All #1 albums timeline** | 4 | Published rankings by year |
| **Repeat albums** (same album in multiple years) | 4 | `albumId` or normalized title+artist |
| **Average finish position by artist** | 4 | Aggregated positions |
| **Genre breakdown by year** | 4 | RYM genres via link table |
| **Top descriptors across all lists** | 4 | RYM descriptors |
| **New artist debuts** (first appearance in any published year) | 4 | Artist first-seen year |
| **Longest top-10 streak** (consecutive published years) | 4+ | Per-artist year series |
| **One-and-done artists** (exactly one appearance, any position) | 4 | Aggregation |
| **Manual vs Spotify entry ratio** | 1.1 | `robRankingAlbums.source` |
| **RYM match coverage %** | 3–4 | Links / Spotify-linked entries |

MVP ships only the core finish-tier table; others are documented for roadmap alignment.

---

## RYM Integration Strategy

### Current state

- Ranking albums with `albumId` can already join `spotifyAlbums` → `rateYourMusicSpotifyAlbumLinks` → scrape taxonomy **if a link exists**.
- For Later sync already calls `matchRymForForLaterAlbum` after each `upsertForLaterAlbumItem`.
- Rob's import (`/api/spotify/import-robs-top-50`) and `addAlbumToYear` **do not** attempt RYM matching today.
- Manual ranking entries have no `albumId`; they cannot auto-link without future manual associate or title+artist search against scrapes.

### Design principle: "Always try when we see new album"

Whenever a **canonical Spotify album row** is created or refreshed from a rankings path, run the same matching logic as For Later:

1. **Exact Spotify ID:** `rateYourMusicScrapes.spotifyAlbumId === spotifyAlbums.spotifyAlbumId` → link with method `spotify_id`.
2. **Title + one artist overlap:** normalized title + any shared normalized artist key → link with method `title_artist`.
3. **No match:** no error; link may appear later when a RYM scrape arrives (`matchForLaterAlbumsForRymScrape` already handles reverse direction globally).

### Implementation approach (Phase 3)

**Recommended:** Extract shared helper:

```typescript
// convex/_utils/albumMatching.ts (conceptual)
export async function matchRymForSpotifyAlbum(
  ctx: MutationCtx,
  args: {
    albumId: Id<"spotifyAlbums">;
    spotifyAlbumId: string;
    albumTitleKey: string;
    artistKeys: string[];
    now: number;
  },
): Promise<RymMatchResult>
```

Refactor `matchRymForForLaterAlbum` to delegate to this helper after loading item context.

**Call sites (rankings):**

| Path | When to call |
|---|---|
| `POST /api/spotify/import-robs-top-50` | After each `upsertAlbum` |
| `robRankings.addAlbumToYear` | After insert |
| `robRankings.replaceYearFromAlbums` | After each album row inserted (batch) |

**Do not call** for manual entries in Phase 3 unless we add optional title+artist scrape search (defer).

**Full auto-link deferred:**

- AI RYM discovery queue (`rymDiscoveryStatus` on `forLaterAlbumItems`) — rankings-specific queue is out of scope.
- Chrome extension scrape triggering from rankings editor — out of scope.
- Rankings manual RYM associate drawer — Phase 4+; reuse `ForLaterRymAssociateDrawer` patterns.

### Phasing rationale

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| A. Match only on import/add (Phase 3) | Low risk, reuses proven matcher | Manual entries stay unlinked | **Recommended MVP for RYM** |
| B. Match inside `upsertAlbum` globally | Every album path benefits | Side effects on unrelated features | Optional follow-up if call sites proliferate |
| C. Rankings-specific RYM discovery queue | Higher match rate | New infra, scope creep | **Defer** |
| D. Manual associate in editor | Handles edge cases | UI work | **Phase 4+** |

---

## Duration Capture Strategy

### Problem

Playlist tracks include `duration_ms`, but For Later sync currently aggregates only album IDs and track IDs (`buildForLaterPlaylistAlbums`). Neither `spotifyAlbums` nor `forLaterAlbumItems` store album duration, so filters and recommendations cannot use length.

### Canonical storage: `spotifyAlbums.totalDurationMs`

Add optional field on `spotifyAlbums`:

```typescript
totalDurationMs?: number; // Sum of playlist track durations seen for this album
```

**Why canonical table:** Duration is an album property reusable outside For Later (rankings, future features). For Later projection denormalizes for indexed filtering.

**Computation during sync:**

1. Extend `buildForLaterPlaylistAlbums` (or companion helper) to accumulate `totalDurationMs` per `spotifyAlbumId` by summing `item.track.duration_ms` for each playlist row belonging to that album.
2. Pass `totalDurationMs` into `upsertForLaterAlbumItem` (new optional arg) and/or patch canonical album in sync loop after upsert.
3. On incremental sync, **recompute** duration for touched albums from the playlist tail window (same albums being refreshed). Full playlist resync (`fullPlaylist: true`) recomputes all.

**Edge cases:**

| Case | Behavior |
|---|---|
| Track `duration_ms` missing | Treat as 0; do not fail sync |
| Same album appears on multiple playlist rows | Sum all row durations (represents playlist listening time, not album runtime) |
| Album removed from playlist | Do not clear `totalDurationMs` on canonical row (historical value OK) |
| Album has fewer tracks in playlist than album total | Duration reflects playlist tracks only — acceptable for For Later use case |

**Note:** This is **playlist-track duration sum**, not necessarily full album length. UI copy should say "playlist duration" or "time in For Later playlist" if confusion arises.

### Projection: `forLaterAlbumItems.filterDurationMs`

Add optional denormalized field, written in `syncForLaterItemFilterProjection`:

```typescript
filterDurationMs?: number; // Copied from spotifyAlbums.totalDurationMs
```

Add index for efficient filtering (if needed at scale):

```typescript
.index("by_userId_filterDurationMs_lastSeenAt", [
  "userId",
  "filterDurationMs",
  "lastSeenAt",
])
```

MVP may use post-filter scan (existing pattern for genre/descriptor) if backlog < few thousand; add index when duration filter is used heavily.

### List filter UI

Extend `ForLaterUiFilters`:

```typescript
durationMinMinutes?: number;
durationMaxMinutes?: number;
```

- UI: two number inputs or preset chips (`< 30 min`, `30–60`, `> 60`, `any`).
- URL params: `durationMin`, `durationMax` (minutes, integers).
- Predicate in `projectionMatchesFilters` and `rowMatchesFilters` (mirror release year min/max pattern).
- Display in list row (optional): formatted duration badge from hydrated row.

### Recommendation filter

Add to `ForLaterRecommendationAnswers`:

```typescript
durationTier: "short" | "medium" | "long" | "any";
```

Suggested thresholds (tunable):

| Tier | `filterDurationMs` range |
|---|---|
| `short` | `< 35 minutes` |
| `medium` | `35–55 minutes` |
| `long` | `> 55 minutes` |
| `any` | no filter |

Add as a question in the recommendation drawer (after release time or before rating). Extend `candidateMatchesRecommendationAnswers` and recommendation schema validator.

**Missing duration:** Exclude from tier filters (same as missing release year for release-time filter) unless `any`.

---

## Data Model Changes

### Phase 1 — none

Stats computed at query time from existing tables.

### Phase 2 — duration

**`spotifyAlbums`:**

```typescript
totalDurationMs?: number;
```

**`forLaterAlbumItems`:**

```typescript
filterDurationMs?: number;
```

**Optional index** on `forLaterAlbumItems` (see above).

**`forLaterAlbumRecommendations.answers`:** extend stored answer object with `durationTier`.

### Phase 3 — none (uses existing RYM tables)

Links written to existing `rateYourMusicSpotifyAlbumLinks`.

### Phase 4 — optional materialized stats (only if query cost grows)

```typescript
// Not needed for MVP (~500 rows max)
robRankingArtistStatsCache?: defineTable({ ... })
```

Prefer computed query until performance requires cache.

---

## API / Convex Queries

### Phase 1 — public stats

```typescript
export const getPublishedArtistStats = query({
  args: {},
  handler: async (ctx) => {
    // Returns sorted array:
    // { artistKey, displayName, wins, top3, top5, top10, top25, top50, yearsAppeared }
  },
});
```

**Algorithm:**

1. Load all `robRankingYears` where `published === true`.
2. For each year, load `robRankingAlbums` via `by_yearId`.
3. Resolve display + artist keys per entry (`resolveRankingAlbumDisplay` + split/normalize).
4. Increment counters per artist key per finish tier.
5. Sort and return.

No auth check (public query, same as `listPublishedYears`).

**Optional Phase 1.1:**

```typescript
export const getPublishedArtistStatsForYear = query({
  args: { year: v.number() },
  ...
});
```

### Phase 2 — duration (mutations / existing queries extended)

| Function | Change |
|---|---|
| `upsertForLaterAlbumItem` | Accept optional `totalDurationMs`; patch canonical album |
| `syncForLaterItemFilterProjection` | Write `filterDurationMs` |
| `listForLaterAlbumRows` | No API change; filters extended |
| `recommendForLaterAlbums` | Extended `answers` validator |
| `getForLaterRecommendationOptions` | Unchanged unless duration tier counts needed |

### Phase 3 — RYM

| Function | Change |
|---|---|
| `matchRymForSpotifyAlbum` | New shared helper |
| `addAlbumToYear` | Call matcher after insert |
| `replaceYearFromAlbums` | Call matcher per album |
| Import route | Call matcher after each upsert |

---

## UI Component Changes

| File | Phase | Change |
|---|---|---|
| `src/app/public/robs-top-50/page.tsx` | 1 | Nav link to stats |
| `src/app/public/robs-top-50/stats/page.tsx` | 1 | **New** — stats table |
| `src/app/public/robs-top-50/_components/artist-stats-table.tsx` | 1 | **New** — table + skeleton |
| `convex/robRankings.ts` | 1 | `getPublishedArtistStats` |
| `convex/_utils/forLaterAlbums.ts` | 2 | Duration sum in playlist album builder |
| `src/lib/for-later-albums-sync.ts` | 2 | Pass duration to upsert |
| `convex/forLaterAlbums.ts` | 2 | Projection + filter/query paths |
| `convex/_utils/forLaterProjectionPredicate.ts` | 2 | Duration predicate |
| `convex/_utils/forLaterRecommendations.ts` | 2 | Duration tier matching |
| `src/app/for-later-albums/_components/for-later-filters.tsx` | 2 | Duration controls |
| `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx` | 2 | Duration question |
| `convex/_utils/albumMatching.ts` | 3 | Shared matcher + rankings hooks |
| `src/app/api/spotify/import-robs-top-50/route.ts` | 3 | Call matcher after upsert |
| `convex/robRankings.ts` | 3 | Matcher on add/replace |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  /public/robs-top-50/stats                                       │
│  useQuery(getPublishedArtistStats)                               │
│       │                                                          │
│       ▼                                                          │
│  robRankingYears (published) → robRankingAlbums → artist keys    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  For Later sync                                                  │
│  playlist tracks (duration_ms) → buildForLaterPlaylistAlbums       │
│       → upsertForLaterAlbumItem + spotifyAlbums.totalDurationMs    │
│       → syncForLaterItemFilterProjection.filterDurationMs          │
│       → list filters + recommendation duration tier                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Rankings import / add album                                     │
│  upsertAlbum → matchRymForSpotifyAlbum (Phase 3)                 │
│       → rateYourMusicSpotifyAlbumLinks                           │
│       → (Phase 4) genre/descriptor stats                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No published years | Stats page empty state |
| Manual entry missing artist | Skip row; log in dev if needed |
| Duration missing on item | Duration filter excludes; recommendation tier `any` still includes |
| RYM match fails | Silent; no user-facing error |
| Sync partial failure | Existing sync run error handling unchanged |
| Multi-artist name parse edge cases | Best-effort split on `", "`; footnote on stats page |

---

## Open Questions

1. **Collaborative credit:** Confirm full credit to each artist (recommended) vs. primary-artist-only. Spec assumes full credit with footnote.
2. **Duration semantics:** Is playlist-track sum acceptable vs. fetching full album tracklist from Spotify API? Spec assumes playlist sum for MVP (no extra API calls).
3. **Duration thresholds:** Confirm short/medium/long minute boundaries before implementation.
4. **Stats year filter:** Ship all-years-only in MVP, or include year pills on stats page in Phase 1?
5. **Global `upsertAlbum` matcher:** Phase 3 limits to rankings call sites; expand to all upserts only if match volume/noise is acceptable.
6. **Manual ranking RYM:** Priority for Phase 4 associate drawer vs. title+artist auto-search against scrapes without Spotify ID.

---

## Success Criteria

### Phase 1 — Artist stats

- [ ] `/public/robs-top-50/stats` loads without auth.
- [ ] Table shows correct counts for a known artist verified manually against published lists.
- [ ] Manual entries (`manualArtistName`) appear in stats.
- [ ] Multi-artist Spotify albums credit each artist.
- [ ] Link from main public page works.
- [ ] `pnpm typecheck` and `pnpm check` pass.

### Phase 2 — Duration

- [ ] After For Later sync, new/changed albums have `spotifyAlbums.totalDurationMs` set.
- [ ] `filterDurationMs` populated on active for-later items.
- [ ] List filter by duration min/max returns expected albums.
- [ ] Recommendation with duration tier excludes non-matching albums.
- [ ] Albums without duration excluded from tier filters, included for `any`.

### Phase 3 — RYM for rankings

- [ ] Import playlist → albums with existing RYM scrapes get links without manual steps.
- [ ] Adding album from catalog in editor triggers match attempt.
- [ ] No regression to For Later matching.
- [ ] Manual ranking entries unchanged (no false errors).

### Phase 4 — RYM stats (when built)

- [ ] Genre breakdown visible for years where ≥ N entries have RYM links.
- [ ] Match coverage metric shown on stats page.

---

## Implementation Order (summary)

1. **Phase 1:** `getPublishedArtistStats` + public stats page + nav link
2. **Phase 2:** Duration schema → sync sum → projection → list filter → recommendation tier
3. **Phase 3:** Refactor shared RYM matcher → rankings import/add hooks
4. **Phase 4:** RYM-powered stats + optional manual associate in editor

---

## Verification

No test framework configured project-wide. Add focused unit tests where patterns exist:

- `convex/_utils/forLaterRecommendations.test.ts` — duration tier cases
- `convex/_utils/forLaterProjectionPredicate.test.ts` — duration filter cases
- New `convex/_utils/robRankingArtistStats.test.ts` — artist key extraction + tier counting

Manual verification checklists per phase in Success Criteria above.

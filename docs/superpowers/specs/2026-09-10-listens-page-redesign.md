---
title: Listens page redesign
status: approved-design
date: 2026-09-10
---

# Listens page redesign

## Goal

Redesign **Listens** (`/albums/recent`) so it supports both primary jobs on one chronological surface:

1. **Scan** recent listening in week (default) or month rhythm  
2. **Rate in place** via the existing rating drawer  

This stays a standalone My Albums view (not merged with Rankings, Queue, or Library). Home may still teaser “needs rating”; Listens is the full log.

## Non-goals (v1)

- URL-synced filters  
- Infinite scroll / unbounded history rewrite (beyond fixing the existing listen query bound)  
- Play soon / shared album drawer  
- Rich listening-stats module (deferred; section counts are the only stats in v1)  
- Smart playlist “listened but unrated” recipe (separate idea)  
- Dark-mode theme flip or new brand fonts  

## Jobs & IA

| View | Job |
|---|---|
| Listens | Reflect chronological log + rate in place |
| Rankings | Year tiers / judgment |
| Queue | Decide triage |
| Library | Searchable catalog |

**Decision:** Keep Listens standalone. Do not combine with Rankings or Queue.

## UX structure

### Desktop

```
┌────────────────┬──────────────────────────────────┐
│ Filter rail    │ Page header (existing albums     │
│ (sticky)       │ chrome: My Albums / Listens /    │
│                │ sync)                            │
│ Week | Month   ├──────────────────────────────────┤
│ Only unranked  │ Sections (newest first)          │
│ Only first     │  Sep 7–13 · 12 albums · 4 new    │
│ Release year   │  [listen rows…]                  │
└────────────────┴──────────────────────────────────┘
```

### Mobile

- Full-width timeline  
- **Filters** button opens a shadcn `Sheet` with the same controls as the rail  
- Badge on the button when any non-default filter is active  

### Grouping

- Default: **week**, Monday–Sunday (ISO), newest sections first  
- Toggle: **Week | Month** in the filter rail / Sheet (presentation control, not a data filter)  
- Week label examples: `Sep 7–13`; cross-year: `Dec 29, 2025 – Jan 4, 2026`  
- Month label: keep existing style (e.g. `September 2026`)  
- Section header counts (respect active filters):  
  - **albums** = number of listen rows in the section  
  - **new** = rows with `isFirstListen === true`  
- After filters: omit empty sections; if nothing remains, one empty state in the main column (“No listens match”)

### Filters (v1)

- Only unranked  
- Only first listens (true first listen — see Data)  
- Release year (existing parse of album release date)  
- Plus Week | Month grouping control  

### Rows

- Keep current affordances: art, title/artist, rating pill / Unranked, First, `Nx`, date, overflow menu (delete / convert / etc.)  
- `Nx` = `userAlbums.listenCount`  
- **First** / first-listen filter = `isFirstListen`  
- Rate via existing album rating drawer  
- Mobile: prioritize tap targets; reduce chrome crowding  

## Visual direction

Aligned with Home / shell **cool slate studio** (Fraunces display + Source Sans body, teal accent family).

- **Memorable:** week/month section headers (display type + quiet `12 · 4 new`)  
- **Utilitarian:** dense listen rows — not card-wrapped  
- Prefer shadcn/theme tokens over one-off hex  
- Motion (2–3 only): Sheet open, light section reveal, filter-active badge  

Avoid: purple gradients, cream/terracotta cluster, Inter/system-default stacks, wrapping every row in cards.

## Components (shadcn)

- `Sheet` — mobile filters  
- `Button` — Filters trigger, grouping segmented control  
- `Checkbox` or `Switch` — unranked / first listens  
- `Select` — release year  
- `Badge` — First, Unranked, rating pills (existing patterns OK), filter-active indicator  
- `Separator` / optional `ScrollArea` in rail  

Filter UI lives in a shared presentational block rendered in the desktop rail and the mobile Sheet.

## Data & Convex

### Query contract (server-enriched)

Extend / fix `getUserAlbumListens` (or equivalent Listens query) to:

1. Read `userAlbumListens` with `by_userId_listenedAt` **desc** → **`.take(limit)` before any album joins** (must-fix: no full `.collect()` then slice)  
2. Collect unique `albumId`s in that window  
3. Batch-load `spotifyAlbums` + `userAlbums` (`by_userId_albumId`) for those ids only — O(unique albums in window)  
4. Return enriched rows:

```ts
{
  ...listen,
  album,
  listenCount: number,       // userAlbums.listenCount, or 0 if missing
  firstListenedAt?: number,
  isFirstListen: boolean,    // true first event for this album
}
```

### First-listen rule

```ts
isFirstListen =
  userAlbum != null &&
  listen.listenedAt === userAlbum.firstListenedAt
```

- Matches write path: `firstListenedAt` is `min(listen.listenedAt)`; inserts set `listenedAt` from latest played  
- Do **not** compare `earliestPlayedAt` to `firstListenedAt`  
- Do **not** use window-relative ordinals for badges, First mark, or filters  
- “Only first listens” = rows where `isFirstListen === true`  

### Edge cases

| Case | Behavior |
|---|---|
| Missing `userAlbums` | `listenCount: 0`, `isFirstListen: false` |
| Count / first drift | Trust denormalized `userAlbums`; repair is out of band |
| Multiple listens same day | Timestamp equality, not calendar day |
| True first listen outside the 500 window | Correctly absent from this feed |

### Client pipeline

1. Enriched listens from query  
2. Apply filters (unranked / first / year)  
3. Group by week or month (pure helpers)  
4. Compute section stats; drop empty sections  

Helpers live in a focused module (e.g. `src/lib/album-listens-grouping.ts` or albums `_utils`) and are unit-tested.

### Out of scope for Convex v1

- New tables  
- Server-side week aggregates  
- `Date.now()` inside queries  
- Global “all discoveries ever” feed (would be a separate `userAlbums` by `firstListenedAt` query)

## Architecture notes

- Redesign targets **history view body** + listen query enrichment; keep albums layout chrome (title/sync) unless a tiny label tweak is needed for consistency  
- Filter + grouping state: local React state in v1  
- Reuse existing rating / delete / convert drawers and menus  

## Testing

- Unit tests: week/month grouping labels, section stats under filters, first-listen predicate helpers if extracted  
- Convex/query: limit applied before joins; enrichment attaches `listenCount` / `isFirstListen` correctly for missing `userAlbums` and true first vs replay  
- Manual: desktop rail + mobile Sheet; week default; filter badge; rate in place still works  

## Success criteria

- Week sections by default (Mon–Sun), month toggle works  
- Section shows filtered album count and new (true first) count  
- Filter rail desktop / Sheet mobile  
- `Nx` and First come from `userAlbums`, not window ordinals  
- `getUserAlbumListens` no longer collects unbounded listens before limiting  
- Mobile usable for scan + rate without horizontal filter chaos  
- Listens remains a distinct nav destination under My Albums  

## Follow-ons (not this plan)

- Listening stats module  
- Paginated / infinite Listens history  
- URL-synced filters  
- Shared album drawer + Play soon  
- Smart playlist: listened but unrated (`docs/ideas/2026-09-10-smart-playlist-listened-but-unrated.md`)  

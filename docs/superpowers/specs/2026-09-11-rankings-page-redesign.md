---
title: Rankings page redesign
status: approved-design
date: 2026-09-11
---

# Rankings page redesign

## Goal

Redesign **Rankings** (`/albums/rated`) so it feels like a **living year scoreboard** — pride and excitement first, occasional refinement second — not a filing cabinet of tier buckets.

Primary jobs:

1. **Feel the year** — especially albums that “count” (Top 50), with ceremonial weight at the top  
2. **Triangulate and nudge** order within a framed list (keyboard reorder)  
3. **Optional sharpen** via **Duel mode** (separate ranking truth in v1)

Standalone My Albums view (alongside Listens · Queue · Library). Do not merge with Listens.

## Non-goals (v1)

- Merging duel outcomes into manual `rating` / `position`  
- Full move-event log UI (snapshots only for WoW signals)  
- Highlight-reel stats strip above the list  
- URL-synced filters  
- Shared row component mandate with Listens (same visual language, ranking-specific rows)  
- Snapshotting `year=all` or reconstructing ordinals without a concrete year  
- Writing full-year snapshot entries in v1 (Top 65 only at capture)  
- Reconstructing historical Sundays from `ratingHistory`  
- Dark-mode theme flip or new brand fonts outside the existing shell tokens  

## Jobs & IA

| View | Job |
|---|---|
| Listens | Reflect chronological log + rate in place |
| **Rankings** | **Year judgment / pride scoreboard + optional duel** |
| Queue | Decide triage |
| Library | Searchable catalog |

**Default question on land:** “How’s my year looking — especially the albums that count?”

## Modes

Filter-rail / header control (not a nav tab): **Board** | **Duel**.

| Mode | Truth source | Purpose |
|---|---|---|
| **Board** | `userAlbums.rating` + `position` (manual) | Scoreboard + keyboard reorder |
| **Duel** | Separate duel scores / match history | Pairwise sharpening; never writes manual fields in v1 |

When `year=all`: **Board reorder**, **living signals**, and **Duel** are all disabled.

## Board mode (default)

### Frame

- **#1–50** — primary scoreboard  
- **#51–65** — “on the edge” bubble (+15) in a quiet containing frame; same row family, slightly set apart  
- **Full year** — filter toggle shows remainder below 65 with same decade / tier language  

### Structure

- **Primary dividers:** decades (`1–10`, `11–20`, … `41–50`; edge may be `51–60` + `61–65`)  
- **Tier labels:** thin / zero-height running markers when tier changes (“from here down: Really Enjoyed”) — not chunky section cards  

### Visual hierarchy (frontend-design)

Editorial scoreboard; cool-slate / Fraunces / teal family shared with Listens — more ceremonial than the listen log.

One row family, stepped presence:

| Band | Treatment |
|---|---|
| **#1** | Extra favor beyond podium (distinct ordinal mark / subtle focal frame / largest art) — one hero |
| **#2–3** | Podium scale: large cover, display-weight title, generous pad |
| **#4–5** | Elevated, slightly tighter than podium |
| **#6–10** | Clear top-ten density |
| **#11–25** | Strong standard row |
| **#26–50** | Slimmer Listens-adjacent density |
| **#51–65** | Slim rows inside quiet edge container |

Light motion: staggered reveal on top band only; NEW / ↑↓ as small settled chips.

Mobile: same ladder compressed; decades retained; edge box full-width under 50.

### Living signals (Board + concrete year only)

Compare **live ordinals** to **last Sunday** freeze (not rolling 7-day).

| Signal | Rule |
|---|---|
| **NEW** | Now ≤50 and last Sunday missing from Top 50 or prior ordinal >50 |
| **↑↓ spots** | `priorOrdinal − currentOrdinal` when present in both freezes |
| Conflict | Prefer **NEW**; suppress ± on that row |
| No prior Sunday | Quiet — no fake NEW flood (“Movement tracking starts next Sunday”) |
| `year=all` | Hide living signals |

### Reordering

- Keyboard select + ↑↓ within the **visible framed list** (Top 65 by default; full year when Full is on)  
- Existing ranker drawer remains available  
- Reorder enabled only for a **specific year** (same constraint as today)  

## Duel mode

### UX (frontend-design + shadcn)

Focused arena: one matchup owns the viewport.

- Header: `Board | Duel`, year, **Skip**, **Undo** (last pick)  
- Two equal large cards (cover + title + artist + quiet duel rank); whole card is the hit target  
- Keyboard: ←/→ or 1/2 to pick  
- After pick: brief settle → next pair; no score explosion  
- Mobile: stack A over B  
- Optional slim “Duel Top 50” disclosure under the arena (proof ladder exists) — not the hero  

### Pairing & scoring (v1)

- Pool: rated albums for a **concrete** release year only  
- When `year=all`: Duel mode disabled (same as reorder + living signals)  
- Prefer nearby duel-strength or high-uncertainty pairs (not tied to manual decade)  
- Algorithm: **Elo** for v1 (TrueSkill later if needed); seed mild prior from rating bands then diverge  
- Persist each match with **required** `aBefore` / `bBefore` (and after) score snapshots  
- **Undo:** only the user’s latest non-undone match; restore both scores from before; set `undoneAt`; second undo is a no-op / error  
- Pick + score update in one mutation; verify both `userAlbumId`s belong to `userId` and `winner ∈ {a,b}`  
- Pairing as `query` / `internalQuery`; score writes only inside the pick / undo mutations  

### Data isolation

Duel writes **only** duel tables. Never patch `userAlbums.rating` / `position` in v1.

## Filters / chrome

Listens paradigm: desktop sticky rail **beside** the list cluster; mid/mobile → Filters button + right `Sheet`.

| Control | Notes |
|---|---|
| Year | Required for reorder, WoW, and Duel; `all` disables all three |
| Frame | Top 50+edge (default) \| Full year |
| Mode | Board \| Duel |
| Hint | Quiet copy when no prior snapshot yet |

No Listens-style unranked / first-listen filters on this page.

## Data model (Convex)

### Manual truth (unchanged)

`userAlbums.rating` (1–15) + `position` within **rating band** (not “within year”). Live ordinal for a concrete release year = sort **rating DESC, position ASC** among rated albums whose `spotifyAlbums.releaseDate` parses to that year (exclude null/unparseable dates from year boards).

Do **not** store live ordinal on `userAlbums`.

`userAlbums` has no `releaseYear` today — live Board and cron both join `spotifyAlbums` and parse year (same as current `rated/page.tsx`). Optional later denorm.

### Sunday snapshots (Board WoW)

Header + entries (not one giant array). **v1 capture depth: Top 65 only.**

**`manualRankingSnapshots`**

- Fields: `userId`, `year`, `weekSundayUtcMs`, `capturedAt`, `entryCount`, `status: "pending" | "complete"`  
- Index: `by_user_year_week` → `[userId, year, weekSundayUtcMs]`  

**`manualRankingSnapshotEntries`**

- Fields: `snapshotId`, `userId`, `year`, `weekSundayUtcMs`, `userAlbumId`, `albumId`, `ordinal`, `rating`, `position`  
- Indexes:  
  - `by_snapshotId` → `[snapshotId]` (or `[snapshotId, ordinal]`)  
  - `by_user_year_week_ordinal` → `[userId, year, weekSundayUtcMs, ordinal]`  
  - `by_user_album_week` → `[userId, userAlbumId, weekSundayUtcMs]`  

**`weekSundayUtcMs`:** UTC midnight of that Sunday. Client and cron share one helper.

**Cron (Convex `crons.ts`):** weekly Sunday UTC → `internalMutation` orchestrator that:

1. Lists users with rated albums  
2. `ctx.scheduler.runAfter(0, internal....captureUserWeek, { userId, weekSundayUtcMs })` **per user** — never write all users in one mutation  

**Per-user capture (`internalMutation`, idempotent):**

1. Use `weekSundayUtcMs` from args (orchestrator may use `Date.now()` once to pick the week)  
2. Load `userAlbums` via `by_userId`; join `spotifyAlbums`; parse release year; keep rated only; exclude unparseable years  
3. Group by year; for each year with ≥1 rated album (optionally limit to years with recent activity so cron doesn’t grow forever):  
   - Lookup header `by_user_year_week`; if `status === "complete"` → skip  
   - Else upsert header `pending`, delete any prior entries for that snapshot, write Top 65 entries, set `complete`, `entryCount`, `capturedAt`  
4. Retention: keep last N Sundays per user×year (e.g. 12–52); prune older  

**Client WoW query:** pass `weekSundayUtcMs` (previous Sunday). Load header by `by_user_year_week` where `status === "complete"`; load entries via `by_snapshotId` or `by_user_year_week_ordinal`. **No `Date.now()` in queries.**

**Seed:** optional `internalMutation` on ship; until a prior complete week exists, UI stays quiet.

**Auth:** snapshot writers **internal only** (cron/scheduler). Seed = `internalMutation`, not client-callable.

### Duel tables

**`albumDuelScores`** — `userId`, `userAlbumId`, `albumId`, `elo`, `matches`, `updatedAt`; indexes `by_user`, `by_user_userAlbum`.

**`albumDuels`** — `userId`, `aUserAlbumId`, `bUserAlbumId`, `winnerUserAlbumId`, **required** `aBefore` / `bBefore` / `aAfter` / `bAfter`, `createdAt`, `undoneAt?`; index `by_user_createdAt`.

**Auth:** public duel mutations take `userId` (existing app pattern) but **must** verify both albums belong to `userId` and `winner ∈ {a,b}`. All public functions: `args` + `returns` validators.

### Live Top N performance

Personal scale: `by_userId` + join + filter year in TS is fine for v1. Avoid unbounded “all years” collect for WoW.

## Build order

1. Board UI: Top 50 + edge 65, decades, tier runners, visual ladder, Full toggle, filter rail  
2. Snapshot schema + per-user Sunday cron + seed + retention  
3. NEW / ↑↓ on Board (client passes `weekSundayUtcMs`)  
4. Duel tables + arena UI + Undo + mode toggle (disabled when `year=all`)  

## Success criteria

- Landing on a concrete year feels special (hero #1, clear Top 50, edge bubble) without losing triangulation  
- Week-over-week NEW / ± appear after the second Sunday snapshot  
- Keyboard reorder still works in the framed list  
- Duel mode is usable and clearly separate from manual order; Undo works once  
- `year=all` does not show WoW, enable reorder, or allow Duel  

## Open implementation choices (non-blocking)

- Exact #1 “crown” motif within the row family  
- Whether edge decade headers are `51–60`/`61–65` or a single “On the edge” label  

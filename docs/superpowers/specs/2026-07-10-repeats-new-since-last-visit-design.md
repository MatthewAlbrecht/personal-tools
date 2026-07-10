# Music Funnel: New-since-last-visit highlights

**Date:** 2026-07-10  
**Status:** Approved design  
**Idea:** `docs/ideas/2026-07-10-repeats-highlight-new-since-last-visit.md`

## Goal

Make it obvious what changed since the last music-funnel visit: louder “What you missed” alert, Gmail-style “New” on repeat rows that *became* repeats, and the same treatment on timeline syncs from that window. Unify track/album/artist repeats into one recent-first feed with a clear source multiplier.

## Product behavior

### Unified repeats feed

- Replace the three separate repeat cards with **one list**.
- Mix **tracks, albums, and artists**; each row labeled by type (`Track` / `Album` / `Artist`).
- Sort by **`latestSeenAt` descending** (last activity first).
- Show source multiplier prominently on the row (e.g. **3×**), plus source names and existing secondary metadata as needed.

### What counts as “New” (repeats)

A row is **new** when it **crossed into repeat status** after the visit cursor: it reached **2+ distinct sources**, and that crossing time (`becameRepeatAt`) is after `visitSince`.

Not new merely because an existing repeat gained another source later (unless that later event is what first crossed the 2-source threshold — then `becameRepeatAt` is that moment).

### What counts as “New” (timeline)

A timeline source-run row is **new** when:

- `startedAt > visitSince`, and
- the run had meaningful activity: `newEncounters > 0` **or** any of `trackRepeatsFound` / `albumRepeatsFound` / `artistRepeatsFound` > 0.

### Soft-clear visit cursor

Gmail-like across visits, stable within a visit:

1. **`localStorage`** key (reuse existing): `music-funnel-last-seen-${userId}` — last leave time.
2. **`sessionStorage`**: `visitSince` for this browser tab session.
3. On **first load of a session**: read localStorage into sessionStorage (if missing/invalid, use `Date.now()` and do not show New/banner for a cold first visit).
4. **Do not** write localStorage on load.
5. On **leave** (`pagehide` and/or `visibilitychange` → hidden): write `Date.now()` to localStorage.
6. Refresh mid-visit keeps the same `visitSince` → highlights remain.
7. Next visit uses the leave timestamp → previous New items are normal.

### “What you missed” banner

- Keep the banner; make it **visually louder** (stronger border/background using the same accent family as New rows — not muted gray).
- Use the **same `visitSince`** as row/timeline highlights.
- Repeat counts in the banner must align with **new rows in the unified feed** (by type), not a separate heuristic that can disagree with highlighted rows.
- Sync count can remain run-based (runs since `visitSince` with activity), consistent with timeline New rules.
- Show the banner on **both** Timeline and Repeats tabs when there is something to miss.
- **Okay** dismisses the banner for **this visit only**; it does **not** advance the leave cursor early (soft-clear owns that).

### Visual treatment (“New” chrome)

Shared treatment for new repeat rows and new timeline rows:

- Strong left accent bar
- Light background tint
- Small **New** label/chip

Banner uses a louder variant of the same accent.

## Architecture

### Backend

Add (or replace the three list queries with) a single Convex query, e.g. `listRepeats`, that:

- Builds track, album, and artist repeats from existing encounters (same ≥2 distinct sources rule as today).
- For each row returns: `type`, identity fields, display fields, `sourceCount`, sources, `firstSeenAt`, `latestSeenAt`, and **`becameRepeatAt`**.
- **`becameRepeatAt`**: derived — per entity, take the earliest `firstSeenAt` per distinct source, sort those times, use the **second** earliest (moment a second source appeared). No new tables.
- Sort by `latestSeenAt` descending.
- Apply a single mixed limit of **60** rows (adjustable later if needed).

Existing `listTrackRepeats` / `listAlbumRepeats` / `listArtistRepeats` may be removed from the UI path once the unified query is wired; keep or delete unused exports as a cleanup detail in the plan.

### Frontend

- Extract a small **visit-cursor** helper (read session `visitSince`, persist leave to localStorage) shared by banner, repeats list, and timeline.
- Refactor `MusicFunnelRepeatLists` to one feed + New chrome via `becameRepeatAt > visitSince`.
- Apply the same New chrome in `MusicFunnelTimeline` for qualifying runs.
- Restyle `MusicFunnelMissedBanner`; drive repeat tallies from the unified feed + `visitSince`; show on both tabs.

## Edge cases

| Case | Behavior |
|------|----------|
| No prior localStorage value | First visit: set session `visitSince` to now; no New; no banner |
| Empty repeats / empty timeline | Unchanged empty states |
| Banner Okay | Hide banner this visit; highlights unchanged; leave still advances cursor |
| Per-browser storage | Acceptable for personal tools; no cross-device sync |
| Run with zero activity | Not New on timeline; not counted in sync “missed” |

## Out of scope

- Expandable timeline sync details / “what tracks were added”
- Deep-link from banner to specific new rows
- Persisting visit cursor in Convex / cross-device
- Changing sync/job behavior
- Dashboard modules

## Success criteria

- One repeats feed: mixed types, `latestSeenAt` order, clear multiplier.
- New repeats (became ≥2 sources after `visitSince`) visually obvious.
- New timeline syncs in the same window visually obvious with the same chrome.
- Banner louder, on both tabs, counts consistent with highlighted new repeats.
- Soft-clear: refresh keeps New; next visit clears without requiring Okay.

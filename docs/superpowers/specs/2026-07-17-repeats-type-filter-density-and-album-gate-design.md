# Music Funnel: Repeats type filter, denser rows, and album-type gate

**Date:** 2026-07-17  
**Status:** Approved design  
**Ideas:**
- `docs/ideas/2026-07-17-repeats-type-filter-and-denser-rows.md`
- `docs/ideas/2026-07-17-stricter-album-type-for-repeats.md`

## Goal

Make the music-funnel repeats feed easier to scan: filter by type, compress each row to essentials, and stop treating Spotify singles/EPs as album repeats. Only Spotify `album` and `compilation` qualify as album repeats.

## Product behavior

### Type filter

- Single-select chips above the unified list: **All · Tracks · Albums · Artists**.
- Default: **All**.
- Filter client-side on the existing mixed feed (`type: "track" | "album" | "artist"`).
- No URL persistence for the chip in this pass.
- When a chip leaves the visible list empty: short empty copy (e.g. “No album repeats”).

### Feed size

- Raise the unified `listRepeats` cap from **60 → 100**.
- No pagination / “load older” in this pass — 100 is enough for scanning recent repeats.

### Dense repeat row

One shared row for all types. Default visible content:

| Element | Behavior |
|--------|----------|
| Type icon | Leading icon only — **no artwork**. Music note (track), CD/disc (album), person/avatar (artist). Color-coded by type. |
| Title | Track / album / artist name |
| Multiplier | `sourceCount`× (e.g. `3×`) |
| New chrome | Existing New badge / left rail when `becameRepeatAt > visitSince` |
| Contributing count | Album and artist only: icon + number (not “N contributing tracks” prose) |

**Dropped from the default row:** artwork, text type label (`Track` / `Album` / `Artist`), source name list, first/last-seen timestamps.

### What counts as an album repeat

Unchanged structure, stricter type gate:

1. Group encounters by `spotifyAlbumId`.
2. Require **≥2 distinct sources** (same as today).
3. Require Spotify album type **`album` or `compilation`**.
4. Exclude `single` (covers typical singles and EPs in Spotify’s model).
5. Exclude **missing** type (fail closed until backfilled).

Track and artist repeat rules are unchanged. Excluded singles/EPs can still appear as track or artist repeats when those rules qualify.

“What you missed” / New-since-visit semantics are unchanged. Album counts in the banner may drop after the gate — that is correct.

## Data & ingest

### Persist `album_type` from playlist payloads

Playlist track items already include `album.album_type`. No extra Spotify call on normal sync.

- Add optional (then required after backfill) field on `musicFunnelTrackEncounters`, e.g. `spotifyAlbumType: "album" | "single" | "compilation"`.
- Thread through `normalizePlaylistTrack` and encounter write paths so new syncs always store it.

Do **not** reuse album-library `albumType` (`"album" | "single"` from track-count heuristics). Music-funnel uses Spotify’s `album_type` only.

### One-time backfill

For existing encounters missing `spotifyAlbumType`:

1. Collect distinct `spotifyAlbumId`s with missing type.
2. Batch Spotify album lookups.
3. Patch encounters with the returned `album_type`.

Run as a one-shot internal/backfill path during ship (dev then prod), not a user-facing control. After backfill, album repeats recompute from encounters with the strict gate.

## Architecture

### Backend

- Schema + ingest: store `spotifyAlbumType`.
- Shared builders: gate in `buildAlbumRepeats` (Convex UI path) and `computeAlbumRepeatSummaries` (sync utils) so UI and sync analytics stay aligned.
- `listRepeats`: apply album gate; sort still `latestSeenAt` desc; **limit 100**.
- Backfill: internal action/mutation using Spotify album API; patch encounters.

### Frontend

Primary surface: `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx` (and small helpers/icons as needed).

- Chip control for type filter (local state).
- Redesign `RepeatRow` per dense-row table above.
- Keep visit-cursor / New chrome behavior from the existing new-since-last-visit design.

## Out of scope

- Pagination or infinite scroll past 100 rows
- Multi-select type filter or URL-synced chips
- Expanding a row to reveal sources / timestamps
- Changing track or artist repeat qualification rules
- Migrating or redirecting other album-type concepts (library heuristics, for-later)

## Verification

- Unit: album builders include `album` / `compilation`; exclude `single` and missing type; sync utils match Convex builder.
- Manual: chips filter correctly; rows are dense and icon-led; after backfill, no single/EP rows under Albums; New chrome still works; banner album counts match gated feed.

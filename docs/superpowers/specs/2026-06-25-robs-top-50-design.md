# Rob's Top 50 — Product/Technical Spec

## Overview

Build a public archive of Robert's yearly top-50 album lists (last ~10 years) and repurpose the existing `/robs-rankings` page as the authenticated editor for creating and maintaining those lists.

**Workflow:** Robert (or an admin) creates an ordered Spotify playlist with up to 50 tracks representing the year's list, imports it into the app, fine-tunes positions and gaps manually, then publishes the year for public viewing.

This replaces the current guessing-game behavior (locked/confirmed statuses, bucket constraints) with a straightforward ranked list editor and a separate read-only public page.

## Goals

- Public page at `/public/robs-top-50` showing published years and ranked albums (cover, artist, album, spot number).
- Authenticated editor at `/robs-rankings` for import, manual add/remove, reorder, and publish.
- Spotify playlist import that seeds album entries in playlist order.
- Keyboard reordering: ↑/↓ to select, **⌥ + ↑/↓** to move (existing pattern from `RankingBoard`).
- All entries linked to `spotifyAlbums` for future RYM genre/descriptor stats.
- Home page and nav updated so the public archive is easy to find.

## Non-Goals (v1)

- Cross-year comparison matrix (all #1s in a row, etc.).
- Genre/descriptor stats UI (data model supports it later via RYM links).
- Guessing game / prediction mechanics.
- Merge/append import modes (replace-only with confirmation).
- Automated RYM scrape triggering on import.
- Dedicated admin-only route separate from `/robs-rankings`.

## Existing Patterns To Match

| Area | Reference |
|---|---|
| Public unauthenticated pages | `src/app/public/lyrics/` — no auth middleware on `/public/*` |
| Playlist import dialog | `src/app/rooleases/_components/import-playlist-dialog.tsx` |
| Playlist track fetch | `getAllPlaylistTracks()` in `src/lib/spotify.ts` |
| Album upsert | `api.spotify.upsertAlbum` in `convex/spotify.ts` |
| Ranked list + keyboard UX | `src/app/robs-rankings/_components/ranking-board.tsx` |
| Spotify API route pattern | `src/app/api/spotify/seed-artists/route.ts` |
| Public Convex queries | No auth check; return only published data |

## Product Behavior

### Public Page — `/public/robs-top-50`

**Audience:** Anyone, no sign-in.

**Layout:**

- Page title: e.g. "Rob's Top 50"
- Year pills across the top — only years with `published === true`, sorted descending (newest first).
- Default selected year: most recent published year.
- Optional hero card for #1 album of selected year (cover, artist, title, large rank badge).
- Vertical ranked list for selected year:
  - Rank number (1–50)
  - Album cover (fallback placeholder if missing)
  - Artist name
  - Album name
- Empty state when no years published: friendly message, no auth prompt.
- Empty state for a year with no entries: should not appear if publish is gated (see publish rules).

**UX notes:**

- One year visible at a time (not horizontal cross-year rows).
- Mobile-first: compact rows, readable rank numbers.
- No edit controls, no keyboard shortcuts.

**Optional deep link (v1 nice-to-have):** `/public/robs-top-50?year=2024` selects that year if published.

### Editor — `/robs-rankings` (repurposed)

**Audience:** Authenticated user(s) who maintain the lists.

**Layout:**

- Header: "Rob's Top 50 — Editor" (or similar)
- Year `<select>`: current year down to 2016 (or 2015); show checkmark for years with entries
- Actions row:
  - **Import from Spotify** — opens dialog
  - **Add album** — opens search/picker (inline drawer or dialog)
  - **Publish / Unpublish** toggle for current year
  - **View public page** link (enabled when year is published)
- Single unified ranked list (remove picker/rank mode toggle)
- Visual section dividers for rank ranges 1–10, 11–20, … 41–50 (display only, no game logic)

**Keyboard shortcuts** (when focus not in input/select):

| Key | Action |
|---|---|
| ↑ / ↓ | Move selection up/down |
| ⌥ + ↑ / ⌥ + ↓ | Move selected album up/down one position |
| Esc | Clear selection |

Remove ← confirm and → lock-to-bucket shortcuts and all related UI.

**Manual add:**

- Search existing `spotifyAlbums` or paste Spotify album URL/ID to upsert and add.
- If list has fewer than 50 albums: append at next position.
- v1: adding when at 50 shows error toast (no insert-at-position UI in v1 unless trivial to reuse existing swap logic).

**Manual remove:**

- Remove button on row (or keyboard shortcut deferred to v2).
- On remove: delete entry, shift higher positions down by 1.

**Publish rules:**

- Toggle sets `published: true` and `publishedAt: Date.now()` on `robRankingYears`.
- Unpublish sets `published: false`; `publishedAt` cleared or retained (implementation choice — prefer retain for audit).
- Recommend requiring at least 1 album before publish; warn (not block) if fewer than 50.
- Published lists are snapshots: edits in editor reflect immediately on public page (live subscription).

### Import from Spotify

**Trigger:** "Import from Spotify" button → dialog.

**Dialog fields:**

- Text input: Spotify playlist URL, URI, or bare playlist ID
- Primary action: Import
- Loading state during fetch

**Behavior:**

1. Client obtains Spotify access token (same as other Spotify tools via `useAuthToken` / session).
2. POST to new API route with `{ playlistId, yearId, accessToken }`.
3. Server fetches all playlist tracks in order via `getAllPlaylistTracks`.
4. For each track, extract `track.album.id` (Spotify album ID).
5. **Dedupe:** walk tracks in playlist order; skip tracks whose album ID was already seen; first occurrence determines rank.
6. For each unique album in order:
   - Fetch full album from Spotify API if needed for upsert fields.
   - Upsert into `spotifyAlbums` via Convex `upsertAlbum`.
7. If year already has entries: show confirmation dialog ("Replace existing list with import?"). On confirm, delete all `robRankingAlbums` for that year and insert fresh rows positions 1–N.
8. Return summary: `{ imported: number, duplicatesSkipped: number, totalTracks: number }`.
9. Toast result; user fills gaps manually for non-Spotify albums or skipped duplicates.

**Limits:**

- Cap at 50 albums from import (take first 50 unique albums in playlist order; toast if playlist has more).
- Import with 0 resolvable albums: error toast, no data change.

## Data Model

### `robRankingYears` (extend existing)

```typescript
{
  userId: string;       // editor owner; unchanged
  year: number;       // e.g. 2024
  published: boolean; // default false
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}
```

**New index:** `by_published_year` on `["published", "year"]` for public year listing (or filter published in query if index not needed at this scale).

**Migration:** existing rows get `published: false`.

### `robRankingAlbums` (simplify usage)

Keep existing shape for migration safety; stop using `status` in UI and mutations:

```typescript
{
  userId: string;
  yearId: Id<"robRankingYears">;
  albumId: Id<"spotifyAlbums">;
  position: number; // 1–50
  status: string;   // legacy field; always write "none"; ignore in UI
  createdAt: number;
  updatedAt: number;
}
```

**Future cleanup (not v1):** remove `status` column and game-related mutation guards.

### New Convex functions

| Function | Type | Purpose |
|---|---|---|
| `listPublishedYears` | public query | Years where `published === true`, sorted desc |
| `getPublishedAlbumsForYear` | public query | Ranked albums + `spotifyAlbums` join for a published year |
| `setYearPublished` | mutation | Toggle publish; auth required |
| `replaceYearFromAlbums` | mutation | Atomic replace of all ranking rows for a year (used by import) |
| `getYearsForUser` | query | Extend to return `{ year, hasEntries, published }` |

**Remove or no-op in UI:** `updateAlbumStatus`, `randomizeOrder`, confirmed/locked guards in `updateAlbumPosition` and `batchUpdatePositions`.

### Import API route

**Path:** `POST /api/spotify/import-robs-top-50`

**Request:**

```typescript
{
  playlistId: string;
  yearId: string; // Convex Id
  accessToken: string;
  replace: boolean; // true after user confirms
}
```

**Response:**

```typescript
{
  imported: number;
  duplicatesSkipped: number;
  totalTracks: number;
}
```

Uses `ConvexHttpClient` server-side to call `replaceYearFromAlbums` after upserting albums.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  /robs-rankings (editor, auth)                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐ │
│  │ Import Dialog│→ │ Next API route  │→ │ Spotify API   │ │
│  └──────────────┘  │ import-robs-    │  └───────────────┘ │
│  ┌──────────────┐  │ top-50          │  ┌───────────────┐ │
│  │ RankingBoard │← │                 │→ │ Convex        │ │
│  │ (simplified) │  └─────────────────┘  │ upsertAlbum   │ │
│  └──────────────┘                        │ replaceYear…  │ │
│         │                                └───────────────┘ │
│         └────────────── Convex mutations (reorder, publish)│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  /public/robs-top-50 (no auth)                              │
│  useQuery(listPublishedYears)                               │
│  useQuery(getPublishedAlbumsForYear, { year })              │
└─────────────────────────────────────────────────────────────┘
```

## Component Changes

| File | Change |
|---|---|
| `src/app/robs-rankings/page.tsx` | Unified editor layout; import dialog; publish toggle; remove mode toggle |
| `src/app/robs-rankings/_components/ranking-board.tsx` | Remove status toggles, confirmed/locked move guards, ←/→ hints |
| `src/app/robs-rankings/_components/album-picker.tsx` | Simplify or fold into add-album dialog |
| `src/app/robs-rankings/_components/import-playlist-dialog.tsx` | **New** — modeled on rooleases import dialog |
| `src/app/public/robs-top-50/page.tsx` | **New** — public archive |
| `src/app/public/robs-top-50/_components/year-list.tsx` | **New** — ranked display + skeleton |
| `src/app/page.tsx` | Add public link for Rob's Top 50 |
| `src/app/_components/site-header.tsx` | Update nav if needed |
| `convex/robRankings.ts` | Public queries, publish mutation, replace mutation, remove game guards |
| `convex/schema.ts` | Add `published`, `publishedAt` to `robRankingYears` |

## Future Stats Hook (Phase 2 — not built in v1)

Each `robRankingAlbums.albumId` → `spotifyAlbums` → `rateYourMusicSpotifyAlbumLinks` → `rateYourMusicReleaseGenres` / `rateYourMusicReleaseDescriptors`.

Enables:

- Genre breakdown per year or across all years
- Repeat artists across years
- Descriptor clouds
- Cross-year comparison views

No schema changes required beyond maintaining `spotifyAlbums` links on import.

## Error Handling

| Scenario | Behavior |
|---|---|
| Not authenticated (editor) | `LoginPrompt` |
| Spotify token missing on import | Toast: sign in to Spotify |
| Invalid playlist URL | Toast: invalid URL |
| Import on year with data | Confirmation before replace |
| >50 unique albums in playlist | Import first 50; toast remainder ignored |
| Duplicate album in playlist | Skip; count in `duplicatesSkipped` |
| Move/reorder failures | Toast with error message |
| Publish with 0 albums | Block with toast |
| Public query for unpublished year | Return empty / 404 year |

## Testing / Verification

No test framework configured. Manual verification:

1. Import a real Spotify playlist → albums appear in order with covers.
2. ⌥+↑/↓ reorders; refresh persists order.
3. Publish year → visible on `/public/robs-top-50`.
4. Unpublish → disappears from public year pills.
5. Public page works logged out / incognito.
6. Replace import on populated year → confirmation → list replaced.
7. `pnpm typecheck` and `pnpm check` pass.

## Implementation Order

1. Schema migration: `published`, `publishedAt` on `robRankingYears`
2. Convex: public queries, `setYearPublished`, `replaceYearFromAlbums`; strip game guards
3. Simplify `RankingBoard` and editor page
4. Import API route + import dialog
5. Public page `/public/robs-top-50`
6. Nav / home page link updates

## Open Decisions (resolved for v1)

| Decision | Choice |
|---|---|
| Import mode | Replace only (with confirmation) |
| Public UX | One year at a time, year pills |
| Guessing game | Remove from UI and mutation logic; keep `status` field unused |
| Data ownership | Keep `userId` on existing tables; public queries ignore userId, filter by `published` |
| Deep link | Optional `?year=` query param |

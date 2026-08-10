# Non-Spotify Albums — Design Spec

**Date:** 2026-08-10  
**Status:** Approved for implementation  
**Idea:** `docs/ideas/2026-08-10-add-non-spotify-albums-with-listens-and-rym.md`

## Overview

Users need to add albums that are not on Spotify into the album library, optionally record a listen, and associate RYM scrapes the same way as Spotify-backed albums. Today the catalog (`spotifyAlbums`), add-album flow, and manual listen entry all require a Spotify album ID.

## Goals

- Add a **manual** album (no Spotify) to the shared catalog + current user’s library.
- Required fields: **title**, **artist**, **year**. Optional: **cover image URL**.
- Optional **record a listen** in the same create flow (checkbox + date; default today).
- Extend the existing **Add album** dialog with Spotify vs Manual modes (tabs).
- Block duplicates: if an album with the same normalized title + artist already exists, do not create; surface the existing album.
- Manual albums must support existing RYM associate (title/artist + manual link) and appear in `/albums/all`.

## Non-Goals

- Renaming `spotifyAlbums` → `albums` (naming debt deferred).
- Fake Spotify IDs (`manual_*`) or a parallel `manualAlbums` table.
- Searching Spotify by name/artist for manuals.
- Auto-linking a manual album to Spotify later (may be a follow-up).
- Enrichment pipeline / Genius / smart-playlist Spotify ID arrays for manuals.
- Redesigning `/albums/all` layout beyond the Add album dialog.
- Changing For Later playlist ingest or `spotifyPlayEvents` sync.

## Decisions

| Topic | Choice |
|-------|--------|
| Catalog approach | Keep `spotifyAlbums`; add `source`; make `spotifyAlbumId` optional |
| Identity | Convex `_id` (`albumId`) for listens, library, RYM |
| Create UI | Tabs on existing Add album dialog: Spotify \| Manual |
| Fields | Title, artist, year required; cover URL optional |
| Listen | Optional checkbox + date in Manual tab |
| Duplicates | Block on normalized title + artist match |

## Information architecture

**Entry:** `/albums/all` → **Add album** (unchanged placement).

**Dialog modes (local nav inside dialog):**

1. **Spotify** — existing paste URL/ID flow (default when opening dialog).
2. **Manual** — form for non-Spotify albums.

**After create:** Album appears in the library index like any other row. Spotify-only chrome (open in Spotify, sync-derived signals) stays hidden/disabled when `source === "manual"` or `spotifyAlbumId` is missing. RYM associate drawer already keys off `albumId` — no new RYM IA.

**Labels:** Use “Manual” (not “Custom” / “Offline”) so the mode reads as “not from Spotify.”

## Data model

### `spotifyAlbums`

```ts
source: v.union(v.literal("spotify"), v.literal("manual")),
spotifyAlbumId: v.optional(v.string()), // required in mutation when source === "spotify"
name: v.string(),
artistName: v.string(),
albumTitleKey: v.optional(v.string()),
imageUrl: v.optional(v.string()),
releaseDate: v.optional(v.string()), // manual: "YYYY"; Spotify: existing shapes
totalTracks: v.number(), // manual: 0 when unknown
// …existing optional fields unchanged
```

Indexes: keep `by_spotifyAlbumId`, `by_albumTitleKey`, `by_createdAt`. Add `by_source_createdAt` only if needed for filtering; not required for v1.

### Projections

`albumLibraryItems.spotifyAlbumId` becomes **optional** (omit / undefined for manuals). Projection builder copies `album.spotifyAlbumId` when present.

Other tables that denormalize required `spotifyAlbumId` from catalog rows (e.g. enrichments) are **out of scope** unless a write path for manuals already touches them — do not enrich manuals in v1.

### Backfill

One-time internal migration (or lazy patch on read/write): existing `spotifyAlbums` rows without `source` get `source: "spotify"`. Prefer a small internal mutation / script run once in dev+prod rather than leaving `source` undefined forever.

### Duplicate rule

Before insert of a manual album:

1. `albumTitleKey = normalizeAlbumTitle(name)`
2. Query `spotifyAlbums` with `by_albumTitleKey`
3. If any candidate has `normalizeArtistName(artistName)` equal to the input artist → **duplicate**
4. Return existing `albumId` (+ whether already in this user’s library) without inserting a second catalog row

Year is **not** part of the duplicate key (title + artist only).

### Sync safety

`upsertSpotifyAlbumRecord` must only match on a real Spotify ID. Never assign or invent Spotify IDs for `source: "manual"` rows. Spotify upserts must not overwrite manual rows by title/artist.

## Backend API

### `addManualAlbumToLibrary` (new mutation)

**Args:**

- `userId: string`
- `name: string`
- `artistName: string`
- `releaseYear: number` (1000–9999; stored as `releaseDate: String(year)`)
- `imageUrl?: string`
- `recordListen?: boolean` (default false)
- `listenedAt?: number` (ms; required if `recordListen`; client defaults to start of local day or “now”)

**Handler:**

1. `requireAuth`
2. Validate non-empty trimmed name/artist; validate year
3. Duplicate check (above)
4. If duplicate: ensure library projection exists for user; optionally record listen if requested; return `{ albumId, name, artistName, alreadyExists: true, alreadyInLibrary, listenRecorded }`
5. Else insert `spotifyAlbums` with `source: "manual"`, no `spotifyAlbumId`, `totalTracks: 0`, `albumTitleKey`, etc.
6. `upsertAlbumLibraryProjection`
7. If `recordListen`: create listen via shared helper keyed by `albumId` (empty `trackIds`, `source: "manual"`), refresh projections
8. Return `{ albumId, name, artistName, alreadyExists: false, alreadyInLibrary: false, listenRecorded }`

### Listen by `albumId`

Extend or add a path so listens can be recorded by `albumId: Id<"spotifyAlbums">` without requiring `spotifyAlbumId`. Prefer extracting the body of `addManualAlbumListen` into a helper used by both Spotify-ID and albumId entry points. Spotify add-listen UI may keep using Spotify ID; manual create uses `albumId`.

### Existing Spotify add path

`addAlbumToLibrary` / `upsertSpotifyAlbumRecord` set `source: "spotify"` on write. No UI change to Spotify tab behavior beyond tabs chrome.

## UI / frontend design

**Tone:** Match existing albums product UI (shadcn new-york, current tokens). Do not introduce a separate visual system for this dialog. Compact density consistent with the current Add album dialog.

**Components (shadcn):**

- Existing: `Dialog`, `Button`, `Input`, `Label`, `Checkbox`
- Add: `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` via shadcn CLI if missing
- Date: `Input type="date"` is enough for v1 (no new calendar dependency)

**Manual tab layout (single column):**

1. Title (required)
2. Artist (required)
3. Year (required, 4-digit)
4. Cover image URL (optional) + small preview when URL looks valid
5. Checkbox: “Also record a listen” — when checked, show date field (default today)
6. Primary **Add album** / Cancel

**Feedback:**

- Success toast with name/artist; mention listen if recorded
- Duplicate: toast/info that album already exists; if not in library, still project into library; offer navigation to album details when possible (`/albums/details/[albumId]` or existing route)
- Validation errors inline or toast; dialog stays open

**Library / details:**

- Rows without Spotify ID: no “Open in Spotify” (or equivalent) actions
- Manual albums remain filterable/sortable by title, artist, year, listens, RYM status like others

## RYM

No new RYM APIs. Manual albums:

- Auto `spotify_id` match: N/A
- Auto `title_artist`: works via `albumTitleKey` + artist keys
- Manual associate drawer: already takes `albumId`

## Errors

| Case | Behavior |
|------|----------|
| Missing title/artist/year | Client validation; dialog open |
| Invalid year | Client + server validation |
| Duplicate title+artist | No second catalog row; return existing; toast |
| Listen without album | Server throws; toast |
| Auth missing | Toast; dialog open |

## Testing

- Unit/source tests for mutation existence and duplicate/listen branches (match existing `spotify.add-album-to-library-source.test.ts` style)
- Schema/projection: optional `spotifyAlbumId` for manuals
- Pure helpers for year → `releaseDate` if extracted
- Manual smoke: create manual → appears in list → optional listen → RYM associate drawer links

## Success criteria

1. Manual album with title/artist/year (+ optional cover) lands in library without Spotify.
2. Optional listen records against that `albumId`.
3. Duplicate title+artist is blocked / reused, not double-inserted.
4. RYM associate works for the new album.
5. Spotify add path still works unchanged aside from `source` tagging.

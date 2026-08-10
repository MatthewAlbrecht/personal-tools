# Bandcamp Album Capture — Design Spec

**Date:** 2026-08-10  
**Status:** Approved for implementation  
**Branch:** stay on current branch (`main` at approval time)  
**Related:** `docs/superpowers/specs/2026-08-10-non-spotify-albums-design.md`

## Overview

Extend the existing RYM browser extension so a Bandcamp **album** page (`*/album/*`) can be captured into the album library via an obvious floating button. Captured rows live in `spotifyAlbums` with `source: "bandcamp"` and a canonical `bandcampUrl`, then project into the user’s `albumLibraryItems` like manual albums.

## Goals

- On Bandcamp album pages only, show an explicit floating capture control.
- On click, scrape title, artist display string, artwork URL, and release date.
- Upsert catalog by normalized Bandcamp URL (not title+artist).
- Persist provenance as `source: "bandcamp"` plus `bandcampUrl`.
- Add the album to the library for `SPOTIFY_SYNC_USER_ID` via secret-gated Next ingest (same trust model as RYM).

## Non-Goals

- Auto-capture on page load.
- Track pages (`*/track/*`), merch-only pages, or discover pages.
- Tracklist, tags, about text, prices, or packages in v1.
- Reusing `addManualAlbumToLibrary` or title+artist dedupe for Bandcamp.
- Inventing Spotify IDs or linking Bandcamp → Spotify in v1.
- Genius / enrichment / smart-playlist pipelines for Bandcamp rows.
- Separate Chrome extension package.

## Decisions

| Topic | Choice |
|-------|--------|
| Packaging | Extend `extensions/rym-release-scraper` |
| Trigger | Explicit floating button (not auto) |
| URL scope | `https://*.bandcamp.com/album/*` only |
| Catalog source | `source: "bandcamp"` (extend union) |
| Identity | Normalized `bandcampUrl` + index `by_bandcampUrl` |
| Fields | title, artist string, image URL, release date, URL |
| Release date | `YYYY-MM-DD` when parseable; else `YYYY`; omit if unparseable |
| Library user | `env.SPOTIFY_SYNC_USER_ID` in Next route |
| Auth | Reuse `RYM_EXTENSION_INGEST_SECRET` Bearer pattern |
| Manual path | Unchanged; Bandcamp has its own mutation |

## Information architecture

**Extension**

1. User opens a Bandcamp album page.
2. Content script injects a fixed floating control: label **Add to library** (or **Update in library** after a successful capture this session).
3. Click → scrape DOM → message service worker → local storage optional + POST backend.
4. Toast / button state: pending → success / error.

**App**

- Bandcamp albums appear in `/albums/all` via library projection.
- Treat `source === "bandcamp"` like manual for Spotify-only chrome (no Open in Spotify).
- Optional small source badge (“Bandcamp”) on details / ranking surfaces that already special-case manual — keep minimal; do not redesign album index.

## Data model

### `spotifyAlbums`

```ts
source: v.union(
  v.literal("spotify"),
  v.literal("manual"),
  v.literal("bandcamp"),
),
spotifyAlbumId: v.optional(v.string()), // omit for bandcamp
bandcampUrl: v.optional(v.string()),    // canonical; only when source === "bandcamp"
name: v.string(),
artistName: v.string(),
albumTitleKey: v.optional(v.string()),
imageUrl: v.optional(v.string()),
releaseDate: v.optional(v.string()), // "YYYY-MM-DD" | "YYYY"
totalTracks: v.number(), // 0 when unknown
// …existing fields unchanged
```

**Indexes:** add `.index("by_bandcampUrl", ["bandcampUrl"])`. Keep existing indexes.

**`albumLibraryItems`:** no new Bandcamp fields. Projection copies optional `spotifyAlbumId` (undefined for Bandcamp).

Update every exhaustive TypeScript / Convex / source-test union that still lists only `"spotify" | "manual"`.

## URL normalization

Identity is **only** the normalized Bandcamp album URL.

Rules:

1. Parse as URL; require `http:` or `https:` (store as `https:`).
2. Host lowercase; strip leading `www.`.
3. Path must include `/album/` (reject otherwise).
4. Drop query string and hash.
5. Trim trailing slash (except bare origin).
6. Collapse whitespace in scraped title/artist before store.

Store only the canonical form in `bandcampUrl`.

## DOM scrape (v1)

| Field | Source |
|-------|--------|
| Title | `#name-section h2.trackTitle` text (decode entities) |
| Artist | `#name-section h3 a` text (single display string) |
| Artwork | `#tralbumArt a.popupImage` `href` (prefer `_10` size URL) |
| Release date | `.tralbum-credits` text; strip leading `released `; parse |
| URL | `window.location.href` after normalization |

Release date parsing:

- Prefer full date → `YYYY-MM-DD` (e.g. `May 6, 2026`).
- Else year-only → `YYYY`.
- If neither → omit `releaseDate`.

Do not use band account name (`#band-name-location .title`) as the album artist when the album credit link exists.

## Backend

### Next: `POST /api/bandcamp/capture`

- Auth: `Authorization: Bearer <RYM_EXTENSION_INGEST_SECRET>` (same secret as RYM ingest).
- Body: `{ bandcampUrl, name, artistName, imageUrl?, releaseDate?, capturedAt? }`.
- Resolve `userId` from `env.SPOTIFY_SYNC_USER_ID`.
- Call Convex `captureBandcampAlbumToLibrary`.
- Return `{ ok, albumId, alreadyExists, alreadyInLibrary }`.

### Convex: `captureBandcampAlbumToLibrary`

**Args:** `userId`, `bandcampUrl`, `name`, `artistName`, `imageUrl?`, `releaseDate?`  
**Returns:** `{ albumId, name, artistName, alreadyExists, alreadyInLibrary }`

**Handler:**

1. `requireAuth` (same as other personal mutations).
2. Normalize + validate URL and non-empty name/artist.
3. Lookup `by_bandcampUrl`.
4. Insert or patch catalog: `source: "bandcamp"`, no `spotifyAlbumId`, set `albumTitleKey`, `totalTracks: 0`, refresh metadata on patch.
5. `upsertAlbumLibraryProjection({ userId, albumId })`.
6. Return flags.

Helpers live in `convex/_utils/bandcampAlbum.ts` (`normalizeBandcampAlbumUrl`, `upsertBandcampAlbumRecord`, date parse helper if pure).

**Do not** call `findAlbumByNormalizedTitleArtist` for Bandcamp.

## Extension changes

- `manifest.json`: add Bandcamp album match patterns + host permission for `https://*.bandcamp.com/*`; bump version; broaden name/description to cover RYM + Bandcamp.
- New `bandcamp-content.js` (or similar): FAB + scrape + message type `BANDCAMP_ALBUM_CAPTURE`.
- `service-worker.js`: handle Bandcamp message; POST `/api/bandcamp/capture` using existing origin/secret settings.
- Options copy: mention Bandcamp capture uses the same backend secret.

### Floating button (frontend-design)

Obvious, high-contrast fixed control (bottom-right), not a toast-only affordance.

- Label: **Add to library**
- Pending: disabled + short status text
- Success: brief confirmation (and optional label flip to **Update in library**)
- Error: visible failure state with retry still available
- Must not look like Bandcamp’s native buy/wishlist chrome (distinct color/shape; avoid Bandcamp blue clone)
- Vanilla CSS in the content script (not React/shadcn — extension has no React)

### App UI (shadcn)

Where the product already branches on `source === "manual"` for non-Spotify behavior (e.g. Rob’s Rankings edit dialog / badges), treat `"bandcamp"` the same for Spotify-only actions. Prefer existing `Badge` for a small “Bandcamp” label when a source label is already shown for manuals. No new album-index redesign.

## Errors

| Case | Behavior |
|------|----------|
| Missing title/artist/URL | Extension shows error; no POST |
| Non-album URL | Content script not injected / normalize rejects |
| Unauthorized / missing secret | Extension toast; local optional save may still succeed |
| Convex validation failure | 400 + message in toast |
| Re-capture same URL | Upsert metadata; library projection ensured; `alreadyExists: true` |

## Testing

- Pure URL normalize + release-date parse unit tests.
- Source/schema tests updated for `"bandcamp"` union + `bandcampUrl` index.
- Mutation source test: export exists; writes `source: "bandcamp"`; does not set `spotifyAlbumId`.
- Do not require live Bandcamp HTML in CI; optional fixture string for date parse.

## Out of scope follow-ups

- Track page capture
- Title+artist merge with existing Spotify/manual rows
- Separate Bandcamp ingest secret
- Tracklist / tags enrichment

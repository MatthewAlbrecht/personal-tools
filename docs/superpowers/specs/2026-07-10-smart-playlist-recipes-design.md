# Smart Playlist Recipes Design

## Overview

Add a dedicated `/smart-playlists` surface for **playlist recipes**: named filter rules that create a Spotify playlist and keep it updated on a cron (plus manual “Sync now”).

Each recipe picks a **source** first (For Later or Rankings), then stacks filters (genre, rating tier, year, duration, added timeframe, etc.). Matching albums are expanded to tracks and written to Spotify. Convex is the source of truth for membership; Spotify is a projection.

## Goals

- Create auto-updating Spotify playlists from album rules (examples: folk For Later albums, Holy Moly from 2026, under-30m Really Enjoyed+, RnB For Later from last 3 years, Holy Moly highs, added to For Later in May 2026 / last month).
- Dedicated management UI at `/smart-playlists` (recipe cards).
- Filter builder UX first; natural language parsing later.
- Per-recipe sync mode: **Mirror** (exact match) or **Add only** (never remove).
- Rankings-based recipes stay current when albums move in/out of tiers.
- Entire albums in v1, with an explicit extension point for smarter per-album track selection later.

## Non-Goals (v1)

- In-app-only live views without a Spotify playlist.
- Natural language rule creation.
- Smart/subset track selection within an album (extension point only).
- Creating recipes from For Later / Rankings “save current filters” shortcuts (can come later; home is still `/smart-playlists`).
- Reading Spotify playlist contents to reconcile manual edits (Convex snapshot wins; mirror overwrites drift).
- Delete + recreate of the Spotify playlist object on each sync (keep stable playlist id).

## UX

### Approach: Recipe cards

`/smart-playlists` lists named recipes. Create/edit is a single form (not a multi-step wizard). Each card is a living playlist you own, not a config panel.

### List page

- Empty state: short pitch + “New recipe.”
- Otherwise cards showing:
  - Name (also used as Spotify playlist title on create)
  - Plain-language rule summary (e.g. `For Later · Folk (primary) · under 30m`)
  - Sync mode badge: **Mirror** | **Add only**
  - Match counts (albums / tracks), last sync time / status
  - Actions: Open in Spotify, Sync now, Edit, Pause, Delete
- Paused recipes stay listed but skip cron.
- Delete confirms whether to keep or unfollow/delete the Spotify playlist.

### Create / edit

Single page or drawer for both:

1. **Name** — free text; Spotify playlist title on create
2. **Source** — `For Later` | `Rankings` (required; **locked after create**)
3. **Filters** — reuse For Later filter vocabulary where applicable:
   - Genres (primary/secondary, ALL/ANY), descriptors
   - Rating tier / sub-tier (e.g. Holy Moly, Holy Moly High, Really Enjoyed+)
   - Release year or range
   - Duration / duration buckets
   - Added timeframe (calendar month or relative last N days/months) — For Later only
4. **Sync mode** — Mirror | Add only
5. **Track selection** — v1 fixed to `allTracks` (see Data model); UI can omit or show as read-only
6. **Live preview** — `N albums · ~M tracks` as filters change; optional short album list for sanity check
7. **Save** — create: create Spotify playlist + store recipe. edit: update rule; next sync (or Sync now) applies

Natural language input is out of v1; leave a clear extension point on the create form later.

## Sync behavior

### Source of truth

Convex stores the recipe and a **snapshot** of what was last successfully written (`syncedAlbumIds`, `syncedTrackUris`, `contentHash`). Spotify is overwritten or appended to match; we do **not** GET playlist items for normal sync.

### Pipeline

For each active (non-paused) recipe:

1. Resolve matching albums from source + filters (reuse existing query/filter logic).
2. Expand albums → ordered track URIs via `expandAlbumsToTrackUris(albums, trackSelection)`.
3. Compare desired set/order to Convex snapshot (hash or URI list).
4. If unchanged → skip Spotify; refresh counts/timestamps as needed.
5. If changed:
   - **Mirror:** replace playlist in place (see Spotify API), then commit snapshot.
   - **Add only:** `toAdd = desired − synced` (Convex math); POST new tracks; append snapshot.
6. On Spotify failure mid-batch: do **not** commit a successful snapshot; mark `syncStatus: error` / `lastError` for the card.

### Ordering

Stable album order (e.g. For Later by `playlistAddedAt`; Rankings by tier/position), tracks in album order, so playlists don’t reshuffle chaotically when membership is unchanged.

### Cron and manual sync

- Cron walks active recipes on a fixed schedule (cadence tunable; daily is fine for v1).
- “Sync now” runs the same internal sync function for one recipe.
- Auth/playlist-missing errors surface on the card; don’t fail silently forever.

## Spotify API usage

Use current `/items` playlist routes (post–Feb 2026 rename from `/tracks`).

| Step | Method | Route | Docs |
| --- | --- | --- | --- |
| Create empty playlist | `POST` | `/me/playlists` | [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist) |
| Album → tracks (if not cached) | `GET` | `/albums/{id}/tracks` | [Get Album Tracks](https://developer.spotify.com/documentation/web-api/reference/get-an-albums-tracks) |
| Mirror wipe + first ≤100 | `PUT` | `/playlists/{id}/items` | [Update Playlist Items](https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-items) |
| Mirror remainder / add-only | `POST` | `/playlists/{id}/items` | [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist) |
| Rename (optional) | `PUT` | `/playlists/{id}` | [Change Playlist Details](https://developer.spotify.com/documentation/web-api/reference/change-playlist-details) |
| Remove playlist (optional on delete) | `DELETE` | `/playlists/{id}/followers` | [Unfollow Playlist](https://developer.spotify.com/documentation/web-api/reference/unfollow-playlist) |

**Mirror rebuild for N tracks:** `PUT` first 100 **replaces the entire playlist** with those 100 (length becomes 100). Then `POST` remaining chunks of ≤100 until complete. Same playlist id throughout.

**Not used in normal sync:** `GET /playlists/{id}/items` (optional later for drift/reconcile only).

Prefer track URIs already cached from album / for-later sync; fall back to album tracks API and cache.

## Data model

Table name: `smartPlaylists`.

| Field | Purpose |
| --- | --- |
| `name` | Display + Spotify title on create |
| `spotifyPlaylistId` | Stable Spotify playlist id |
| `source` | `forLater` \| `rankings` (immutable after create) |
| `filters` | Structured filter object (genres, tiers, years, duration, added window, match mode, etc.) |
| `syncMode` | `mirror` \| `addOnly` |
| `trackSelection` | `{ mode: "allTracks" }` in v1; future modes e.g. smart subset |
| `isPaused` | Skip cron when true |
| `syncedAlbumIds` | Last successful album membership |
| `syncedTrackUris` | Last successful ordered track URIs |
| `contentHash` | Fast skip when desired set unchanged |
| `matchAlbumCount` / `matchTrackCount` | Card display |
| `lastSyncedAt` | Last **successful** sync (unchanged on failure) |
| `syncStatus` / `lastError` | `ok` \| `error` \| etc. for UI |

### Track selection extension

Album matching and track expansion are separate steps. All sync paths call:

`expandAlbumsToTrackUris(albums, trackSelection)`

v1 only implements `allTracks`. Future strategies plug in here without changing filters or Spotify push logic. Snapshot remains track-level so mirror/add-only stay valid.

### Filter evaluation

Reuse existing For Later facet/filter and rankings/library query patterns rather than a second filter engine. Source-specific filters: e.g. “added to For Later” only when `source === forLater`.

## Architecture (sketch)

```
UI /smart-playlists
  → Convex queries/mutations (CRUD recipes, preview counts)
  → Sync now → internal action/mutation pipeline

Cron
  → internal: list active recipes
  → per recipe: resolve albums → expand tracks → fingerprint
  → if dirty: Spotify PUT/POST → commit snapshot
```

Spotify calls live in Convex actions (`"use node"` as needed); DB writes via internal mutations. Schedule only `internal.*` functions.

## Error handling

- Spotify auth failure / 401: mark recipe errored; surface on card.
- Playlist deleted externally: detect on write failure; mark errored; allow “recreate playlist” later if needed.
- Partial write failure: leave snapshot at last good state; retry full mirror replace on next run.
- Empty match set: Mirror → `PUT` with empty `uris` (clear playlist) and commit empty snapshot. Add only → no-op adds.

## Testing / verification (manual for v1)

- Create For Later recipe → playlist appears in Spotify with expected albums’ tracks.
- Create Rankings / Holy Moly recipe → same.
- Change rating so album leaves tier → next mirror sync removes its tracks; add-only leaves them.
- Unchanged recipe on cron → no Spotify writes (hash skip).
- Pause → cron skips; **Sync now still works while paused**.
- >100 tracks → PUT + POST chunking ends at full desired length.

## Future extensions

- Natural language → structured filters.
- `trackSelection` modes beyond `allTracks`.
- Prefill create form from For Later / Rankings current filters.
- Optional Spotify GET reconcile for detecting manual drift.
- Richer rule summary / shareable recipe definitions.

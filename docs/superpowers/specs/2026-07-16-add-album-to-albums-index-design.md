# Add Album to Albums Index — Design Spec

## Overview

`/albums/all` lists the per-user album library (`albumLibraryItems`) but has no way to add an album by Spotify link. Users should paste a Spotify album URL (or URI / raw ID), fetch the album from Spotify immediately, and upsert it into the library — without adding it to For Later.

## Goals

- Add an album to the library from `/albums/all` by pasting a Spotify album link, URI, or ID.
- Parse the album ID from the paste, call Spotify right away, and upsert into `spotifyAlbums` + `albumLibraryItems` for the current user.
- Match existing albums UI patterns with a dialog (not a drawer).
- Reuse existing parse helper, album fetch API, and library projection utilities.

## Non-Goals

- Adding the album to For Later.
- Searching Spotify by name/artist.
- Changing the ≤2-track → `single` library classification heuristic or using Spotify `album_type`.
- Changing default `/albums/all` filters (Type defaults to Albums).
- Schema migrations or collapsing For Later membership into the library table (singular album identity already uses shared `spotifyAlbums`; that idea is marked done).
- Redesigning the albums index layout beyond an add entry point.

## Current Behavior

- Canonical album metadata lives in `spotifyAlbums`.
- Per-user library index rows live in `albumLibraryItems`, assembled via `upsertAlbumLibraryProjection`.
- `api.spotify.upsertAlbum` writes only `spotifyAlbums` — it does **not** create a library projection.
- Flows that do both upsert + projection already exist (e.g. discography bulk upsert, for-later upsert, add manual listen).
- Album fetch: `GET /api/spotify/album/[albumId]` with `X-Access-Token`, returns fields shaped for `upsertAlbum`.
- ID parsing: `parseSpotifyAlbumId` in `src/lib/parse-spotify-album-id.ts` (URL / URI / plain ID).
- `/albums/all` uses paginated `listAlbumLibraryRowsPaginated` with URL-backed filters; default type filter is `album`.

## Proposed Design

### UI

On `/albums/all` (`AllAlbumsView`):

1. An **Add album** button in the page header area (near the existing top controls, not inside the filter row).
2. Opens a **Dialog** titled “Add album”.
3. Single text field: placeholder for a Spotify album URL; accept URL, `spotify:album:…`, or raw ID.
4. On paste (and on submit): normalize input with `parseSpotifyAlbumId`.
5. Primary **Add** button and cancel/dismiss.
6. While the request is in flight: disable controls and show pending state on Add.

### Client flow

1. Require signed-in user and a valid Spotify access token (`getValidAccessToken`).
2. Parse album ID; if empty/unusable, toast error and keep dialog open.
3. `GET /api/spotify/album/{id}` with `X-Access-Token` (same pattern as add-listen in `albums-context`).
4. Call a new Convex mutation that upserts the Spotify album **and** the library projection for `userId`.
5. On success: toast (album name/artist; distinguish “Added …” vs “Already in library” when the mutation reports it), close dialog.
6. List updates reactively via the existing paginated query. If the new row is hidden by current filters (e.g. Type = Albums and the release is classified as a single), that is expected — no automatic filter change required.

### Backend

Add a dedicated mutation (e.g. `addAlbumToLibrary`) on the Spotify/albums Convex module:

**Args:** `userId` plus the album payload fields already used by `upsertAlbum` (spotifyAlbumId, name, artistName, imageUrl?, releaseDate?, totalTracks, genres?).

**Handler:**

1. Auth as required by existing Spotify mutations.
2. `upsertSpotifyAlbumRecord` → `albumId`.
3. `upsertAlbumLibraryProjection({ userId, albumId })`.
4. Return `{ albumId, name, artistName, alreadyInLibrary: boolean }` (or equivalent) so the client can toast accurately. `alreadyInLibrary` means a library projection row already existed for `(userId, albumId)` before this call.

No schema changes.

### Errors

| Case | Behavior |
|------|----------|
| Empty / unparseable input | Toast; dialog stays open |
| No auth / no Spotify token | Toast; dialog stays open |
| Spotify fetch failure (404, network, etc.) | Toast; dialog stays open |
| Convex mutation failure | Toast; dialog stays open |

### Components

- `AddAlbumToLibraryDialog` in `src/app/albums/_components/` — dialog UI + paste/submit handling.
- Wire open state and header button from `AllAlbumsView`.
- Reuse `Dialog` UI primitives, `parseSpotifyAlbumId`, album fetch route, auth token helper, sonner toasts.

## Success Criteria

- From `/albums/all`, user can paste a Spotify album link and the album appears in the library index (subject to current filters).
- Raw ID and `spotify:album:` URI also work.
- Re-adding an existing library album succeeds idempotently with a clear toast.
- For Later is unchanged.
- No new tables or indexes.

## Testing

- Existing unit coverage for `parseSpotifyAlbumId` remains the source of truth for parse cases; extend only if new formats are added.
- Cover the mutation path (upsert + projection, already-in-library detection) in the style of existing Convex/source tests in this repo.
- Manual: URL / URI / ID; confirm row on `/albums/all`; re-add; bad link; no token.

## Related

- Idea: `docs/ideas/2026-07-15-add-album-to-albums-index.md`
- Singular album model idea marked done: shared `spotifyAlbums` + projection into `albumLibraryItems` already in place

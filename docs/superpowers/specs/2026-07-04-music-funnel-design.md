# Music Funnel Product/Technical Spec

## Overview

Build a new `/music-funnel` feature that watches curated Spotify source playlists, records an append-only history of what each source recommends, adds newly discovered tracks to a main Spotify funnel playlist, and adds second-source track repeats to a separate Spotify repeats playlist.

The feature is designed for a small set of curated playlists, currently about 6-7, that may update on different weekly cadences and may either replace their full contents or rotate batches over time. The sync should scan each active source playlist fully on each run rather than relying on Spotify playlist ordering or `added_at` watermarks.

The first version includes source management, destination playlist settings, manual sync, daily cron support, run history, and cross-source repeat analytics for tracks, albums, and all credited artists.

## Goals

- Let the user configure active curated source playlists by Spotify playlist ID.
- Let the user configure an existing main funnel playlist ID and an existing repeats playlist ID.
- Scan every active source playlist during manual or scheduled sync.
- Record durable source encounters so a `(source playlist, Spotify track)` pair is only considered new once.
- Add first-time globally discovered tracks to the main funnel playlist.
- Add a track to the repeats playlist when it is recommended by a second distinct source playlist.
- Track repeat analytics across distinct source playlists for tracks, albums, and all credited artists.
- Show recent sync runs grouped by source playlist, including batch counts and errors.
- Support a daily cron endpoint using the same `CRON_SECRET` and `SPOTIFY_SYNC_USER_ID` pattern as existing Spotify cron routes.

## Non-Goals

- No automatic creation of the main funnel or repeats Spotify playlists in the first version.
- No Instagram scraping or direct Instagram integration.
- No per-source schedule automation beyond scanning all active sources on each run.
- No notifications or email alerts in the first version.
- No recommendation or ranking engine beyond cross-source repeat analytics.
- No automatic removal from destination Spotify playlists when a source playlist removes a track.
- No optimization based on Spotify playlist snapshots or incremental watermarks in the first version.
- No multi-user admin surface beyond the existing `userId`-scoped patterns used elsewhere in this app.

## Existing Patterns To Match

Use the existing app patterns instead of creating a separate architecture:

- Spotify helpers in `src/lib/spotify.ts`, especially `getAllPlaylistTrackItems()` and `addTracksToPlaylist()`.
- Cron authentication and token refresh from `src/pages/api/cron/sync-spotify.ts`.
- Ingestion run persistence style from `convex/forLaterAlbums.ts`.
- Feature page composition from `src/app/for-later-albums/`.
- Client Spotify auth from `src/lib/hooks/use-spotify-auth.ts`.
- Toast-based manual sync feedback from `src/app/for-later-albums/_components/for-later-header.tsx`.

## Product Behavior

### Source Playlists

The `/music-funnel` page should include a source manager where the user can add and edit curated playlist sources.

Each source stores:

- Spotify playlist ID.
- Display name.
- Curator or organization label.
- Optional notes.
- Optional schedule hint such as `Monday`, `Wednesday`, `Friday`, or freeform text.
- Active/inactive state.
- Latest known Spotify playlist name, image URL, owner, track count, and snapshot ID when available.

The sync only processes active sources. Deactivating a source should not delete historical encounters; repeat analytics should continue to reflect historical data unless a future implementation explicitly adds source exclusion controls.

### Destination Playlists

The settings area should store existing Spotify playlist IDs for:

- Main funnel playlist.
- Repeats playlist.

The sync should require the main funnel playlist ID before writing main playlist additions. It should require the repeats playlist ID before writing repeat additions. If one destination is missing, the sync should still record encounters and mark the relevant write step as skipped in the run result rather than losing ingestion data.

### Encounter Semantics

An encounter is the first time a source playlist recommends a Spotify track for the configured user.

If a source playlist removes a track and later reintroduces it, that source-track pair should not be treated as new again. This keeps the system focused on cross-source discovery rather than repeated promotion by the same curator.

### Main Funnel Writes

When a track is encountered for the first time across all sources for the user, it should be added to the main funnel playlist once.

If another source later recommends the same track, the track should not be added again to the main funnel playlist. Spotify writes should also be protected by a local write ledger so retries do not duplicate writes.

### Repeats Playlist Writes

When a track reaches two distinct source playlists for the first time, it should be added to the repeats playlist once.

Additional sources beyond the second should update analytics but should not add the track to the repeats playlist again.

### Repeat Analytics

Repeat analytics are based on distinct source playlists, not number of encounters or number of tracks from the same source.

Track repeats:

- Group by `spotifyTrackId`.
- Count distinct source playlists that have encountered the track.
- Show track name, primary artist display, album, image, first seen time, latest seen time, and source labels.

Album repeats:

- Group by `spotifyAlbumId`.
- Count distinct source playlists that have encountered any track from that album.
- Multiple tracks from the same source on the same album still count as one source for that album.
- Show album name, artist display, image, first seen time, latest seen time, source labels, and contributing track count.

Artist repeats:

- Group by Spotify artist ID.
- Count every credited artist on each encountered track, not just the primary artist.
- Multiple tracks by the same artist from the same source still count as one source for that artist.
- Show artist name, source labels, first seen time, latest seen time, and contributing track count.

## Data Model

Add the following tables to `convex/schema.ts`.

### `musicFunnelSettings`

One settings row per user.

Fields:

- `userId`
- `mainPlaylistId` optional until configured
- `repeatsPlaylistId` optional until configured
- `createdAt`
- `updatedAt`

Indexes:

- `by_userId`

### `musicFunnelSources`

Configured curated source playlists.

Fields:

- `userId`
- `spotifyPlaylistId`
- `displayName`
- `curatorName`
- `notes`
- `scheduleHint`
- `isActive`
- `spotifyPlaylistName`
- `spotifyOwnerId`
- `spotifyOwnerName`
- `imageUrl`
- `lastSnapshotId`
- `lastTrackCount`
- `lastScannedAt`
- `createdAt`
- `updatedAt`

Indexes:

- `by_userId`
- `by_userId_active`
- `by_userId_spotifyPlaylistId`

### `musicFunnelRuns`

One row per manual or cron sync attempt.

Fields:

- `userId`
- `source`: `manual` or `cron`
- `status`: `success`, `partial`, or `failed`
- `startedAt`
- `completedAt`
- `durationMs`
- `sourcesScanned`
- `tracksSeen`
- `newEncounters`
- `newTracksAddedToMain`
- `repeatTracksAdded`
- `trackRepeatsFound`
- `albumRepeatsFound`
- `artistRepeatsFound`
- `errors`

Indexes:

- `by_userId_startedAt`
- `by_userId_status_startedAt`

### `musicFunnelSourceRuns`

One row per source playlist processed inside a run.

Fields:

- `userId`
- `runId`
- `sourceId`
- `spotifyPlaylistId`
- `sourceDisplayName`
- `status`: `success` or `failed`
- `startedAt`
- `completedAt`
- `durationMs`
- `spotifySnapshotId`
- `tracksFetched`
- `newEncounters`
- `alreadySeenFromSource`
- `newTracksAddedToMain`
- `repeatTracksAdded`
- `trackRepeatsFound`
- `albumRepeatsFound`
- `artistRepeatsFound`
- `error`

Indexes:

- `by_userId_startedAt`
- `by_runId`
- `by_sourceId_startedAt`

### `musicFunnelTrackEncounters`

Append-only source-track encounter ledger. There should be at most one row per `(userId, sourceId, spotifyTrackId)`.

Fields:

- `userId`
- `sourceId`
- `spotifyPlaylistId`
- `runId`
- `sourceRunId`
- `spotifyTrackId`
- `trackName`
- `trackUri`
- `primaryArtistName`
- `artists`: array of `{ spotifyArtistId, name }`
- `spotifyAlbumId`
- `albumName`
- `albumImageUrl`
- `playlistAddedAt`
- `firstSeenAt`
- `createdAt`

Indexes:

- `by_userId_createdAt`
- `by_userId_spotifyTrackId`
- `by_userId_spotifyAlbumId`
- `by_userId_sourceId_spotifyTrackId`
- `by_sourceId_createdAt`

Artist analytics can be derived from the `artists` array in these rows for the first implementation. If query cost becomes a problem later, add a materialized `musicFunnelArtistEncounters` projection.

### `musicFunnelPlaylistWrites`

Idempotency ledger for Spotify playlist writes.

Fields:

- `userId`
- `kind`: `main` or `repeat`
- `spotifyPlaylistId`
- `spotifyTrackId`
- `trackUri`
- `reason`: `first_seen` or `second_source_repeat`
- `runId`
- `sourceRunId`
- `writtenAt`
- `spotifySnapshotId`

Indexes:

- `by_userId_kind_spotifyTrackId`
- `by_userId_writtenAt`
- `by_runId`

## Convex API

Create `convex/musicFunnel.ts` with explicit argument and return validators.

Settings and sources:

- `getSettings`
- `upsertSettings`
- `listSources`
- `upsertSource`
- `setSourceActive`

Sync support:

- `startRun`
- `finishRun`
- `startSourceRun`
- `finishSourceRun`
- `recordTrackEncounters`
- `recordPlaylistWrites`
- `updateSourceSnapshot`

UI queries:

- `getUiSummary`
- `listRecentRuns`
- `listRunSourceRuns`
- `listTrackRepeats`
- `listAlbumRepeats`
- `listArtistRepeats`

The sync support mutations should be thin wrappers around plain helper functions where logic would otherwise become large.

## Sync Orchestrator

Create `src/lib/music-funnel-sync.ts`.

The orchestrator accepts:

- `accessToken`
- `userId`
- `source`: `manual` or `cron`
- optional `dryRun` for development/manual verification if implementation remains simple

The flow:

1. Load settings and active sources from Convex.
2. Create a `musicFunnelRuns` row.
3. For each active source:
   - Create a `musicFunnelSourceRuns` row.
   - Fetch playlist metadata and all playlist track items from Spotify.
   - Skip null/local tracks.
   - Normalize track, album, and artist metadata from the Spotify track payload.
   - Insert only source-track encounters that do not already exist.
   - Determine which newly inserted encounters are first global track sightings.
   - Determine which newly inserted encounters caused a track to reach its second distinct source.
   - Determine run-level track, album, and artist repeat counts.
   - Update source snapshot metadata.
   - Finish the source run with stats or error.
4. Add queued first-global tracks to the main funnel playlist in batches of 100, skipping tracks already present in `musicFunnelPlaylistWrites` for `kind: "main"`.
5. Add queued second-source repeat tracks to the repeats playlist in batches of 100, skipping tracks already present in `musicFunnelPlaylistWrites` for `kind: "repeat"`.
6. Record playlist writes after Spotify confirms each batch.
7. Finish the main run as:
   - `success` if all sources and required writes completed.
   - `partial` if at least one source succeeded but some source or write failed.
   - `failed` if no source could be processed or a setup requirement blocks the run.

Spotify API writes should use the existing `addTracksToPlaylist()` helper. Batches must not exceed Spotify's 100 URI limit.

## API Routes

Create `src/app/api/music-funnel/sync/route.ts` for manual sync.

Behavior:

- Require `X-Access-Token`.
- Accept `userId`.
- Call `syncMusicFunnel({ source: "manual" })`.
- Return the sync result as JSON.

Create `src/pages/api/cron/sync-music-funnel.ts` for scheduled sync.

Behavior:

- Allow `GET` and `POST`.
- Require `Authorization: Bearer ${env.CRON_SECRET}`.
- Use `?user=` override or `env.SPOTIFY_SYNC_USER_ID`.
- Load the user's Spotify connection from Convex.
- Refresh Spotify token when expired or near expiry.
- Call `syncMusicFunnel({ source: "cron" })`.
- Return `200` on success or partial success and `500` on failed setup or fatal sync failure.

Add the cron route to `vercel.json` only if the implementation step is explicitly scoped to enable production scheduling immediately. Otherwise, leave the route ready for the user to add to the scheduler.

## UI

Create `src/app/music-funnel/page.tsx` and colocated components under `src/app/music-funnel/_components/`.

Page behavior:

- Use `useSpotifyAuth()` to get `userId`, Spotify connection state, and valid access token.
- Show `LoginPrompt` when not authenticated or not connected to Spotify, matching existing Spotify pages.
- Query summary, settings, sources, recent runs, and repeat analytics from `api.musicFunnel`.

Components:

- `MusicFunnelHeader`: title, last sync summary, manual sync action.
- `MusicFunnelSettingsCard`: edit main funnel and repeats playlist IDs.
- `MusicFunnelSourcesCard`: add/edit/deactivate source playlists.
- `MusicFunnelRecentRuns`: show runs and source-run batches.
- `MusicFunnelTrackRepeats`: repeated tracks by distinct source count.
- `MusicFunnelAlbumRepeats`: repeated albums by distinct source count.
- `MusicFunnelArtistRepeats`: repeated artists by distinct source count.

The first UI should be information-dense but plain: cards, lists, and simple tables are enough. Avoid custom charts or heavy visualization until the stored data proves what views are useful.

## Error Handling

Source playlist failures should be isolated. If one source playlist fails, the run should continue with the remaining sources and finish as `partial`.

Expected recoverable errors:

- Source playlist not found or not accessible.
- Spotify rate limit or transient API error.
- Missing destination playlist ID.
- Spotify write failure for one destination playlist.

The UI should show the run as failed or partial with the stored error messages. Manual sync should toast a concise success, partial, or failure message.

## Testing And Verification

This repo has no configured test framework, so implementation verification should use:

- `pnpm typecheck`
- `pnpm check`
- Manual route test for `POST /api/music-funnel/sync`
- Manual route test for `GET /api/cron/sync-music-funnel` with `CRON_SECRET`
- A small real sync using one or two source playlists before enabling all sources

The implementation plan should include pure helper functions where practical so repeat grouping and write-queue decisions can be checked independently from Spotify network calls.

## Rollout

Recommended rollout:

1. Configure main and repeats destination playlist IDs.
2. Add one or two curated source playlists.
3. Run a manual sync and inspect run history and playlist writes.
4. Add the remaining sources.
5. Run another manual sync.
6. Enable the daily cron once the output looks correct.

## Open Decisions Resolved

- First implementation uses an event ledger rather than a lightweight current-state-only model.
- Source playlists are full-scanned every run.
- Existing Spotify playlist IDs are entered in app settings.
- Reintroduced tracks from the same source are not considered new again.
- Duplicate tracks are not re-added to the main funnel playlist.
- A track is added to the repeats playlist when a second distinct source recommends it.
- Track, album, and artist repeat analytics are visible in the first UI.
- Artist analytics count every credited Spotify artist on each track.

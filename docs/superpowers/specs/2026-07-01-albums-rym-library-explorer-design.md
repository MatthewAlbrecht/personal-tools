# Albums RYM Library Explorer Design

## Overview

Make `/albums/all` the canonical Spotify album library explorer. The page should help answer:

- Which albums are connected to RYM?
- Which albums still need a RYM link?
- Which albums appear in Rob's Top 50?
- What RYM genres, subgenres, descriptors, release years, listen status, and album types apply?

This is not a global background matching queue. Matching should remain explicit and scoped to meaningful entry points or user actions.

## Goals

- Surface RYM connection status for canonical `spotifyAlbums`.
- Make `/albums/all` useful for triage, not just a flat client-filtered list.
- Add filters for RYM status, Rob ranking presence, listen status, release year, album type, and RYM taxonomy.
- Reuse existing RYM link data from `rateYourMusicSpotifyAlbumLinks`.
- Preserve existing manual edits and never overwrite manual links.
- Keep the first phase read-only except for existing "add listen" behavior.

## Non-Goals

- No auto-match inside `spotify.upsertAlbum`.
- No global queue that tries to match every `spotifyAlbum`.
- No destructive backfill.
- No duplicate For Later-specific fields on `spotifyAlbums` (`rymNotOnSite`, discovery status, etc.).
- No new source of truth besides `rateYourMusicSpotifyAlbumLinks`.

## Current State

### `/albums/all`

`src/app/albums/all/page.tsx` loads:

- `api.spotify.getAllAlbums`
- `api.spotify.getUserAlbums`

`AllAlbumsView` then filters client-side by:

- search
- release year
- listened/unlistened
- hide singles

This works for small lists, but it cannot reliably scale into richer RYM facets because it does not include RYM link status, taxonomy, or Rob ranking membership.

### RYM Link Model

`rateYourMusicSpotifyAlbumLinks` is the canonical link table:

- `scrapeId`
- `albumId`
- `spotifyAlbumId`
- `method`: `spotify_id`, `title_artist`, or `manual`
- timestamps

For Later has its own workflow fields on `forLaterAlbumItems`, but those should not become global album fields. They are backlog workflow state, not canonical album metadata.

## Recommended Architecture

Add a new read model for `/albums/all`, backed by a Convex query that hydrates canonical album rows with derived metadata:

```ts
type AlbumLibraryRow = {
  albumId: Id<"spotifyAlbums">;
  spotifyAlbumId: string;
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
  releaseYear?: number;
  totalTracks: number;
  albumType: "single" | "album";

  listenCount: number;
  firstListenedAt?: number;
  lastListenedAt?: number;
  rating?: number;

  rymStatus: "linked" | "unlinked";
  rymLink?: {
    scrapeId: Id<"rateYourMusicScrapes">;
    method: "spotify_id" | "title_artist" | "manual";
    rymUrl?: string;
    updatedAt: number;
  };

  appearsInRobRankings: boolean;
  robRankingYears: number[];

  primaryGenres: Array<{ key: string; label: string }>;
  secondaryGenres: Array<{ key: string; label: string }>;
  descriptors: Array<{ key: string; label: string }>;
};
```

The query should derive RYM status from `rateYourMusicSpotifyAlbumLinks.by_albumId`, then load the linked scrape and taxonomy if a link exists.

## Product Behavior

### Filters

Add filter controls to `/albums/all`:

- Search: album or artist
- RYM status: all, linked, unlinked
- Rob rankings: all, appears in rankings, not in rankings
- Listen status: all, listened, unlistened
- Album type: all, albums, singles
- Release year
- Genre / subgenre
- Descriptor

Genre and descriptor filtering should follow the For Later mental model, but taxonomy filtering belongs in Phase 2. Phase 1 should display linked RYM taxonomy when available, not use taxonomy as a filter yet.

### Row Display

Each row should show:

- cover art
- artist + album
- release year
- listen count / rating when available
- RYM badge: linked or needs RYM
- Rob ranking badge when present
- primary genre chips, with secondary/descriptors available in compact form

### Manual Actions

Phase 1 is read-only for RYM.

Later phases can add:

- "Attempt match" for one album
- "Associate RYM" drawer reused from For Later
- filtered batch dry-run for unlinked albums

Manual links must never be overwritten by automated matching.

## Data Flow

1. Spotify sync, For Later sync, Rob imports, and manual listens create or update `spotifyAlbums`.
2. Entry points may explicitly call `attemptRymMatchForAlbum`.
3. `rateYourMusicSpotifyAlbumLinks` remains the source of truth.
4. `/albums/all` reads canonical albums and joins:
   - user listen data from `userAlbums`
   - link rows from `rateYourMusicSpotifyAlbumLinks`
   - scrapes + taxonomy from RYM tables
   - ranking membership from `robRankingAlbums` + `robRankingYears`

## Phasing

### Phase 1: Read-Only Album Library Explorer

- Add a Convex query for album library rows.
- Add RYM status and Rob ranking membership to `/albums/all`.
- Add filters for RYM status, Rob rankings, listen status, album type, search, and year.
- Display linked RYM primary genres, secondary genres, and descriptors when a link exists.
- Keep filtering client-side in Phase 1. Move to pagination/facet indexes only when the row count or taxonomy filters require it.

### Phase 2: RYM Taxonomy Facets

- Add genre/subgenre/descriptor filters.
- If needed, introduce facet tables or projections similar to For Later for scalable filtering.
- Avoid denormalizing global RYM status unless read performance requires it.

### Phase 3: Safe Matching Actions

- Add per-album "Attempt match".
- Add "Associate RYM" using the existing For Later association patterns.
- Add an optional batch dry-run over filtered unlinked albums.
- Batch matching must skip any album with an existing link.

## Backfill / Safety

No destructive backfill is required for Phase 1.

If future batch matching exists:

- dry-run first
- cursor-based batches
- skip albums with any existing link
- never delete links
- never replace manual links
- never patch Rob ranking rows

## Testing

- Unit test link resolution helpers:
  - no link => `unlinked`
  - auto link => `linked`
  - manual link => `linked`, method preserved
- Unit test Rob ranking membership aggregation:
  - album in one year
  - album in multiple years
  - manual ranking rows ignored unless they have `albumId`
- Component/filter tests for `/albums/all` filtering:
  - linked vs unlinked
  - appears in Rob rankings vs not
  - album vs single
  - listened vs unlistened
- Run `pnpm typecheck`.

## Design Decisions

- Phase 1 keeps client-side filtering because `/albums/all` already works that way and this avoids introducing pagination before it is needed.
- Phase 1 displays RYM taxonomy but does not filter by it.
- The first RYM action in Phase 3 should be manual association, because it is safer than auto-matching when the user is triaging a specific album.

## Recommendation

Start with Phase 1 and keep it mostly read-only. That gives immediate visibility into linked vs unlinked albums and Rob ranking membership without risking manual edits or building a global matching queue too early.

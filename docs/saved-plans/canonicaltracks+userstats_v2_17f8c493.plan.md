---
name: CanonicalTracks+UserStats v2
overview: Unify Spotify tracks into a canonical table (one row per trackId) plus a per-user stats table (one row per userId+trackId) for encounter timestamps. Removes SaveForLater entirely and uses Convex's built-in pagination.
todos:
  - id: schema
    content: Add spotifyTracks + spotifyUserTracks tables; remove spotifySavedForLater
    status: completed
  - id: convex-upserts
    content: Implement upsertTracksFromRecentlyPlayed and upsertTracksFromLiked (loop writes, manual upsert logic)
    status: completed
  - id: convex-queries
    content: Implement paginated getRecentlyPlayedHistory and getLikedHistory queries with join
    status: completed
  - id: remove-saveforlater
    content: Remove SaveForLater Convex functions + UI usages
    status: completed
  - id: page-wiring
    content: Update page.tsx to upsert after fetch and render from usePaginatedQuery
    status: completed
---

# Canonical Tracks + User Track Stats (v2)

## Goals

- Persist "have I encountered this track before + when was last time?" across sessions.
- Keep separate UI tabs (RecentlyPlayed / Liked) that can show full history, not just Spotify's last 50.
- Remove SaveForLater entirely.

## Key Design Decisions

- **One row per `trackId`** in `spotifyTracks` (canonical metadata, shared).
- **One row per `(userId, trackId)`** in `spotifyUserTracks` (encounter timestamps, per-user).
- "Source membership" derived from timestamps:
  - `lastPlayedAt` present → seen in recently played
  - `lastLikedAt` present → seen in liked songs
- Use Spotify timestamps (`played_at`, `added_at`) as source of truth.
- `lastSeenAt = max(lastPlayedAt, lastLikedAt)` for overall ordering.
- **Multi-user safe**: all `spotifyUserTracks` lookups use `by_userId_trackId`.

## Convex Patterns Confirmed

1. **Bulk writes in a loop are efficient**: Convex queues all writes within a single mutation and executes them atomically. Looping with `await ctx.db.insert(...)` or `ctx.db.patch(...)` is the recommended pattern — no need for `Promise.all` on writes.

2. **Pagination**: Use `paginationOptsValidator` from `convex/server`, call `.paginate(paginationOpts)` on an ordered query, return `PaginationResult`. Client uses `usePaginatedQuery` for infinite scroll.

3. **No unique index enforcement**: Indexes don't enforce uniqueness. Upsert logic must manually query by index to find existing row, then insert or patch.

## Schema Changes

Update [convex/schema.ts](convex/schema.ts):

### Add `spotifyTracks` (canonical)

```typescript
spotifyTracks: defineTable({
  trackId: v.string(),
  trackName: v.string(),
  artistName: v.string(),
  albumName: v.optional(v.string()),
  albumImageUrl: v.optional(v.string()),
  trackData: v.optional(v.string()), // JSON stringified SpotifyTrack
  updatedAt: v.number(),
})
  .index('by_trackId', ['trackId'])
```

### Add `spotifyUserTracks` (per-user stats)

```typescript
spotifyUserTracks: defineTable({
  userId: v.string(),
  trackId: v.string(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  lastPlayedAt: v.optional(v.number()),
  lastLikedAt: v.optional(v.number()),
})
  .index('by_userId_trackId', ['userId', 'trackId'])
  .index('by_userId_lastSeenAt', ['userId', 'lastSeenAt'])
```

### Remove `spotifySavedForLater`

Delete the table definition.

## Convex Functions

Update [convex/spotify.ts](convex/spotify.ts):

### Upsert mutations

- `upsertTracksFromRecentlyPlayed({ userId, items })`
  - Loop over items:
    - Upsert `spotifyTracks` by `by_trackId` (find existing → patch, else insert)
    - Upsert `spotifyUserTracks` by `by_userId_trackId`
      - `playedAtMs = Date.parse(item.played_at)`
      - `lastPlayedAt = max(existing.lastPlayedAt, playedAtMs)`
      - `firstSeenAt = min(existing.firstSeenAt, playedAtMs)` or set on insert
      - `lastSeenAt = max(lastPlayedAt, lastLikedAt)`

- `upsertTracksFromLiked({ userId, items })`
  - Same pattern with `likedAtMs = Date.parse(item.added_at)` → `lastLikedAt`

### Paginated queries

- `getRecentlyPlayedHistory`

```typescript
import { paginationOptsValidator } from 'convex/server';

export const getRecentlyPlayedHistory = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { userId, paginationOpts }) => {
    const userTracks = await ctx.db
      .query('spotifyUserTracks')
      .withIndex('by_userId_lastSeenAt', q => q.eq('userId', userId))
      .order('desc')
      .paginate(paginationOpts);

    // Filter to only those with lastPlayedAt, then join with spotifyTracks
    const filtered = userTracks.page.filter(ut => ut.lastPlayedAt != null);
    const trackDocs = await Promise.all(
      filtered.map(ut =>
        ctx.db.query('spotifyTracks')
          .withIndex('by_trackId', q => q.eq('trackId', ut.trackId))
          .first()
      )
    );

    return {
      ...userTracks,
      page: filtered.map((ut, i) => ({ ...ut, track: trackDocs[i] })),
    };
  },
});
```

- `getLikedHistory` — same pattern filtering on `lastLikedAt != null`.

### Remove SaveForLater functions

Delete: `saveForLater`, `removeSavedForLater`, `getSavedForLater`, `getSavedTrackIds`.

## API / Page Wiring

Update [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx):

- Keep existing Spotify fetch routes (`/api/spotify/recent-tracks`, `/api/spotify/liked-tracks`).
- On refresh:
  - Fetch from Spotify API
  - Call `upsertTracksFromRecentlyPlayed` or `upsertTracksFromLiked` mutation
  - UI displays from Convex paginated queries (persisted history)
- Replace `useQuery` with `usePaginatedQuery` for track lists.
- Remove all SaveForLater UI: buttons, handlers, filtering logic.

## Rollout Checks

- Refresh repeatedly: no duplicates; timestamps only advance.
- Cross-user: one user's history doesn't affect another's.
- Pagination: "load more" fetches next page; tabs show full history beyond 50.
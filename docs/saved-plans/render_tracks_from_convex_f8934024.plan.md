---
name: Render tracks from Convex
overview: Switch the track lists to render from Convex paginated queries instead of direct Spotify API responses, enabling persistent history beyond 50 tracks.
todos:
  - id: page-queries
    content: Replace useState with usePaginatedQuery for recent/liked tracks in page.tsx
    status: completed
  - id: simplify-fetch
    content: Simplify fetch functions to only call API + upsert (remove state updates)
    status: completed
  - id: tracks-panel-props
    content: Update TracksPanel props to accept paginated query results shape
    status: completed
  - id: tracks-panel-render
    content: Update TracksPanel internals to use results array and loadMore()
    status: completed
---

# Render Tracks from Convex DB

## Goal

Display recently played and liked tracks from our `spotifyUserTracks` + `spotifyTracks` tables (via `usePaginatedQuery`) instead of directly from the Spotify API response. The API fetch becomes a background "sync" that upserts new data — Convex's reactivity handles the rest.

## Changes

### 1. Update page.tsx

Replace local state with paginated queries:

```typescript
// Before: useState for tracks
const [recentTracks, setRecentTracks] = useState<RecentlyPlayedItem[] | undefined>();

// After: usePaginatedQuery
const recentTracksQuery = usePaginatedQuery(
  convexApi.spotify.getRecentlyPlayedHistory,
  userId ? { userId } : 'skip',
  { initialNumItems: 50 }
);
```

Same for liked tracks with `getLikedHistory`.The fetch functions become pure "sync" operations — they still call the Spotify API and upsert to Convex, but don't need to `setRecentTracks()` since the query auto-updates.

### 2. Update TracksPanel props

The paginated query returns a different shape:

```typescript
// usePaginatedQuery returns:
{
  results: Array<{ userId, trackId, lastPlayedAt, ..., track: SpotifyTrack | null }>,
  status: "CanLoadMore" | "LoadingMore" | "Exhausted",
  loadMore: (numItems: number) => void,
  isLoading: boolean
}
```

Update `TracksPanel` to accept this shape and map to the existing UI.

### 3. Update TracksPanel internals

- Use `results` instead of direct track arrays
- Replace manual "Load More" button logic with `loadMore()` from the query
- Adapt the track item shape (e.g., `item.track` comes from the joined query)

### 4. Remove obsolete state

- Remove `recentTracks`, `likedTracks`, `likedTracksTotal` useState
- Remove `isLoadingTracks`, `isLoadingLiked` (use query's `isLoading` instead)
- Simplify fetch functions to just call API + upsert (no state updates)

## Files to modify

- [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx) — switch to usePaginatedQuery, simplify fetch functions
# Rob's Top 50 Genre Counts — Product/Technical Spec

## Overview

Add a public Rob's Top 50 stats view that shows how many albums in a selected published ranking year belong to each Rate Your Music top-level genre.

This feature builds on existing systems:

- Published Rob ranking lists at `/public/robs-top-50`
- Spotify-backed ranking rows in `robRankingAlbums`
- RYM scrape links in `rateYourMusicSpotifyAlbumLinks`
- Release genre tags in `rateYourMusicReleaseGenres`
- RYM genre hierarchy in `rateYourMusicGenres` and `rateYourMusicGenreRelationships`

The UI should use counts only. It should not calculate or display percentages in the first version.

## Goals

- Add a new public stats subpage at `/public/robs-top-50/stats/genres`.
- Let visitors select a published Rob ranking year using the same year-pill pattern as the public list page.
- Show one row per top-level RYM genre with the number of ranked albums in that year that roll up to that genre.
- Show a coverage line/count for ranked albums that do not have usable RYM genre data.
- Keep the existing artist stats pages unchanged.

## Non-Goals

- Percentages, charts, or denominator debates in v1.
- Cross-year genre trend charts.
- Descriptor counts.
- Genre drill-down into subgenres.
- Manual RYM linking from the public page.
- Genre stats for unpublished years.
- Genre stats for manual Rob ranking entries without a Spotify album link, except counting them as missing genre data.

## Data Semantics

### Count Scope

For the selected published year, the denominator-like base is the year list itself: the Rob ranking entries in `robRankingAlbums` for that published `robRankingYears` row.

The page displays counts, not percentages:

- `totalAlbums`: number of ranking entries for the year.
- `albumsWithGenreData`: number of entries with at least one top-level genre resolved.
- `albumsMissingGenreData`: `totalAlbums - albumsWithGenreData`.
- `genres`: top-level genre count rows.

### Genre Counting Rules

- Use the latest `rateYourMusicSpotifyAlbumLinks` row for each Spotify album (`albumId`) by `updatedAt`.
- Load that link's `scrapeId`.
- Use primary RYM genres only (`rateYourMusicReleaseGenres.role === "primary"`).
- Resolve each primary genre key up the RYM taxonomy tree to a top-level genre.
- Deduplicate top-level genres per album before counting, so one album contributes at most `1` to a given top-level genre.
- If an album has multiple primary genres that roll up to different top-level genres, count it once in each of those top-level genres.
- If an entry is manual-only, lacks `albumId`, lacks an RYM link, lacks release genres, or cannot resolve a top-level genre, count it as missing genre data.

### Taxonomy Behavior

RYM genre denormalization already expands upward for For Later filters via `filterGenreKeysSorted`, but Rob ranking rows should not depend on For Later projections. This feature should join directly through RYM link and taxonomy tables, then reuse the existing top-level rollup logic:

- `resolveTopLevelGenreKey` from `convex/_utils/rymGenreHierarchy.ts`
- `buildTopLevelGenreCounts` from `convex/_utils/forLaterRecommendations.ts`
- `loadRymGenreParentKeysByChild` from `convex/_utils/forLaterFilterProjection.ts`

## Backend Design

Add a focused aggregation path in `convex/robRankings.ts`, with pure counting logic in a new utility file.

### New Convex Query

`api.robRankings.getPublishedTopLevelGenreCountsForYear`

Args:

```ts
{
	year: v.number(),
}
```

Returns:

```ts
{
	year: number,
	totalAlbums: number,
	albumsWithGenreData: number,
	albumsMissingGenreData: number,
	genres: Array<{
		genreKey: string,
		label: string,
		count: number,
	}>,
}
```

Behavior:

1. Find the published `robRankingYears` row for `args.year`.
2. Return an empty summary if the year is not published or does not exist.
3. Load rankings for the year through `robRankingAlbums.by_yearId`.
4. For each ranking:
   - If no `albumId`, mark missing.
   - Load latest RYM album link from `rateYourMusicSpotifyAlbumLinks.by_albumId`.
   - Load release genre rows from `rateYourMusicReleaseGenres.by_scrapeId`.
   - Keep only primary genres.
   - Load genre metadata from `rateYourMusicGenres` and resolve top-level keys.
   - Count the album as having genre data if at least one top-level key resolves.
5. Return genre rows sorted by `count` descending, then label ascending.

### Utility Module

Create `convex/_utils/robRankingGenreStats.ts` for pure functions:

- Build top-level genre count rows from per-album top-level keys.
- Compute coverage counts.
- Sort rows predictably.

This mirrors the existing artist stats split in `convex/_utils/robRankingArtistStats.ts`.

## Frontend Design

Add a new public stats page:

- `src/app/public/robs-top-50/stats/genres/page.tsx`
- `src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx`

Update:

- `src/app/public/robs-top-50/_components/public-stats-nav.tsx`

### Page Behavior

- Use `api.robRankings.listPublishedYears` for year pills.
- Default to the most recent published year.
- Respect `?year=YYYY` when valid, matching the public list page behavior.
- Query `api.robRankings.getPublishedTopLevelGenreCountsForYear` for the active year.
- Show:
  - Year selector pills.
  - Coverage text: `43 / 50 albums have genre data; 7 missing`.
  - Count-only genre rows: `Rock 18`, `Hip Hop 9`, etc.

### Empty States

- No published years: `No published lists yet. Check back soon.`
- Selected year has no albums: `No albums for this year.`
- Selected year has no genre rows: show the coverage line and `No genre data available for this year yet.`

## UI Placement

Add a `Genres` pill to the stats subnav:

- Finish counts
- Highest placement
- Unique artists
- Genres

The top-level nav stays as `Lists` and `Artist stats`; this feature only extends the stats subnav.

## Testing

### Backend Unit Tests

Add tests for `convex/_utils/robRankingGenreStats.ts`:

- Counts albums by top-level genre.
- Deduplicates duplicate top-level keys within one album.
- Counts one album in multiple top-level genres when applicable.
- Computes missing genre data as `totalAlbums - albumsWithGenreData`.
- Sorts by count descending, then label ascending.

### Source-Level Integration Tests

Add source tests to verify:

- `robRankings.ts` exposes `getPublishedTopLevelGenreCountsForYear`.
- The query reads `rateYourMusicSpotifyAlbumLinks.by_albumId`.
- The query reads `rateYourMusicReleaseGenres.by_scrapeId`.
- The stats nav includes `/public/robs-top-50/stats/genres`.
- The genres page calls `api.robRankings.getPublishedTopLevelGenreCountsForYear`.

### Verification Commands

Run:

```bash
pnpm exec tsx --test convex/_utils/robRankingGenreStats.test.ts convex/rob-ranking-genre-stats-source.test.ts src/app/public/robs-top-50/stats/genres/page-source.test.ts
pnpm typecheck
pnpm exec biome check src/app/public/robs-top-50/stats/genres/page.tsx src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx src/app/public/robs-top-50/_components/public-stats-nav.tsx convex/_utils/robRankingGenreStats.ts convex/robRankings.ts
```

Full-repo Biome may still report existing unrelated Convex lint/format issues. Focused checks are sufficient for this feature unless touched lines introduce new issues.

## Risks and Tradeoffs

- Query-time joins are acceptable for published Top 50 lists because each year has about 50 ranking entries.
- Manual-only entries will count as missing genre data until linked to a canonical Spotify album/RYM scrape path.
- Choosing latest RYM link by `updatedAt` matches album-library behavior but can hide older links if multiple links exist for one album.
- Count-only display avoids misleading percentages while RYM coverage is still imperfect.

## Open Questions

None. The first version is count-only, year-scoped, and includes missing genre data coverage.

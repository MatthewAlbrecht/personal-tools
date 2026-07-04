# Genius Credits Scraping Design

**Goal:** Scrape the Genius credits section for every newly scraped lyric page and persist it in Convex as structured data.

## Background

The app has two lyric scraping paths that create lyric records:

- Album Lyrics Aggregator: `convex/geniusAlbums.ts` stores songs in `geniusSongs`.
- Playlist Lyrics: `src/app/api/playlist-lyrics/_utils.ts` builds a scrape input that `convex/playlistLyrics.ts` stores in `geniusLyricScrapes`.

Both paths already store core page metadata, lyrics, and `about`. Credits should follow that same pattern: optional scraped metadata stored with the lyric record that came from the Genius song page.

## Data Shape

Store credits as an optional structured array:

```typescript
type GeniusCredit = {
	label: string;
	contributors: Array<{
		name: string;
		url?: string;
	}>;
};
```

Convex schema additions:

- `geniusSongs.credits?: GeniusCredit[]`
- `geniusLyricScrapes.credits?: GeniusCredit[]`

The field is optional so existing records remain valid and unchanged. This work is future-only: new scrapes and explicit rescrapes must populate credits when the Genius page contains a credits section; no backfill is included.

## Parser Behavior

Add shared Genius credits parsing logic in `convex/_utils/geniusParser.ts`, then reuse it from both lyric creation paths.

The parser should:

- Locate the Genius `Credits` section in the `song-info` area, including markup like `data-testid="song-info"` / `data-testid="song-info-outer"`.
- Return one item per credit row with a non-empty `label`.
- Extract link contributors as `{ name, url }`, normalizing relative Genius URLs to absolute `https://genius.com/...` URLs.
- Extract plain text contributors as `{ name }`, so values like `Released on: October 6, 2014` are preserved.
- Preserve contributor display names exactly after whitespace normalization.
- Exclude the `Tags` section from credits.
- Return `undefined` when no credits are found.

The parser should not store raw HTML. It should avoid class-name-specific selectors where possible because Genius class names are hash-like and unstable.

## Integration

### Album lyrics

`convex/geniusAlbums.ts` should import the shared credits extractor, call it for each song page, pass `credits` to `createSong`, and store it on `geniusSongs`.

`createSong` should accept `credits` as an optional validator argument and write it through during insert.

### Playlist lyrics

`convex/_utils/playlistLyrics.ts` should include `credits` in `GeniusSongScrapeInput` by calling the shared credits extractor inside `buildGeniusSongScrape`.

`convex/playlistLyrics.ts` should add `credits` to:

- scrape return validators (`scrapeValidator`, `publicScrapeValidator`)
- sync/upsert input validators
- `ScrapeUpsertInput`
- `upsertScrapeRow` insert and patch paths

This keeps credits available to private and public playlist fetches wherever scrape data is already returned.

## Non-Goals

- No backfill job or bulk rescrape for existing records.
- No new UI display is required in this change.
- No raw credits HTML storage.
- No separate credits table; credits belong to the scraped lyric record and are loaded with it.

## Error Handling

Credits are optional metadata. Failure to find or parse credits must not fail the full lyric scrape if the existing required fields are present. The scraper should still reject pages that lack required song metadata or lyrics according to current behavior.

Malformed individual credit rows should be skipped when either the label or contributor text is empty.

## Testing

Add focused tests for the shared parser and the playlist scrape builder:

- Extracts `Released on`, `Producer`, `Writers`, and linked contributors from representative Genius credits markup.
- Excludes `Tags`.
- Normalizes contributor URLs.
- Returns `undefined` when the credits section is absent.
- `buildGeniusSongScrape` includes `credits` in the returned scrape input.

Run the relevant Node test file and TypeScript checks before claiming the work is complete.

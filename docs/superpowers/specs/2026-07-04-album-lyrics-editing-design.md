# Album Lyrics Editing Design

**Goal:** Make album lyric pages complete and editable: every Genius album track gets a section even without lyrics, private album pages get an override-based edit data view, and albums can be mapped to canonical Spotify albums.

## Background

Album lyrics currently have two creation paths:

- `/lyrics` uses `src/app/api/scrape-genius/route.ts` to scrape album/song data, then writes albums and songs through `convex/geniusAlbums.ts`.
- `convex/geniusAlbums.scrapeAndStoreAlbum` can also scrape and store an album directly.

The `/api/scrape-genius` path currently only returns songs when both a song title and lyrics are present, which skips instrumentals, interludes, pages without lyrics, and song pages that fail fetch/parse. The rendered album page then has no section for those tracks.

Album pages also lack a private data editor. Playlist lyrics already have an editor with non-destructive overrides, and album zines already have per-song zine settings such as `zineShowCredits`. Album lyrics should use the same general pattern: preserve scraped values, then layer user overrides on top.

## Scrape Completeness

Every tracklist item must produce a `geniusSongs` row.

For each tracklist item, persist:

- `trackNumber`
- `geniusSongUrl`
- `songTitle` from the tracklist as the fallback title
- `lyrics`, defaulting to an empty string
- optional `about`
- optional scraped `credits`
- optional scrape metadata for visibility/debugging: `scrapeState?: "ready" | "failed"` and `scrapeError?: string`

When the song page fetches and parses successfully, use the page title/lyrics/about/credits. When it does not, create a placeholder row from tracklist data with empty lyrics and a failed/unavailable scrape state.

Album readers and zines should render a section/page for every row. Empty lyrics should display a short no-lyrics placeholder rather than disappearing.

## Override Model

Use override fields instead of destructive edits to scraped data.

Album-level overrides:

- `albumTitleOverride`
- `artistNameOverride`
- `summaryOverride`
- `frontPageImageUrlOverride`
- optional Spotify mapping fields described below

Song-level overrides:

- `songTitleOverride`
- `lyricsOverride`
- `aboutOverride`
- `durationSecondsOverride`
- per-credit visibility settings

Rendering rule:

```typescript
displayValue = override ?? scrapedValue
```

For text areas, an empty saved override should clear back to the scraped value unless the implementation intentionally supports a "force empty" control. Keep the first version simple: empty input removes the override.

## Credit Pair Visibility

Credit pair controls apply to scraped Genius credit rows such as `Producer`, `Writers`, `Released on`, `Vocals`, and similar label/value rows.

Store hidden credit labels per song, for example:

```typescript
hiddenCreditLabels?: string[];
```

Default behavior: all scraped credit rows are visible. If a label is in `hiddenCreditLabels`, omit that credit row wherever scraped credit rows are displayed later. The existing zine `zineShowCredits` setting remains a separate whole-section control for zine layout.

Editable credit content is not part of this version. This version only hides/shows scraped credit rows.

## Edit Data View

Add a private route:

```text
/lyrics/[slug]/edit
```

Add an "Edit data" button from the private album lyrics page. Do not add this button to public routes.

The edit view should show:

- Album override form: album title, artist name(s), summary, front page image URL, Spotify mapping.
- Track cards in track order: title override, lyrics override, about/summary override, duration override, and credit row visibility toggles.
- Source values alongside or as placeholders, so it is clear what the override will fall back to.
- Save-on-blur or explicit save controls following the local playlist editor patterns. Prefer narrow mutations with clear toast feedback.

## Spotify Album Mapping

Album lyrics should be mappable to a canonical Spotify album.

Add optional fields on `geniusAlbums`:

- `spotifyAlbumId?: string`
- `spotifyAlbumConvexId?: Id<"spotifyAlbums">`
- `spotifyAlbumMatchMethod?: "spotify_id" | "title_artist" | "manual"`
- `spotifyAlbumMatchedAt?: number`

The edit view should support:

- manual Spotify album ID entry
- an auto-match button
- display of the current mapped Spotify album when present

Auto-match order:

1. If a Spotify album ID is provided, look up `spotifyAlbums.by_spotifyAlbumId`.
2. Otherwise, normalize the display album title and artist names with the existing RYM-style matching helpers: `normalizeAlbumTitle`, `buildArtistKeys`, and `artistKeysIntersect`.
3. Query `spotifyAlbums.by_albumTitleKey` and accept the match only when exactly one Spotify album has an intersecting artist key.
4. If there is no unique match, leave the album unmapped and return enough information for the UI to say no unique match was found.

Manual mapping should store method `"manual"`. Exact Spotify ID mapping should store method `"spotify_id"`. Unique normalized title/artist matching should store method `"title_artist"`.

## Non-Goals

- No bulk backfill of existing albums unless done by explicitly rescraping or editing an album.
- No destructive rewrite of scraped values when editing display data.
- No public edit route.
- No editable scraped credit content in this version.
- No Spotify API search in this version unless the album already exists in `spotifyAlbums`; mapping works against local canonical Spotify album rows.

## Testing

Add focused tests for pure scrape/mapping helpers where possible:

- Album scrape assembly includes every tracklist row, including rows with no lyrics or failed song-page fetch.
- Empty lyrics render as a no-lyrics placeholder.
- Override helpers choose override values when present and scraped values otherwise.
- Credit visibility hides only selected credit labels.
- Spotify matching accepts exact ID, accepts a single normalized title/artist match, and rejects ambiguous/no matches.

Run targeted Node tests, `pnpm typecheck`, and scoped Biome checks on touched files before claiming completion. Full `pnpm check` may still fail on known unrelated generated/legacy diagnostics; report that separately if unchanged.

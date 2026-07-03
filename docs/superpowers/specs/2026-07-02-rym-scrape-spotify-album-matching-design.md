# RYM Scrape Spotify Album Matching Design

## Goal

When a Rate Your Music scrape is created or refreshed, the app should try to match it against every canonical Spotify album we have, not only albums in the For Later list.

The long-term product goal is that every Spotify album in the library can be connected to a RYM scrape. This change makes new RYM scrape ingestion contribute to that goal automatically, while keeping manual backfill explicit and controlled.

## Current State

The app already has the right canonical link table: `rateYourMusicSpotifyAlbumLinks`. The `/albums/all` page reads that table to show RYM link state and taxonomy for Spotify albums.

The matching helpers in `convex/_utils/albumMatching.ts` already know how to:

- build match inputs from a Spotify album,
- match a Spotify album to a RYM scrape by Spotify ID or title/artist,
- write links through `linkRymScrapeToSpotifyAlbum`.

The missing path is scrape-driven fan-out. When a RYM scrape comes in, the code currently focuses on For Later album rows. Spotify albums that are not in For Later are not automatically considered.

## Scope

In scope:

- Add a shared helper that attempts to match one RYM scrape against canonical `spotifyAlbums`.
- Call that helper from the RYM scrape write path after a scrape is created or updated.
- Add a manual bounded backfill function for existing RYM scrapes.
- Keep all matching writes in `rateYourMusicSpotifyAlbumLinks`.
- Preserve existing For Later matching behavior.

Out of scope:

- No global queue.
- No automatic one-time backfill during deploy.
- No UI for backfill in this phase.
- No destructive rematching or unlinking.
- No changes to `/albums/all` filters in this work.

## Matching Behavior

The scrape-driven helper should load a single `rateYourMusicScrapes` document and compare it with candidate `spotifyAlbums`.

Matching should reuse existing normalization and artist-key logic from `albumMatching.ts`. The helper should prefer conservative matches:

- If the scrape has a Spotify album ID, match directly to albums with that Spotify ID.
- Otherwise, use normalized title and artist intersection logic against Spotify albums.
- If a scrape is already linked to the same Spotify album, update the existing link metadata rather than duplicating.
- If a scrape is already linked to a different Spotify album, skip it unless the implementation can prove the existing link is for the same album.

The helper should return a small summary:

```ts
type RymScrapeSpotifyAlbumMatchSummary = {
	scrapeId: Id<"rateYourMusicScrapes">;
	checkedAlbums: number;
	linkedAlbums: number;
	skippedAlreadyLinked: number;
};
```

## Ingestion Flow

Wherever a RYM scrape is inserted or updated, the code should call the new scrape-driven Spotify album matcher after the scrape document is saved.

This should not replace For Later matching. If the existing scrape flow already triggers For Later matching, it should continue doing that. The new Spotify album pass is additive.

## Manual Backfill

Add a backend function that can be called manually to process existing scrapes in bounded batches.

The function should:

- accept a limit,
- process the most recently updated scrapes by `rateYourMusicScrapes.by_updatedAt`,
- call the same shared helper per scrape,
- return totals for scrapes processed, albums checked, and links created.

This gives us a safe manual path without silently rewriting or scanning everything during deploy.

## Safety

This feature must be non-destructive:

- Do not delete existing RYM links.
- Do not overwrite manual links with weaker automatic matches.
- Do not modify For Later item manual fields except through existing For Later flows.
- Do not mark albums as not on RYM automatically.

If a possible match conflicts with an existing different link, skip and leave it for manual review.

## Testing

Add unit coverage for the scrape-driven helper behavior:

- exact Spotify ID match links the scrape to the matching Spotify album,
- title/artist match links when Spotify ID is absent,
- already-linked scrapes are not duplicated,
- conflicting links are skipped,
- manual backfill aggregates summaries.

Add a source/flow test or focused unit test proving the RYM scrape write path calls the scrape-driven Spotify album matcher.

## Verification

Run:

```bash
pnpm exec tsx --test convex/_utils/albumMatching.test.ts
pnpm typecheck
```

If the implementation touches files with known pre-existing Biome warnings, verify formatting for changed files and call out any unrelated lint failures.

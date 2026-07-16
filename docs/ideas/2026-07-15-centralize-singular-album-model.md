---
title: Centralize singular album model
domain: albums
kind: enhancement
size: 5
status: done
captured: 2026-07-15
---

## Notes

- Done — already in place: canonical `spotifyAlbums` shared across features; for-later upserts project into `albumLibraryItems` via `upsertAlbumLibraryProjection`
- For Later remains a separate membership table for queue/discovery fields (not a parallel album identity)
- Remaining gaps are separate ideas (e.g. add-by-Spotify-ID on `/albums/all`, library type filter/heuristic vs Spotify `album_type`)
- Original intent: one shared notion of an album; for-later as extra state, not a separate album concept

## Raw

We should centralize the idea of an album, for later is just extra fields on this new singualr idea of an album.

---
title: Add album to albums index
domain: albums
kind: feature
size: 3
status: open
captured: 2026-07-15
---

## Notes

- Ability to add an album from the albums index surface (`/albums/all` / all-albums view — referenced as `/albums/albums`)
- Add by Spotify album ID (lookup/import from Spotify)
- Newly added albums should participate fully in existing index, sort, and filter behavior
- For Later and album library share `spotifyAlbums`; for-later rows carry queue/discovery metadata — entering for-later should also upsert `albumLibraryItems` so they appear on `/albums/all`

## Raw

i should be able to add an album to the /albums/albums page, whatever that means, and it should be fully indexable and sortable and filterable

by spotify id

When we add a for later album we should just make sure if it hits for later then it gets sent to the normal albums area too.  really i dont see why these are different things, right?  maybe theres extra fields for for later? hmmm

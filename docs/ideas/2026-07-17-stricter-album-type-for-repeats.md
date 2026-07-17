---
title: Stricter album type for repeats
domain: music-funnel
kind: fix
size: 2
status: open
captured: 2026-07-17
---

## Notes

- Repeats that count as albums should be stricter about Spotify album type
- Only treat Spotify `album` and `compilation` as albums for repeats (exclude singles, EPs, etc. if those come through as other types)

## Raw

we need to be stricter on what is considered an 'album' in these repeats.  if from spotify we get album type then lets make sure only 'album's and complitions are counted.

---
title: Normalize occasion tags for search and management
domain: albums
kind: enhancement
size: 5
status: open
captured: 2026-07-23
---

## Notes

- Occasion tags come from AI enrichment; today they feel like array items and need a model that supports search
- Motivation: eventually build smart playlists filtered by occasion
- Need a way to treat two or more AI-generated occasions as the same (merge/alias)
- Need to add and remove occasions as a managed taxonomy, not only raw enrichment output
- Broader refactor of how occasions work — storage, identity, and curation

## Raw

there are these occasion tags we have because of this enrichment and right now they are items in an array i think, we'll eventually want to be able to create smart playslits with them, and so we'll have to search them and so i think we may have to normalize it.  And since these are all ai generated, I may want to say that two or more occasions are essentially the same.  I may want to remove or add occasions.  you get the idea.  we'll need to refactor how these work.

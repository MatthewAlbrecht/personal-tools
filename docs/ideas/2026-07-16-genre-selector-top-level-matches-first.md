---
title: Genre selector ranks matching top-level genres first
domain: genres
kind: enhancement
size: 2
status: done
captured: 2026-07-16
---

## Notes

- Done — shipped on main (`121023d`…`3f4b50b`): official shadcn Base UI Combobox, FieldGroup rename, call-site migrations, `resolveComboboxFilteredItems` + Top badge on for-later/smart-playlists genre pickers. Spec: `docs/superpowers/specs/2026-07-16-genre-selector-top-level-matches-first-design.md`, plan: `docs/superpowers/plans/2026-07-16-genre-selector-top-level-matches-first.md`. Manual browser smoke still worth a quick pass.
- Wherever a genre selector/dropdown exists site-wide, search results should pin highest-level genres that match the query to the top
- Applies across shared genre picker surfaces (not a single feature page)

## Raw

Across the website where we have a genre selector, lets make sure that we always have highest level genres that match the search input at the top of the dropdown.

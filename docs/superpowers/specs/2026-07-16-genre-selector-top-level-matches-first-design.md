# Genre selector: pin matching top-level genres

**Date:** 2026-07-16  
**Status:** Approved design  
**Idea:** `docs/ideas/2026-07-16-genre-selector-top-level-matches-first.md`

## Goal

When searching in a genre Combobox, matching top-level genres always appear at the top of the dropdown, with a clear visual cue that they are top-level. Empty browse behavior stays as today.

## Context

Genre pickers in for-later filters and smart-playlists recipes use the shared `Combobox` with:

- `items` — full genre key list
- `browseItems` — top-level genre keys (`isTopLevel`), shown when the input is empty

Today, a non-empty filter searches all `items` with no ranking, so top-level matches can sit below deep subgenres.

## Behavior

### Empty filter

- Unchanged: show `browseItems` (or `items` if `browseItems` is omitted)
- No “Top” badge (every browse row is already top-level for genre pickers)

### Non-empty filter

1. Filter full `items` by existing match rules (label or key contains the query, case-insensitive)
2. Stable-partition matches: keys present in `browseItems` first, then remaining matches; preserve relative order within each group
3. Expose `isPinned: true` for rows in the first group so call sites can render a badge

### No `browseItems`

- Filtering only; no pin partition; `isPinned` always false (descriptor Comboboxes and similar stay unchanged)

## API

### `Combobox`

- Continue using `browseItems` as both the empty-state pool and the search pin set
- Extend `ComboboxList` children to:

```ts
(item: string, index: number, meta: { isPinned: boolean }) => ReactNode
```

- `meta.isPinned` is true iff the filter (trimmed) is non-empty **and** the item is in `browseItems`

Prefer extracting filter + partition into a small pure helper (unit-testable) used by `Combobox`’s `filteredItems` memo.

### Genre call sites

Update list item rendering in:

- `src/app/for-later-albums/_components/for-later-filters.tsx`
- `src/app/smart-playlists/_components/recipe-form.tsx`

When `meta.isPinned`, show a small muted trailing **Top** text badge on the row (not a colored background — avoid fighting selected/highlight styles).

## Out of scope

- For-later recommendation drawer stepped genre UI (not this Combobox search pattern)
- Sorting by full hierarchy depth beyond top-level pin
- Changing empty-state browse contents or badge-on-browse

## Testing

- Unit tests for the pure filter/partition helper:
  - empty query → browse list (or full items)
  - query with top-level + subgenre matches → top-level keys first, stable within groups
  - no `browseItems` → filter only, original relative order
- Manual smoke: for-later genre filter and smart-playlists genre field; descriptors unchanged

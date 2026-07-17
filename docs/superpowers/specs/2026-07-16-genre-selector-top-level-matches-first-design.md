# Genre selector: official shadcn Combobox + pin top-level matches

**Date:** 2026-07-16  
**Status:** Approved design (revised)  
**Idea:** `docs/ideas/2026-07-16-genre-selector-top-level-matches-first.md`

## Goal

1. Replace the hand-rolled `src/components/ui/combobox.tsx` with the **official shadcn Combobox** (`@base-ui/react`) and migrate every call site to it.
2. On genre Comboboxes: when searching, pin matching top-level genres to the top and show a muted **Top** badge on those rows. Empty browse stays top-level-only.
3. Keyboard navigation (scroll highlight into view) comes from Base UI — do not reimplement `scrollIntoView`.

## Context

### Why replace the hand-rolled control

`src/components/ui/combobox.tsx` is a custom Popover + listbox that only *looks* like shadcn’s API. It does not use Base UI / official shadcn. Known gap: ArrowUp/ArrowDown updates highlight styling but never scrolls the active option into the `overflow-y-auto` list — highlight can leave the viewport. Official shadcn Combobox (Base UI) handles this.

### Current call sites (all must migrate)

- `src/app/for-later-albums/_components/for-later-filters.tsx` — genres (`browseItems` = top-level) + descriptors
- `src/app/smart-playlists/_components/recipe-form.tsx` — genres + descriptors
- `src/app/concerts/_components/venue-multiselect.tsx` — venues

### Dependency note

Official Combobox depends on `@base-ui/react`. The rest of this app’s UI primitives remain Radix. That mix is acceptable for this migration (shadcn ships Combobox on Base UI). Do **not** migrate unrelated Radix components in this work.

## Part A — Adopt official shadcn Combobox

### Install

- Run `pnpm dlx shadcn@latest add combobox` (overwrite the hand-rolled file).
- Pull registry deps as needed: shadcn **`input-group`**, button size updates if required by the registry file (`icon-xs`, etc.).

### Naming collision: `InputGroup`

This repo already has `src/components/ui/input-group.tsx` — a **form field wrapper** (label + children), used by Folio Society config. Official shadcn Combobox needs a different **`InputGroup`** (input chrome with addons).

**Resolution:** Rename the existing form helper to `FieldGroup` (file `field-group.tsx`, export `FieldGroup`) and update its one consumer. Then install shadcn’s `input-group` under the standard name.

### API migration (call sites)

Move from hand-rolled patterns to official ones:

| Hand-rolled | Official shadcn / Base UI |
|-------------|---------------------------|
| `getItemLabel` | `itemToStringLabel` (and `itemToStringValue` if needed) |
| `browseItems` | Not built-in — see Part B (`filteredItems`) |
| `ComboboxTrigger` wrapping chips | `useComboboxAnchor` + `ComboboxChips ref={anchor}` + `ComboboxContent anchor={anchor}` |
| `ComboboxChip value={key}` + label children | Official chip API (selected value + display text per docs) |
| Manual highlight / Enter / Tab | Base UI built-in |

After migration, delete any leftover hand-rolled-only helpers that are unused.

## Part B — Genre top-level pin + badge

### Behavior

**Empty input**

- Show only top-level genre keys (same as today’s `browseItems`).
- No **Top** badge.

**Non-empty input**

1. Filter full genre list by label/key contains query (case-insensitive).
2. Stable-partition: matches in the top-level set first, then other matches.
3. Show muted trailing **Top** text on pinned rows only (no colored row background).

**Descriptors / venues**

- Use default Combobox filtering (no pin, no badge).

### Implementation approach

Keep a small pure helper (unit-tested):

```ts
resolveComboboxFilteredItems({
  items,
  browseItems?,
  filter,
  getItemLabel,
}) → { filteredItems, pinnedKeys }
```

Wire genre Comboboxes with Base UI’s **external list control**:

- Controlled `inputValue` / `onInputValueChange` (or equivalent Base UI input API).
- Pass `filteredItems={...}` from the helper so the list order is ours (pin) and empty browse uses `browseItems`.
- When rendering genre rows: if `pinnedKeys.has(item)`, show **Top** badge.

Do **not** fork the shadcn Combobox source for pin logic — keep pin/badge at the genre call sites (+ shared helper).

## Out of scope

- For-later recommendation drawer stepped genre UI
- Hierarchy-depth sorting beyond top-level pin
- Migrating other Radix UI primitives to Base UI
- Re-adding custom `scrollIntoView` (Base UI owns this)

## Testing

- Unit tests for `resolveComboboxFilteredItems` (empty / pin / no browseItems / case-insensitive)
- After Combobox swap: manual smoke on for-later genres + descriptors, smart-playlists genres + descriptors, concerts venues
- ArrowDown/ArrowUp through a long list — highlight stays visible (Base UI)
- Genre search: top-level matches first with **Top** badge; empty browse has no badge

# Smart Playlist Fields Refactor Design

## Overview

Refactor smart playlist recipe filters so the form controls match how filters are actually used: dual-range rating and duration, per-genre include/exclude with role, For Later year picker, improved added-window UX (presets + alignment fix), and persisted album exclusions from the live preview.

Approach: **schema-first** — redesign `SmartPlaylistFilters`, migrate existing recipes, then rebuild the form and resolver around the new shape. Reuse For Later’s `YearRangePicker`. Extract a dual-range slider only if rating and duration share the same primitive.

Related idea: `docs/ideas/2026-07-16-refactor-smart-playlist-fields.md`. Parent feature: `docs/superpowers/specs/2026-07-10-smart-playlist-recipes-design.md`.

## Goals

- Rating as a dual-range slider over discrete ratings **1–15** (tier/sub-tier labels), full range by default.
- Duration as a dual-range slider with open ends: **under 20 min** (left) and **≥ 1:30** (right).
- Genre filters as repeatable clauses (include/exclude + primary/secondary/either), with ALL/ANY at the section top applying to **includes only**.
- Year selection via For Later’s `YearRangePicker`.
- Keep Added window (relative + calendar month); fix Type/Year/Month alignment; add relative presets (7 / 14 / 30 / 90 days).
- Persist album exclusions on the recipe; set/clear them from live preview rows; apply to preview and sync.
- Leave descriptors, name, source, sync mode, and track selection unchanged.

## Non-Goals

- Unifying For Later and smart-playlist filter UIs into a shared filter kit beyond reusing `YearRangePicker` (and optionally a dual-range slider).
- Changing sync modes, cron, Spotify write pipeline, or track selection.
- Natural language rule editing.
- Album search/picker for exclusions (preview-row exclude only).
- Descriptor UX changes.

## Data model

### Genre clauses

```ts
type GenreRole = "primary" | "secondary" | "either";

type GenreClause = {
  genreKey: string;
  mode: "include" | "exclude";
  role: GenreRole; // default on add: "primary"
};
```

### Filters object

```ts
type SmartPlaylistFilters = {
  genreClauses: GenreClause[];
  genreMatch: "all" | "any"; // include clauses only
  descriptorKeys: string[];
  descriptorMatch: "all" | "any";
  ratingMin: number; // default 1
  ratingMax: number; // default 15
  yearMin?: number;
  yearMax?: number;
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
  durationOpenLow?: boolean;  // true ⇒ under 20 min (no closed lower bound)
  durationOpenHigh?: boolean; // true ⇒ ≥ 90 min (no closed upper bound)
  addedWindow?: AddedWindow;  // existing union unchanged
  excludedAlbumIds: Id<"spotifyAlbums">[];
};
```

**Removed:** `genreKeys`, `primaryGenresOnly`, `durationBucketKey` (if still present in UI paths).

### Semantics

| Filter | Behavior |
| --- | --- |
| Include genres | Combined with `genreMatch` (ALL/ANY). Each clause’s `role` limits which genre slot(s) match (`primary`, `secondary`, or either). |
| Exclude genres | Always applied after includes: album must not match that genre+role. Independent of ALL/ANY. |
| Rating | Stored as closed 1–15. Resolver treats `ratingMin === 1 && ratingMax === 15` as no rating filter. |
| Duration | Open-low only / open-high only / both open / closed band via min/max minutes. Both open (or both flags true with no closed bounds) = no duration filter. Interior stops are whole minutes between under-20 and 90. |
| Year | Same `yearMin` / `yearMax` bounds as For Later picker. |
| Added window | Existing `AddedWindow` union. For Later source only (hidden for Rankings). Presets set `{ type: "relative", unit: "days", amount: N }`. |
| Exclusions | Dropped after filter resolution, before counts and track expansion. Applies to `previewMatches` and `resolveMatches` (sync inherits). |

### Migration

One idempotent internal mutation over `smartPlaylists`:

- For each `genreKey` in old `genreKeys`, create an include clause with `role: "primary"` if `primaryGenresOnly` was true, else `"either"`.
- Preserve `genreMatch`.
- Set `excludedAlbumIds: []` if missing.
- Ensure `ratingMin`/`ratingMax` exist (default 1–15 when unset).
- Drop `genreKeys` and `primaryGenresOnly` from stored filters after transform.

Run once (dev dashboard / one-shot), then leave as no-op or remove.

## UX

Rebuild the filter section of `RecipeForm` (create/edit stay single-page).

### Genres

1. ALL / ANY toggle at top of the section (includes only).
2. Combobox selects a genre → appends a mini-row defaulting to **Include** + **Primary**.
3. Each row: genre label, Include/Exclude, role (Primary / Secondary / Either), delete.
4. “Add another genre filter” below the list.

### Rating

Dual-range slider, discrete stops 1–15, labels like “Actively Bad · Low” … “Holy Moly · High”. Defaults to full range.

### Duration

Dual-range slider: left open = under 20 min, right open = ≥ 1:30, interior minute stops. Defaults to both ends open (no filter).

### Year

Reuse `src/app/for-later-albums/_components/year-range-picker.tsx` wired to `yearMin` / `yearMax` (import or thin re-export; no behavior fork).

### Added window (For Later only)

- Keep Type → Relative / Calendar month controls.
- Fix vertical alignment and control height inconsistency for Type / Year / Month.
- Add preset chips: last **7 / 14 / 30 / 90** days. Selecting a preset sets relative days and can still be edited via Type.

### Live preview + exclusions

- Each preview album row gets an **Exclude** control.
- Exclusions listed under preview as removable chips; undo re-includes.
- Preview counts exclude those albums; sync uses the same resolved set.

### Unchanged

Name, source (locked after create), sync mode, descriptors, track selection (`allTracks`).

## Backend

### Resolver (`convex/smartPlaylists.ts`)

1. Apply non-genre filters (rating, year, duration, added window, descriptors) as today, adapted to new fields.
2. Genre includes with ALL/ANY + per-clause role against primary/secondary keys.
3. Genre excludes veto matching albums.
4. Remove `excludedAlbumIds` from the candidate set.
5. Return albums/counts for preview; same path feeds sync via `resolveMatches`.

### Validators

Update Convex validators for `filters` on create/update/preview/resolve to the new shape. After migration, old fields are rejected.

### Rule summary (`src/lib/smart-playlists/rule-summary.ts`)

- Genres: e.g. `Folk (primary)`, `!Jazz (secondary)`, joined by ALL/ANY wording.
- Rating: tier/sub-tier labels when bounds align to known tiers; otherwise numeric.
- Duration: `under 20m`, `20m–1h30m`, `1h30m+`, or closed band.
- Append `−N excluded` when exclusions exist.

## Architecture

```
RecipeForm (new controls)
  → SmartPlaylistFilters (new schema)
  → previewMatches / resolveMatches (updated matcher)
  → expand + sync (unchanged; sees already-filtered albums)

Migration internalMutation
  → rewrite stored filters on smartPlaylists docs
```

Dual-range slider: one shared UI primitive for rating (ordinal 1–15) and duration (open-ended minute axis) if practical; otherwise two thin wrappers over the same base.

## Error handling

- Empty genre clause list = no genre filter (same as today with empty keys).
- Invalid/missing excluded album id: ignore on resolve (album already gone).
- Migration skips docs already in new shape.
- Form validation: at most **one row per `genreKey`**. Changing include/exclude or role edits that row; adding an already-listed genre focuses/updates the existing row instead of stacking duplicates.

## Testing

Unit tests (existing `src/lib/smart-playlists/*.test.ts` pattern):

- Include ALL/ANY with roles; exclude veto; `either` matches either slot.
- Duration open-end mapping to bounds.
- Rating 1–15 no-op vs tighter ranges.
- Rule summary for clauses, duration, exclusions.
- Migration transform from old `genreKeys` / `primaryGenresOnly`.

Manual:

- Create/edit recipe with each new control; confirm preview counts.
- Exclude from preview; confirm chip + count; Sync now omits those albums.
- Rankings source hides Added window.
- Added window Type/Year/Month visually aligned; presets set relative days.

## Out of scope follow-ups

- Shared filter kit with For Later.
- Exclusion via album search.
- Descriptor section redesign.

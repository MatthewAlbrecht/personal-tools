# Occasion Filters Design

## Goal

Add AI-generated occasion filtering to the For Later browse list and smart playlists for both For Later and the user's Rankings.

This feature depends on the read cutover in `2026-07-21-library-owned-for-later-design.md`. It does not add occasion fields to legacy `forLaterAlbumItems`.

## Scope

### In scope

- Occasion filter in the For Later filter panel
- Any/All matching selectable by the user
- Occasion filters in smart-playlist recipes
- Support for both For Later and Rankings recipe sources
- Source-scoped occasion option catalogs
- Occasion key projection onto `albumLibraryItems`
- Save-time synchronization and existing-data backfill

### Out of scope

- Cover descriptor filtering
- `listenIfYouLike` filtering
- Artist-origin filtering
- Explicit enriched/missing status filtering
- Displaying occasion chips on every For Later row
- Facet-first result pagination

## Data ownership

`albumOccasionFacets` remains the canonical album-global occasion store:

```ts
{
	albumId,
	occasionKey,
	label,
}
```

Add to `albumLibraryItems`:

```ts
occasionKeys: v.array(v.string())
```

During rollout, this field is optional until backfill is verified.

Projection invariant:

- normalized keys;
- unique;
- sorted;
- `[]` means confirmed no occasion tags;
- missing means not yet migrated and must not be treated as confirmed empty during rollout.

Copy keys only. Labels continue to come from canonical occasion facets. A separate occasion-definition table is deferred unless generated labels become inconsistent.

## Synchronization

Centralize live occasion writes:

1. Replace canonical `albumOccasionFacets` for an album.
2. Compute the normalized sorted key array.
3. Query all `albumLibraryItems` rows by `albumId`.
4. Patch `occasionKeys` only when the value changed.

Reuse the existing `albumLibraryItems.by_albumId` index for this fan-out.

At the current personal-app scale, refresh projections in the same mutation for immediate consistency. If fan-out later threatens mutation limits, move it to an idempotent batched internal mutation with an occasion revision; do not add that complexity now.

Every path that changes live occasion facets—including trial promotion—must use the centralized replacement helper.

## Backfill and rollout

1. Add optional `occasionKeys`.
2. Enable save-time writes.
3. Backfill library rows in cursor-based batches by reading canonical facets.
4. Verify every library row has either populated keys or `[]`.
5. Enable For Later and smart-playlist filters.
6. Make `occasionKeys` required in a later schema deploy.

Backfill is idempotent and patches only changed arrays.

## Matching semantics

Smart-playlist and browse filters share:

```ts
occasionKeys: string[];
occasionMatch: "any" | "all";
```

Rules:

- No selected occasion keys: pass.
- Selected keys with no album occasions: fail.
- `any`: at least one selected key is present.
- `all`: every selected key is present.
- Selected keys are normalized and deduplicated before evaluation.

Use a shared pure helper so browse and recipe semantics cannot drift.

## For Later browse

Extend the existing library-row filtered stream:

```text
albumLibraryItems
  → userId + isActiveForLater
  → filterWith(existing predicates + occasion predicate)
  → paginate
```

Filtering remains inside Convex before pagination. Existing split-page handling and scan limits remain.

### Filter UI

Add an **Occasions** multi-select to the existing For Later filter panel, visually distinct from RYM descriptors.

Users can choose Any or All using the same interaction pattern as genre and descriptor match modes.

URL state uses distinct occasion parameters, conceptually:

```text
occasion=late-night
occasion=reading
occasionMatch=all
```

Clearing all selected occasions removes the constraint.

## Smart playlists

Extend smart-playlist filter types, validators, recipe form, summary, preview, and sync resolution with the same occasion keys and Any/All mode.

Both sources evaluate `albumLibraryItems.occasionKeys`:

- For Later source begins from `isActiveForLater`.
- Rankings source begins from the existing Rankings membership field.

Do not query `albumOccasionFacets` per candidate and do not require a separate recipe path for each source.

Product copy calls the second source **Rankings** or **My Rankings**, not “Rob's Rankings.” Existing internal identifiers may remain until a separate naming cleanup.

## Source-scoped option catalogs

Only show occasion options present in the selected source:

- For Later catalog scans the current user's active For Later library rows.
- Rankings catalog scans the current user's Rankings library rows.

Union the rows' `occasionKeys`, then resolve labels from canonical facets.

At low-thousands scale, a dedicated reactive query may collect the bounded user/source set. If it becomes expensive, add per-user/source occurrence counts after measurement; do not use global facet vocabulary as the picker.

The For Later UI requests the For Later catalog. The smart-playlist recipe form requests the catalog for its current source and refreshes options when the source changes.

## Consistency and errors

- Save-time facet replacement and library projection updates occur atomically at current scale.
- Filters are not enabled until projection backfill is verified.
- Missing projection fields during rollout are treated as unmigrated, not as `[]`.
- Unknown selected keys remain in saved recipes but match no albums and display a fallback label until removed.
- Patching unchanged arrays is avoided.
- Sparse occasion filters rely on the existing `maximumRowsRead`, `pageStatus`, and `splitCursor` behavior.

## Testing

### Projection

- Saving occasions replaces facets and updates every library row for the album.
- Clearing occasions writes `[]`.
- Repeating the same save performs no projection patch.
- Trial promotion follows the same synchronization path.
- Backfill is idempotent and distinguishes missing from confirmed empty.

### Matching

- no selection passes;
- Any matches one selected key;
- Any fails with no overlap;
- All requires every selected key;
- selected keys with empty album keys fail;
- normalization and deduplication;
- identical behavior in browse and smart playlists.

### Options

- For Later options include only active For Later albums;
- Rankings options include only Rankings albums;
- changing smart-playlist source changes the catalog;
- labels resolve from canonical facets;
- duplicate keys collapse.

### UI and persistence

- URL parse/serialize round trip;
- recipe validators and stored filters round trip;
- filter summary copy;
- preview and sync return the same matches;
- For Later pagination remains matching-item pagination.

## Success criteria

- Users can filter For Later by one or more occasions using Any or All.
- Users can use the same occasion rules in smart playlists sourced from For Later or Rankings.
- Pickers show only occasions present in the current source.
- Both features evaluate library-row projections without candidate-level facet joins.
- Existing enriched albums work after backfill.
- Cover descriptors remain unchanged and uncommitted to a filter design.

# Folio catalog repair verification

## Local / CI checks

```bash
pnpm exec tsx --test \
  convex/_utils/folioCatalogFields.test.ts \
  convex/folioSocietyBackfill-source.test.ts \
  convex/folioSocietyCatalog-source.test.ts \
  convex/folioSocietyReleases-source.test.ts \
  convex/schema.folio-catalog-source.test.ts \
  src/app/folio-society/_components/folio-book-card-source.test.ts \
  src/app/folio-society/_components/folio-catalog-page-source.test.ts \
  src/app/folio-society/_utils/filter-state.test.ts

pnpm typecheck
pnpm exec biome check convex/_utils/folioCatalogFields.ts \
  convex/folioSocietyBackfill.ts \
  convex/folioSocietyCatalog.ts \
  convex/folioSocietyReleases.ts \
  src/app/folio-society/_components
```

Expected: all tests pass; typecheck and Biome clean.

## UI checklist (dev)

- Header shows maintained `totalCount`, not only the first loaded season.
- Infinite scroll loads older exact-date sections beyond Fall 2026.
- Editions stay separate cards; Collections filter defaults off.
- Exact-date headings; 4+ books on one date → `Fall Collection 2026` style.
- Card covers align; captions reserve author/title/meta rows; no hover jump.
- Detail opens below the season grid; Escape closes; Folio link works.
- Filters use quiet checkboxes; URL key for collections remains `bundles`.

## Stored-row backfill

`Fill dates` / `startStoredCatalogBackfill` paginates **stored** `folioSocietyReleases` (50/batch), fetches verbosity 3 for those IDs, and applies catalog fields. It does **not** walk the Settings Start–End ID range.

Progress on `folioSocietyConfig`:

- `backfillStatus`: `running` | `done` | `error`
- `backfillCursor`: Convex pagination cursor (string) or null
- `backfillProcessedCount`: rows visited
- `catalogIndexedBookCount` / `catalogIndexedCollectionCount`: rebuilt as rows are patched (reset to 0 when backfill starts)

Acceptance after backfill completes:

- Active rows with missing `seasonSortKey` → 0, unless Folio no longer returns that product (count those exceptions).
- UI `totalCount` ≈ indexed active non-collection books (default filters).
- Collections remain hidden until Collections filter is On.

## Production runbook

1. Announce Convex target: `prod` (`diligent-dinosaur-499`, personal-tools production). Get a fresh explicit yes.
2. `npx convex deploy --yes --message "Folio catalog recovery"`
3. Sign in on production, Settings → **Fill dates**. Monitor `backfillStatus` until `done`.
4. Spot-check counts (stored, collections, dated, undated, missing projection fields, UI total).
5. Push `main` if frontend not already live; wait for Vercel Production **Ready**.
6. Verify [https://www.moooose.dev/folio-society](https://www.moooose.dev/folio-society).

# Audit: for-later-albums + album-enrichment vs AGENTS.md

Date: 2026-10-07. Read-only audit. `pnpm typecheck` passes. `biome check` on the slice reports 15 errors / 4 warnings (see Code style).

## Scope (files reviewed)

- Pages/UI: `src/app/for-later-albums/**` (page.tsx is only a redirect to `/albums/up-next`; the UI is shared and mounted from `src/app/albums/_components/up-next-view.tsx`, `src/app/_components/home-music-dashboard.tsx`, `src/app/smart-playlists/_components/recipe-form.tsx`, `src/app/albums/_components/listens-filters.tsx`), `src/app/album-enrichment/**`, `src/lib/hooks/use-for-later-rym-associate-drawer.ts`, `src/lib/hooks/use-auth-token.ts`.
- Convex: `convex/forLaterAlbums.ts` (27 registered fns), `albumEnrichment.ts` (7), `albumEnrichmentTrials.ts` (4), `rateYourMusicScrapes.ts` (10), `rymGenreHierarchy.ts` (3 internal), plus the call graph they hit: `_utils/albumMatching.ts`, `_utils/unmappedRymScrapes.ts`, `_utils/forLaterFilterProjection.ts`, `_utils/albumLibraryProjection.ts`, `_utils/rateYourMusicTaxonomy.ts`, `convex/s3Helper.ts`, `convex/schema.ts` (forLater*, albumEnrichment*, rateYourMusic* tables), `spotify.ts` fns referenced by routes (`upsertAlbum`, `getSpotifyAlbumsBySpotifyIds`, `captureBandcampAlbumToLibrary`).
- API: `src/app/api/{for-later-albums/{sync,find-rym-links},album-enrichment/{_auth,claim,resolve,save,trial,promote-trial},rate-your-music/{scrape,covers},bandcamp/capture}`, `src/pages/api/cron/sync-for-later-albums.ts`, `src/middleware.ts`.
- Lib: `src/lib/for-later-albums-sync.ts`, `src/lib/album-enrichment/*`.
- Tests: 14 `convex/*-source.test.ts` files touching the slice, `convex/_utils/{albumEnrichment*,forLater*,libraryForLater*}.test.ts`, `src/app/for-later-albums/_utils/*.test.ts`, `src/app/album-enrichment/_utils/presentation.test.ts`, `src/lib/album-enrichment/*.test.ts`, `vitest.config.ts`.

Dependence on the no-op `requireAuth` (pre-existing, not re-litigated): the slice calls it 27 times (forLaterAlbums 14, rateYourMusicScrapes 10, albumEnrichment 3). Every one is decorative. See E3 for the slice-specific consequences.

## Summary

| AGENTS.md section | Status | # findings |
|---|---|---|
| Stack table | Drift (Radix not Base UI; date-fns not installed/used; Pages Router cron; tRPC n/a) | 5 |
| UI (shadcn) | Drift | 7 |
| React effects | Drift | 8 |
| Forms | Non-conformant | 3 |
| Dark mode | Mostly OK, 3 token violations | 3 |
| Toasts | Conformant | 0 |
| Env | 1 violation | 1 |
| Auth | Non-conformant (slice-wide) | 5 |
| Convex | Multiple serious violations | 14 |
| Tests | Drift | 5 |
| Code style | Minor drift | 6 |

## Errors and risks (ranked)

**E1. HIGH (perf/deploy-risk): every RYM auto-match reads the entire `rateYourMusicScrapes` table.**
`convex/_utils/albumMatching.ts:160-164` (`matchRymForSpotifyAlbum`): `.query("rateYourMusicScrapes").withIndex("by_updatedAt").order("desc").collect()` then in-JS `findTitleArtistMatch`. Called with no early-exit from `upsertForLaterAlbumItem` (`forLaterAlbums.ts:1188`, once per album per sync), `spotify.ts:1945`, `robRankings.ts:85`. Cost is O(scrapes x albums per sync) and grows with the collection; it will hit the per-transaction document/byte read limit. Fix: store a normalized `albumTitleKey` on scrapes + `by_albumTitleKey` index (mirrors `spotifyAlbums.by_albumTitleKey`), take a bounded candidate set, skip matching when the item already has `rymScrapeId`. Effort M (schema + backfill via migrations, then tighten).

**E2. HIGH (perf): `refreshFilterProjectionsForScrape` does a full-table `.filter` scan per linked album.**
`forLaterAlbums.ts:1816-1819`: `.query("forLaterAlbumItems").filter(q => q.eq(q.field("albumId"), albumId)).collect()` inside a loop over `albumLinks` (all users' rows; there is no `by_albumId` index, only `by_userId_albumId`). Triggered by `upsertRateYourMusicScrape` via nested `ctx.runMutation(internal.forLaterAlbums.refreshFilterProjectionsForScrape)` (`rateYourMusicScrapes.ts:250`), and `/api/rate-your-music/scrape` loops up to 250 of these (route.ts:258-270). Also unbounded `.collect()` at 1798-1801, 1808-1811. Fix: use `by_userId_albumId` (single user) or add `by_albumId`; cap/paginate and reschedule via `ctx.scheduler.runAfter(0, ...)` rather than a nested runMutation. Effort S-M.

**E3. HIGH (security): the whole slice is publicly callable, with client-supplied `userId`, and most of it does not even call `requireAuth`.**
- No `requireAuth` at all (and no ownership check) on: `forLaterAlbums.ts` `upsertForLaterAlbumItem` (1104), `saveForLaterSyncRun` (1217), `getForLaterLastSync` (1242), `getForLaterLastSuccessfulSync` (1254), `getForLaterAlbumItems` (1273), `getForLaterItemBySpotifyAlbumId` (1290), `patchForLaterRymMatch` (1768); `albumEnrichment.ts` `claimNextForLater` (470), `resolveAlbum` (930), `saveSlices` (833), `getAlbumDetails` (1061); all four in `albumEnrichmentTrials.ts` (`saveTrial` 107, `listTrialsForAlbum` 150, `setTrialVerdict` 161, `promoteTrial` 183 - the last overwrites live enrichment).
- Every user-scoped function takes `userId: v.string()` from the caller (Convex guidelines: never accept userId for authorization). `convex/auth.config.js` has `providers: []`, so `ctx.auth` is never populated. The Convex deployment URL is `NEXT_PUBLIC_*`, so anyone can call these directly.
- Next side: `src/middleware.ts` matcher covers only books/folio/articles/concerts/birthdays/playlist-lyrics. `/albums/*`, `/for-later-albums`, `/album-enrichment` pages and `/api/for-later-albums/*` are unprotected. `/api/for-later-albums/find-rym-links/route.ts` has no auth at all and trusts body `userId`. `/api/for-later-albums/sync/route.ts:11-18` treats any non-empty `X-Access-Token` (a Spotify token, not the session token) as authorization and trusts body `userId`; the route also calls `request.json()` unguarded (500 on bad JSON).
- Related out-of-slice exposure reached from this slice's cron path: `src/pages/api/cron/sync-for-later-albums.ts:30` calls public `api.spotify.getConnection({ userId })`, which returns the Spotify access/refresh tokens.
- Bearer-secret routes (`album-enrichment/_auth.ts`, `rate-your-music/*`, `bandcamp/capture`) are the only real gate, but use `!==` string compare (not constant-time) and the Convex functions behind them are open regardless.
Fix path: (a) short term, add a deployment-env shared secret arg checked in Convex for the HTTP-client-only functions and make UI-only ones validate via a custom function wrapper; (b) real fix is the wrapper from AGENTS.md (none exists) plus `ConvexHttpClient.setAuth`. Effort L (cross-cutting), S for removing dead public functions (see E10).

**E4. HIGH-MED (perf): `getForLaterUiSummary` counts with unbounded `.collect()`.**
`forLaterAlbums.ts:1323-1334` collects all active and all dismissed `albumLibraryItems` rows for a user just to take `.length`. Reactive on the Up Next page, so it re-runs on any change to those rows. Fix: denormalized counter doc (guidelines: never `.collect().length`) or `@convex-dev/aggregate`. Effort M.

**E5. MEDIUM (perf/correctness): enrichment queue scans up to 1000 items with 4-5 reads per item; "claim" claims nothing.**
- `albumEnrichment.ts:324-345,470-514`: `claimNextForLater` is a `mutation` that performs no write. It is a read dressed as a mutation, and two concurrent agents are handed the same album (no lease/claim marker). For each of up to `FOR_LATER_SCAN_LIMIT=1000` items it calls `buildAlbumEnrichmentSnapshot` (album + RYM links `.collect()` + scrape + enrichment = 4+ reads), i.e. up to ~4-5k docs when most albums are complete. The repo's own comment at `forLaterAlbums.ts:1949` cites a 4096-read ceiling.
- `getQueueStatus` (516) and `listIncompleteQueue` (575) are reactive queries doing 2+ reads x 1000 items on every enrichment/album write.
- `listRecentEnrichments` is bounded and fine.
Fix: add a `needsEnrichment`/`missingSliceCount` field (or a small `enrichmentQueue` table) maintained in `saveSlicesHandler`; make claim a real mutation that writes a `claimedAt` lease, or make it a query. Effort M.

**E6. MEDIUM (perf/write amplification): per-item filter projection does heavy work that nothing reads.**
- `syncForLaterItemFilterProjection` (`forLaterAlbums.ts:522-621`) runs on every upsert/refresh and writes legacy `filter*` fields on `forLaterAlbumItems` plus three facet tables (`forLaterAlbumGenreFacets/DescriptorFacets/DurationFacets`: delete-all + reinsert per call, genre keys expanded with all ancestors). Grep confirms the facet tables and `search_forLaterAlbumItems` and the `by_userId_filter*` indexes have zero production readers: the Up Next list now streams `albumLibraryItems` (`loadForLaterAlbumRows`, 1063), and `pagination-source.test.ts:39-41` asserts it does *not* touch the facet tables. `projectionMatchesFilters` / `forLaterProjectionPredicate.ts` is imported at `forLaterAlbums.ts:39` but never used. These are dead write paths that also burn read/write budget in the same mutation as E1.
- `loadRymGenreParentKeysByChild` (`_utils/forLaterFilterProjection.ts:56-64`) does an unbounded `.collect()` of `rateYourMusicGenreRelationships` (the full RYM hierarchy) on *every* single-item sync (`forLaterAlbums.ts:561`), i.e. per album per sync, and again in `associateForLaterAlbumWithRymScrape` (1719).
- `loadListenSummary` (`forLaterAlbums.ts:356-401`) `.collect()`s all `userAlbumListens` rows for an album, but the only consumer (`syncForLaterItemFilterProjection`, 543-549) uses just `hasListened`.
Fix: delete the facet tables/writes + unused filter fields/indexes/search index (staged index removal + migration), cache the genre-parent map or pass it in, replace `loadListenSummary` with the `userAlbums` existence check. Effort M.

**E7. MEDIUM (data integrity): trial payload is not tied to its slice.**
`albumEnrichmentTrials.ts:107-148` accepts any `payload` union member for any `slice` (schema `albumEnrichmentTrials.payload` is a flat union, `schema.ts:803`). `promoteTrial` (183) then casts (`buildSliceSaveArgs`, 71-95: `payload as SaveSlicesArgs[...]`) and feeds `saveSlicesHandler`, bypassing the `saveSlices` validators. A `whyListen` payload filed under `artistContext` writes garbage into `albumEnrichments`. Fix: discriminated union `v.union(v.object({slice: v.literal("artistContext"), payload: ...}), ...)` in args + schema, or validate in `saveTrial`. Effort S-M (schema change on a populated table: add optional first).

**E8. MEDIUM-LOW (Convex rules): nested mutation call and missing `returns`.**
- `rateYourMusicScrapes.ts:250` calls `ctx.runMutation` from a mutation; guidelines say extract a helper (a nested call is a subtransaction with its own limits; failure semantics differ). Resolve together with E2.
- 18 of 51 registered functions lack `returns`: forLaterAlbums `upsertForLaterAlbumItem` (1104), `saveForLaterSyncRun` (1217), `getForLaterLastSync` (1242), `getForLaterLastSuccessfulSync` (1254), `getForLaterAlbumItems` (1273), `getForLaterItemBySpotifyAlbumId` (1290), `patchForLaterRymMatch` (1768), `refreshFilterProjectionForItem` (1786), `refreshFilterProjectionsForScrape` (1793), `refreshFilterProjectionsForUserAlbum` (1832); rateYourMusicScrapes `upsertRateYourMusicScrape` (157), `listRateYourMusicScrapes` (329), `getRateYourMusicScrapeByUrl` (345), `getRateYourMusicScrapeDetails` (455), `listRateYourMusicScrapeIdsByGenreKey` (479), `listRateYourMusicScrapeIdsByDescriptorKey` (507), `listRateYourMusicGenreKeys` (535), `listRateYourMusicDescriptorKeys` (556). Several return raw docs (`getRateYourMusicScrapeByUrl`, `listRateYourMusicScrapes`), leaking schema into the public API.
- `getForLaterAlbumItems` (1273-1287) takes `limit` but does an unbounded `.collect()` then `.slice(limit)`.
- Other unbounded `.collect()`: `listRateYourMusicScrapeIdsBy{Genre,Descriptor}Key` (500, 528, popular genres = thousands of rows), `listTrialsForAlbum` (157) and `promoteTrial` siblings (231), `unmappedRymScrapes.ts:12,15` (see E9), `loadRymUrlForAlbum` (albumEnrichment.ts:309) and facet loads (449, 460, 1081, 1086). The by-scrape/by-album ones are small in practice; the by-genre ones and table-wide ones are not.

**E9. MEDIUM (perf): `searchUnmappedRymScrapes` is a table scan x2 per keystroke.**
`_utils/unmappedRymScrapes.ts:9-23` `.collect()`s all `rateYourMusicSpotifyAlbumLinks` and all `forLaterAlbumItems` (every user) to build a "mapped" set; `forLaterAlbums.ts:1630-1689` then takes the 500 newest scrapes by `updatedAt` and filters in memory, so older unmapped scrapes are silently unreachable, and the result is re-sorted by `createdAt` after taking by `updatedAt`. Debounced 250 ms from the associate drawer (and `album-rym-associate-drawer.tsx:65`). Fix: add `isMapped`/`linkedAt` on scrapes (maintained in `linkRymScrapeToSpotifyAlbum`) with an index, or use a search index on `albumTitle`. Effort M.

**E10. LOW-MED (dead surface = exposed surface): 11 public functions have no caller.**
No references in `src/`, `scripts/`, or other `convex/` modules: `getForLaterAlbumItems`, `getForLaterItemBySpotifyAlbumId`, `getForLaterLastSync`, `listOpenableRymLinks`, `getForLaterRecommendations`, `patchForLaterRymMatch`, `listRateYourMusicScrapes`, `getRateYourMusicScrapeDetails`, `listRateYourMusicScrapeIdsByGenreKey`, `listRateYourMusicScrapeIdsByDescriptorKey`, plus internal `refreshFilterProjectionForItem`. `/api/for-later-albums/find-rym-links` has no caller and only sets `rymDiscoveryStatus: "queued"` for a worker that does not exist ("Phase 3 AI worker"). Delete or demote to `internal*`. Effort S.

**E11. LOW-MED (reliability): sync design.**
`src/lib/for-later-albums-sync.ts`: sequential `convex.mutation` per playlist album (245-258), each one running E1+E6 work; a mid-run failure leaves partial state and the catch-block `saveForLaterSyncRun` (308) can itself throw unhandled; `stats.albumsMarkedRemoved = 0` is dead (273); `artistKeysFromStoredCanonical` (97-119) duplicates `spotifyAlbumArtistKeys` (`forLaterAlbums.ts:285`) and `canonicalAlbumArtistKeys` (albumMatching). Per AGENTS.md ("actions only for external APIs, call mutations for data") the Spotify fetch belongs in a Convex action batching items into one mutation, not a Next route looping a public mutation per album. Effort M-L.

**E12. LOW: ordering inside a page.** `loadForLaterAlbumRows` re-sorts each page with `sortForLaterRows` (`forLaterAlbums.ts:1096`) on keys different from the index order (`forLaterLastSeenAt`, `_creationTime`); ties can reorder within a page relative to pagination order. Low impact.

**E13. LOW: schema hygiene.** `forLaterAlbumItems` has 13 indexes, redundant prefixes (`by_userId` subsumed by every `by_userId_*`; `by_userId_active` name does not match field `isActive`, guideline wants field names in index name); unused indexes `by_rymDiscoveryStatus`, `by_userId_rymDiscoveryStatus`, `by_userId_albumTitleKey`, `by_userId_rymScrapeId`, the four `by_userId_filter*`. `forLaterFiltersValidator` still carries deprecated `year` and `filterMatch` args. `forLaterAlbumRecommendations.answers` keeps a legacy union arm.

**E14. LOW (env): `uploadToS3` reads `process.env` inside a Next route.** `convex/s3Helper.ts:6-14` (non-null-asserted) is imported by `src/app/api/rate-your-music/covers/route.ts:6` and therefore runs in the Next runtime, bypassing `src/env.js` (which already declares AWS_*, S3_BUCKET_NAME, CLOUDFRONT_DOMAIN). Effort S: pass credentials in as an argument from the route.

## Convention drift by AGENTS.md section

### Stack table
- **UI components "shadcn/ui on Base UI, not Radix": not true in the repo.** `components.json` has no `base` setting (style `new-york`); 14 of 15 `src/components/ui/*` import `@radix-ui/*` / `radix-ui` (alert-dialog, button via `Slot`, checkbox, dialog, dropdown-menu, label, popover, select, separator, sheet, slider, tabs, tooltip); only `combobox.tsx` uses `@base-ui/react`. The slice follows the real library: `asChild` at `for-later-header.tsx:200`, `for-later-row.tsx:344,357`, `year-range-picker.tsx:67` (Base UI uses `render=`, so these break on migration).
- **Dates "date-fns": not installed** (`package.json` has no `date-fns`; zero imports in `src/`). Slice uses native `toLocaleDateString/toLocaleString/Intl.DateTimeFormat`: `recommendation-state.ts:170,180`, `for-later-row.tsx:477`, `for-later-header.tsx:266`, `recent-enrichments.tsx:126`. Either add date-fns (ask) and switch, or fix AGENTS.md.
- **"not Pages Router"**: `src/pages/api/cron/sync-for-later-albums.ts` (and 7 sibling cron files) are Pages Router handlers; this slice's cron path is not on the App Router.
- Icons (lucide-react), toasts (sonner), Zod/TanStack deps present: OK. tRPC not used by the slice: OK.
- `convex-helpers` is installed but only `stream` is used; AGENTS.md's "custom functions" wrappers do not exist (`grep customQuery|customMutation|customCtx` returns nothing).

### UI rules
- Raw `<table>` in `year-range-picker.tsx:91-109,141-178` (shadcn `Table` not present in `src/components/ui`; add via CLI) plus raw `<td>/<tr>` cell buttons.
- 14 raw `<button>` elements in the slice: `year-range-picker.tsx:68,111,144,168`; `for-later-filters.tsx:237,382,596,637` (segmented controls: should be shadcn `ToggleGroup`/`Tabs`); `for-later-row.tsx:147,158,403`; `for-later-rym-associate-drawer.tsx:131`. 4 raw `<label>` in `for-later-filters.tsx:163,180,257,320` (use `Label`/`Field`; `Field` is not in `ui/`, only `field-group.tsx`).
- Ad-hoc bordered cards instead of `Card`: `for-later-row.tsx:125` (`rounded-xl border bg-card`), `for-later-recommendation-drawer.tsx:RecommendationResultCard`, `enrichment-overview.tsx:30` (`<header className="... rounded-xl border bg-card">`), dashed empty-state boxes in `incomplete-queue.tsx` / `enrichment-overview.tsx`.
- **Drawer over Dialog violated**: `for-later-recommendation-drawer.tsx:236` is a `Dialog` containing a multi-field form (year range, sliders, listened, rating, genres, count) and a results view; component is even named `*Drawer`. Convert to `Drawer`. (The RYM associate picker correctly uses `Drawer`; `AlertDialog` in header is a legitimate confirmation.)
- `Image` from `next/image` used correctly; `cn()` used correctly; `components/ui` not hand-edited by the slice.
- Cross-feature coupling: `smart-playlists`, `albums`, and the home dashboard import from `for-later-albums/_components` (`YearRangePicker`, drawer). Shared pieces belong in `src/components/` or `src/lib/`.

### React effects (none of the 9 effects carries the required one-line "syncs with X" comment)
- `for-later-filters.tsx:143-145` copies `filters.search` prop into debounced state: derive/`key`.
- `for-later-filters.tsx:147-158` effect watches `debouncedSearch` to call `onChange`: do it in the input's change handler (debounce there).
- `for-later-filters.tsx:480-483` mirrors props into `minInput/maxInput` state: use `key` on `DurationFilterControls`.
- `for-later-filters.tsx:485-502` timer-driven commit of min/max: move to a debounced handler. Refs reassigned during render (`filtersRef.current = filters`, 133-136, 475-478) also violate React's render-purity rule.
- `for-later-recommendation-drawer.tsx:84-90` resets all state when `open` goes false: reset in `onOpenChange` handler or `key` the content.
- `for-later-rym-associate-drawer.tsx:39-54` mixes state reset/seed (derive or `key`) with focus (legit; could be `onOpenAutoFocus`).
- `year-range-picker.tsx:46-50` re-syncs `draft` from props when closed: set draft inside `handleOpenChange(true)` instead.
- `for-later-row.tsx:64-70` unmount cleanup of a copy-feedback timeout and `for-later-list.tsx:33-47` `IntersectionObserver`: legitimate (timer / browser API); only need the comment. `src/lib/hooks/use-auth-token.ts` (used by `album-enrichment/page.tsx:11`) fetches in an effect, violating "data comes from Convex hooks".

### Forms
- No form in the slice uses TanStack Form + Zod. State-driven inputs: `for-later-filters.tsx` search (125-158) and duration range (473-502), `for-later-rym-associate-drawer.tsx` search (33-54), and the genuine multi-field form `for-later-recommendation-drawer.tsx:69-82` (`useState` x6, answers hand-validated by `normalizeRecommendationAnswers` on the server, no Zod schema, no `Field`).
- The live debounced filters are arguably "not forms", but AGENTS.md says single-input forms and search boxes are covered; clarify the rule (see corrections). The recommendation form is unambiguously a violation. Reuse a shared Zod schema mirroring `recommendationAnswersValidator` (`forLaterAlbums.ts:119`).

### Dark mode
- `year-range-picker.tsx:187` `bg-blue-900 text-white hover:bg-blue-800` (use `bg-primary text-primary-foreground`).
- Hardcoded status palette: amber/emerald in `for-later-recommendation-drawer.tsx:674`, `for-later-row.tsx:260`, `incomplete-queue.tsx:94,135`, `enrichment-overview.tsx:34,155,157,184`. Mostly paired with `dark:` variants or mid-tone, so they render, but they are not semantic tokens. Add `--success/--warning` tokens or document an exception.
- Brand hex (`#1DB954` Spotify at `for-later-row.tsx:229`, `for-later-recommendation-drawer.tsx:734`; Google logo fills `for-later-row.tsx:312-324`): acceptable brand exception.

### Toasts
Conformant: `sonner` `toast.*` in `for-later-header.tsx`, `for-later-row.tsx`, `use-for-later-rym-associate-drawer.ts`; no `alert()`. (Recommendation drawer shows an inline error instead; acceptable.)

### Env
- `convex/s3Helper.ts:6-14` (E14). Otherwise all Next code uses `~/env.js` (`ALBUM_ENRICHMENT_SECRET` min 16, `RYM_EXTENSION_INGEST_SECRET` optional with 503 fallback, `SPOTIFY_SYNC_USER_ID`, `CRON_SECRET`). `process.env` in `convex/` is not used by the slice's own modules.

### Auth
- E3. Additional: three different gating schemes exist and none match AGENTS.md's "X-Access-Token + `validateSessionToken`": enrichment (`ALBUM_ENRICHMENT_SECRET` Bearer, `_auth.ts`), RYM/Bandcamp (`RYM_EXTENSION_INGEST_SECRET` Bearer, copy-pasted in 3 routes), sync (`X-Access-Token` is the Spotify token, only checked for presence). Client `userId` comes from `useAuthToken` -> `/api/auth/status` and is then trusted as a Convex arg. `album-enrichment/page.tsx` gates UI on `userId` only; the queries behind it are open (E3).

### Convex (expert-skill checklist, per rule)
- Object-form functions: OK. Import table: OK (`./_generated/server`, `./_generated/api` only for `internal`). `"use node"`: none in slice; no mixed files. Actions in slice: none (sync lives in Next, see E11).
- `args` validators: all present. `returns`: 18 missing (E8). `v.id` vs `v.string`: ids correct except `ForLaterAlbumRow.id: v.string()` carrying `String(item._id)` (`forLaterAlbums.ts:146,1028`; acceptable as an opaque row key but could be `v.id("albumLibraryItems")`, duplicates `libraryItemId`).
- `withIndex` not `filter`: violated once, badly (E2, `forLaterAlbums.ts:1816`). Elsewhere index use is good; `listForLaterAlbumRows` uses `convex-helpers` `stream` + `maximumRowsRead` correctly.
- Bounded reads: E1, E4, E6, E8, E9.
- internal vs public: 11 dead public fns (E10); HTTP-client-only functions must stay public until auth is solved (E3).
- Mutations cannot fetch: OK (no fetch in slice Convex code).
- Schema evolution: dual-state migration (`forLaterAlbumItems` legacy + `albumLibraryItems.forLater`) with `backfillLibraryForLaterBatch`/`verifyLibraryForLaterMigration`; deprecated fields still in validators (E13). Required-field additions to populated tables: none observed in slice.
- Wall-clock in queries: OK (`now` passed as arg to `getForLaterRecommendations`; note `Date.now()` is called in `createForLaterRecommendation`, a mutation: fine).
- Staged indexes: not used; removing/adding indexes on `forLaterAlbumItems`/`rateYourMusicScrapes` should use `staged: true` per guidelines.
- Timestamps Unix ms, calendar dates ISO strings: OK. Return `null` not `undefined`: handlers returning `Promise<void>` (`patchForLaterRymMatch`, `refreshFilterProjection*`) lack `returns: v.null()`.
- `export function splitArtistNames/parseReleaseYear/normalizeRateYourMusicReleaseUrl` and `saveSlicesHandler` are exported from registered-function modules; move to `convex/model/` per AGENTS.md ("thin public functions, logic in `convex/model/`"). The slice has no `convex/model/`; ~1300 lines of business logic sit in the public module files (`forLaterAlbums.ts` is 2124 lines).

### Tests
- Zero behavioral Convex tests for the slice: no `convex-test` usage for any function (convex-test is used only by `launch-*`). 14 `*-source.test.ts` files `readFileSync` the Convex source and regex it (e.g. `convex/for-later-rym-associate-speed-source.test.ts`), which pins implementation text, not behavior, and would pass on code that is wrong (e.g. E2 and E1 are untested).
- None of the slice's tests run under Vitest: `vitest.config.ts` includes only `convex/launch-*.test.ts`; all slice tests are `node:test` and there is no `test` script in `package.json` (only `test:launch-browser`). `pnpm exec vitest run` per AGENTS.md runs none of them.
- `src/lib/album-enrichment/*` (types, slices, auto-judge, judge-kinds + 3 tests) is dead: nothing in `src/` or `convex/` imports it. `convex/_utils/albumEnrichment{Slices,AutoJudge,JudgeKinds}.ts` are byte-for-byte mirrors with the header "Convex cannot import from `src/lib`", which contradicts AGENTS.md. Also `EnrichmentSliceKey` is re-declared in `src/app/album-enrichment/_utils/presentation.ts:1-5`. Tests for the dead copies run and pass, giving false coverage.
- Bug-first rule: no evidence of repro tests for E1/E2-class issues.

### Code style
- Biome (slice): 7 files need formatting (`covers/route.ts`, `for-later-header.tsx`, `filter-state.ts`, `recommendation-state.ts` and its test, `year-range-selection.ts` and its test), 1 unsorted import block (`recommendation-state.test.ts`), 7 `noNonNullAssertion` errors in `year-range-selection.ts:149,150,191,208,208,211,212`, 4 unsorted-class warnings in `for-later-recommendation-drawer.tsx:584,794,799,806`. `biome check` also flags `src/app/api/extract-article/route.ts:79` (outside slice).
- Unused import `projectionMatchesFilters`, `ForLaterUiFilters` in `forLaterAlbums.ts:25,39`.
- Duplication: `SpotifyLogoIcon` x2 (`for-later-row.tsx:~287`, `for-later-recommendation-drawer.tsx:~707`), `buildSpotifyAlbumUrl` x2, `readableGenreLabelFromKey` (drawer) vs `readableRecommendationLabelFromKey` (`forLaterAlbums.ts:734`), `isRecord` x5 routes, bearer-token parsing x3, hand-copied `ForLaterAlbumRow` (convex type 198 + validator 145 + client `_utils/types.ts`) instead of `FunctionReturnType`/`Infer`.
- Exported React components have no explicit return types (rule says exported functions); decide whether components are exempt.
- File naming: Convex modules camelCase and `google_rym_lucky_search.ts` snake_case (Convex requires valid identifiers; rule should exempt `convex/`).
- Dead code: `src/lib/album-enrichment/**`, `forLaterProjectionPredicate.ts`, facet tables, dead public functions, fake reroll latency (`pickRerollLoadingMs`, `wait` in `for-later-recommendation-drawer.tsx:164-173,830-834` deliberately sleeps 480-980 ms).

## Suggested changes (ranked, with effort)

| # | Change | Fixes | Effort |
|---|---|---|---|
| 1 | Replace table-wide `rateYourMusicScrapes.collect()` in `matchRymForSpotifyAlbum` with an indexed `albumTitleKey` lookup; skip when already linked | E1 | M |
| 2 | Fix `refreshFilterProjectionsForScrape`: drop `.filter`, use `by_userId_albumId`/add `by_albumId`, bound reads, schedule instead of nested `runMutation` | E2, E8 | S-M |
| 3 | Delete dead Convex surface (11 fns + `find-rym-links` route); demote the rest that only Next routes use behind a secret-checked arg | E10, E3 | S |
| 4 | Authz plan: custom-function wrappers in `convex/` + secret arg for HTTP-client functions; add `/albums`, `/for-later-albums`, `/album-enrichment`, `/api/for-later-albums/*` to middleware; stop trusting body `userId`; constant-time secret compare in one shared helper | E3 | L |
| 5 | Remove the dead facet tables/legacy filter fields/indexes/search index and their writes (staged index removal + migration); cache `loadRymGenreParentKeysByChild`; trim `loadListenSummary` | E6 | M |
| 6 | Replace count-by-collect in `getForLaterUiSummary` with a counter doc or aggregate | E4 | M |
| 7 | Enrichment queue: denormalized missing-slice state, real claim lease (or make `claimNextForLater` a query) | E5 | M |
| 8 | Discriminate trial payload by slice in args/schema and in `promoteTrial` | E7 | S-M |
| 9 | Add `returns` to the 18 functions; bound/paginate the remaining `.collect()`s; move logic into `convex/model/` | E8 | M |
| 10 | Make `searchUnmappedRymScrapes` index-backed (`isMapped` flag or search index) | E9 | M |
| 11 | Move sync into a Convex action batching a single mutation; fix catch-path throw; drop dead stat | E11 | M-L |
| 12 | Delete `src/lib/album-enrichment/**` (dead mirror) and dedupe `EnrichmentSliceKey`; update the "Convex cannot import" comments | Tests/Style | S |
| 13 | Add convex-test (Vitest) coverage for upsert/match/associate/saveSlices/promoteTrial; add `test:node` script and widen Vitest `include`; retire source-grep tests as behavioral tests land | Tests | M-L |
| 14 | UI: Recommendation `Dialog` -> `Drawer`; TanStack Form + Zod for it; `Table`/`ToggleGroup`/`Label`/`Card` swaps; replace `bg-blue-900 text-white`; remove effects listed above; add effect comments; date-fns decision | UI/Forms/Effects/Dark | M |
| 15 | `uploadToS3` takes creds as args (no `process.env` in Next path) | E14 | S |
| 16 | Run `pnpm check:write` on slice files (format, class sort, import sort); fix 7 non-null assertions manually | Style | S |

## AGENTS.md corrections

1. **Stack/UI**: "shadcn/ui on Base UI, not Radix" is aspirational. Reality: Radix for 14/15 primitives, Base UI only for `combobox`. Either state "currently Radix; Base UI migration pending (`asChild` -> `render`)" or schedule the migration (skill `migrate-radix-to-base`).
2. **Stack/Dates**: `date-fns` is not a dependency and is unused. Correct the table or approve adding it.
3. **Stack/Pages Router**: add an exception: cron handlers live in `src/pages/api/cron/*` (Vercel cron, Pages Router) and are used by this slice.
4. **Convex/Auth**: "Use auth-wrapped queries/mutations (convex-helpers custom functions)" and "validate with `validateSessionToken`" do not describe the code. There are no wrappers; `requireAuth` is a no-op; `auth.config.js` has no providers; every user-scoped function takes `userId` as an arg (which Convex's own `guidelines.md` forbids). Document the actual model and its known gap, or build the wrapper first.
5. **Auth/API routes**: document the machine-to-machine pattern actually used (Bearer `ALBUM_ENRICHMENT_SECRET`, Bearer `RYM_EXTENSION_INGEST_SECRET`, and `X-Access-Token` meaning the *Spotify* token on the sync route) and that middleware only protects an explicit prefix list.
6. **API-route rule**: "API routes are for external integrations only" conflicts with `/api/for-later-albums/sync` (called by the app's own header button) and the stub `find-rym-links`; and AGENTS says actions are for external APIs, so the Spotify sync belongs in a Convex action.
7. **Tests/Layout**: the stated home for pure logic is `src/lib/` imported by Convex via relative paths, but the repo's real shared-logic home is `convex/_utils/` (imported by `src/` at `for-later-albums-sync.ts:12-15`, `for-later-filters.tsx:23`, `album-details-view.tsx:20`), and mirror headers claim "Convex cannot import from `src/lib`". Pick one and say it. Mention `convex/model/` does not exist yet.
8. **Tests/Commands**: `pnpm exec vitest run` only runs `convex/launch-*.test.ts`; document the `node --test` command (or add a script). Say source-text-grep tests (`*-source.test.ts`) are not acceptable as the sole coverage for new Convex work.
9. **Features list**: `/for-later-albums` is a redirect to `/albums/up-next`; its `_components`/`_utils` are shared across `/albums`, `/smart-playlists`, and the home dashboard. Note where shared UI should live.
10. **Forms**: clarify whether debounced live filter inputs and "submit-less" search fields count as forms; if yes, say how TanStack Form fits a controlled-by-URL filter.
11. **Code style**: exempt `convex/` from kebab-case file names; say whether React components need explicit return types; add a rule on semantic status colors (success/warning) or list the allowed exception (brand logos are already an implicit exception).
12. **Convex section**: add "no nested `ctx.runMutation` from mutations; extract helpers", and "never `.filter` on a table to find rows for an id: add an index" (violated at `forLaterAlbums.ts:1816`).

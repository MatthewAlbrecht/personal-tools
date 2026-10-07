# Audit: folio-society + books + bookcase vs AGENTS.md

Date: 2026-10-07. Read-only audit; `biome check` and `tsc --noEmit` are clean for this slice. All 69 slice tests pass under `node --import tsx --test` (see Tests).

## Scope (files reviewed)

- Pages/UI: `src/app/folio-society/**` (page, 5 components, `_utils/filter-state*`), `src/app/books/page.tsx`, `src/app/bookcase/**` (layout, page, css, 3 components, 3 utils).
- Convex: `convex/folioSociety.ts`, `folioSocietyBackfill.ts`, `folioSocietyCatalog.ts`, `folioSocietyDetails.ts`, `folioSocietyImages.ts`, `folioSocietyReleases.ts`, `bookSearch.ts`, `s3Helper.ts`, `_utils/folioCatalogFields.ts`, schema tables (`folioSocietyConfig/Releases/Ownership/ProductDetails/Images`, `bookSearch`).
- Also touched by the slice (grepped): `src/pages/api/cron/sync-folio.ts` (Vercel cron calling `syncReleases`), `src/middleware.ts`, `src/components/ImageGallery.tsx` (dead), `src/lib/hooks/use-debounced-state.ts`, `src/lib/email.tsx` (consumer of SyncResult), `components.json`, `next.config.js`, `vitest.config.ts`.
- Tests: `convex/folioSociety{Backfill,Catalog,Releases}-source.test.ts`, `convex/schema.folio-catalog-source.test.ts`, `convex/_utils/folioCatalogFields.test.ts`, `src/app/folio-society/_utils/filter-state.test.ts`, `_components/folio-{book-card,catalog-page}-source.test.ts`.
- The bookcase page makes no Convex calls (localStorage only). `src/lib/` is not used by the slice.
- Dependency on the no-op `requireAuth` (pre-existing, not re-litigated): every public function here is callable by anyone who has the Convex URL. See E2.

## Summary table

| AGENTS.md section | Status | # findings |
|---|---|---|
| Stack table | Partial: Radix not Base UI, `date-fns` not installed, Pages Router cron route | 6 |
| UI (shadcn) | Violations: raw `<button>`, `<img>`, `<input type=range>`, ad-hoc controls | 8 |
| React effects | Violations (catalog page worst) | 9 |
| Forms | Violations (books page partial, settings sheet none, bookcase none) | 4 |
| Dark mode | Violations: hardcoded stone/teal/hex everywhere | 3 |
| Toasts | Mostly OK; missing error/success feedback in places | 4 |
| Env | OK (convex `process.env` is the allowed exception; typed-env note) | 1 |
| Auth | Depends entirely on no-op `requireAuth`; public actions with side effects | 3 |
| Convex | Heavy drift: 27 of 38 registered functions lack `returns`; unbounded `.collect()`; public-should-be-internal; `.filter`; action->action | 18 |
| Tests | Mix of meaningful logic tests and brittle source-text tests; vitest config excludes all of them | 5 |
| Code style | Minor | 5 |

## Errors & risks (ranked)

**E1. Unbounded `.collect()` on growing tables in a hot path (deploy/perf risk, High).**
- `convex/folioSocietyDetails.ts:56-61` `getAllDetails` collects every `folioSocietyProductDetails` row, including the `raw: v.any()` full catalog payload, and returns it to an action.
- `convex/folioSocietyReleases.ts:139-145` `getAllReleases` collects every release.
- `enrichDetails` (`folioSocietyDetails.ts:153-160`) calls both through `ctx.runQuery`. `processAllImages` (`folioSocietyImages.ts:221-224`) calls `getAllDetails`.
- Convex limits: 16 MiB read per transaction and 16 MiB return size. The `raw` payloads make this the first thing to fail as the catalog grows. When it fails, the Settings buttons "Enrich details" and "Process images" break with a generic toast.
- Also unbounded and unused: `getReleases` (`folioSocietyReleases.ts:36-84`, collects the table and sorts in JS), `getStats` (`:97-123`, collect plus `Math.max(...spread)`), `getImagesByProduct` (`folioSocietyImages.ts:50-58`).

**E2. Public, side-effecting actions and mutations with no real auth (security/cost, High).**
- `requireAuth` is a no-op, and the Next middleware only checks that a `session` cookie exists. Anyone with `NEXT_PUBLIC_CONVEX_URL` can call these directly:
  - `folioSocietyReleases.syncReleases`: `startId`/`endId` are client-controlled. `Array.from({length: endId-startId+1})` has no cap (`folioSocietyReleases.ts:243-246`), so it is an outbound-fetch amplifier against foliosociety.com.
  - `folioSocietyImages.processAllImages`, `enrichImages`, `processProductImages`: S3 writes and egress cost. `processAllImages` does not even call `requireAuth`.
  - `folioSocietyDetails.enrichDetails`.
  - `folioSocietyReleases.createRelease`, `updateRelease`, `updateConfig`, `folioSocietyDetails.upsertDetails`, `folioSocietyImages.upsertImage`: arbitrary writes (including `v.any()` fields).
  - `folioSocietyReleases.updateConfig` and `folioSociety.updateConfig` can set `endId` arbitrarily, which feeds the unbounded range above.
  - `bookSearch.deleteSearch`, `bookSearch.create`.
- The Vercel cron route's `CRON_SECRET` check (`src/pages/api/cron/sync-folio.ts:15-20`) is moot because the same action is world-callable.
- Fix: make everything not called from the client `internal*` (see S2), and either accept the existing single-user risk for the 6 client-called functions or add the real validation planned elsewhere.

**E3. Image pipeline can upload error pages to S3 as JPEGs (correctness, High).**
- `fetchImageWithRetry` (`folioSocietyImages.ts:7-27`) retries only 5xx/429 and returns the `Response` for 404/403 without throwing.
- `processProductImages` (`:~470-495`) logs `response.status` but only skips when `content.length === 0`. A non-empty 404 HTML body is therefore hashed and uploaded to S3 as `images/<hash>.jpg` with `image/jpeg`, then saved as a `blobUrl` for the product. It then dedupes globally by hash, so every later 404 reuses the same bad blob.
- Fix: `if (!response.ok) continue/throw` before hashing. Also derive the content type and extension from the response instead of hardcoding `.jpg`/`image/jpeg`.

**E4. Hero image type is likely overwritten by gallery (correctness, Medium; confirmed by code, not by data).**
- `pickHeroImage` (`folioSocietyDetails.ts:~257-272`) returns the "base" media image, and `galleryImages` is built from the same `media` array (`:~410-412`), so the hero URL is also in the gallery.
- `enrichImages` queues `hero` first, then `gallery`. `processProductImages` finds an existing `(productId, originalFilename)` row for the gallery entry and calls `upsertImage`, which patches `imageType: "gallery"` (`folioSocietyImages.ts:~358-369`).
- `resolveHeroImageUrl` (`folioSocietyCatalog.ts:~392-401`) then finds no `hero` row and falls back to the Folio CDN URL. This defeats the S3 mirror for hero covers.
- Fix: exclude the hero filename from the gallery list, or make `upsertImage` never downgrade `hero`.

**E5. N+1 and action->action chains (perf/limits, Medium).**
- `processAllImages` runs a `runQuery(getActiveImagesByProduct)` per details row (`folioSocietyImages.ts:~228-240`), then `runAction(enrichImages)`, which `runAction`s `processProductImages`. Guidelines: only call an action from an action to cross runtimes. All three are in the default runtime, so this should be plain helper functions.
- `syncReleases` makes 3 function calls per product (`getReleaseByExternalId`, `updateRelease`/`createRelease`, `applyCatalogFields`) for about 170+ products, sequentially, through public `api.*` references.
- The `maxConcurrent` arg is accepted by `processAllImages` and `syncReleases` but never used, and `detailsTtlHours`/`maxConcurrent` passed by the cron route are ignored. The `batchSize` and `limit` args are unvalidated.

**E6. `listCatalogPage` is a very expensive reactive query (perf, Medium).**
- `walkIndexedSeasons` (`folioSocietyCatalog.ts:~1065-1135`) loops up to `INDEX_LOOPS = 12` times, each reading up to 80 + 2x200 release docs. The worst case is thousands of full docs per page, and each doc includes `visibility: v.any()`. Every release write (sync, backfill, `applyCatalogFields`) invalidates the subscribed page.
- The search path fetches 64 docs (`SEARCH_CAP`).
- The owned/want path does one `by_external_id` lookup per owned row, capped at 200 per status. Rows beyond the cap are silently dropped (`exhausted=false`, but the UI header count then reads an estimate).
- Mitigated by `pageSize` 1 and by stopping at 4 distinct seasons. Suggest moving the heavy `visibility`/denormalised fields out of the hot doc, or caching season boundaries.

**E7. Search post-filter defeats the search index (correctness, Medium).**
- `loadSearchCandidates` uses `search_title_author`, but `matchesRemainingFilters` then requires `hay.includes(needle)` (`matchesSearch`, `folioSocietyCatalog.ts:~668-676`), where `hay` is `"<name> <author>"`. A multi-word query in a different order ("king carrie" for "Carrie ... Stephen King") passes the index and is dropped by the substring check. Drop the substring check for search mode, or tokenise.

**E8. Backfill concurrency and stuck state (Medium/Low).**
- `startStoredCatalogBackfill`/`startFolioCatalogBackfill` (`folioSocietyBackfill.ts:71-86`) do not check `backfillStatus === "running"`, so only the UI hides the button. Two chains double-count `catalogIndexedBookCount`.
- `applyCatalogFields` treats `backfillStatus === "running"` as "not previously indexed" (`rebuilding`, `folioSocietyCatalog.ts:~75-81`). A crash that never reaches `markBackfillError` leaves "running" forever (UI then shows "Dates filling in" with no button) and every sync inflates the counters.
- `startFolioCatalogBackfill` and `startStoredCatalogBackfill` are duplicates; only the former is used.

**E9. Data-integrity nits (Low).**
- `bookSearch.create` accepts blank title/author and saves a `""`-keyed row (`bookSearch.ts:16-62`); the client does not validate.
- `bookSearch.create` returns either the old doc (stale fields) or a bare `Id` (`:42, :48`).
- `folioSocietyImages.isActive` is never set to `false` anywhere, so `isActive` filtering is dead. The same holds for `folioSocietyReleases.isActive` (only `true` writes in `syncReleases`), which is why the "does not deactivate" test exists. The `.filter(isActive)` in `getActiveImagesByProduct` is therefore a no-op scan too.
- `upsertDetails` skips `undefined` fields (`:~101-107`), so a field that disappears upstream is never cleared.
- Query reads the wall clock: `folioSociety.getConfig` falls back to `Date.now()` (`folioSociety.ts:19`), against the guideline for queries.
- `folioSociety.getConfig` returns doc-or-synthetic-object, which forces the client hack `"backfillStatus" in config` (`folio-settings-sheet.tsx:~49`).
- `useBookcaseConfig` (`use-bookcase-config.ts:~17-39`): the persist effect runs on mount with `DEFAULT_CONFIG` before the restore state update lands, briefly overwriting the saved config. Stored values are spread unchecked, so `"false"` -> `Boolean("false") === true` in `clampConfig`.
- `s3Helper.ts` has `// @ts-ignore` x5 and four `biome-ignore ... <explanation>` placeholders. It hand-rolls SigV4 and reads `process.env.* !` without checking.
- `src/components/ImageGallery.tsx` is dead.
- `docs/image-architecture.md` describes a Convex-storage design; the code uses S3/CloudFront.

## Convention drift by AGENTS.md section

### Stack table
- UI is on Radix, not Base UI. `components.json` has no base setting; `src/components/ui/sheet.tsx:4` imports `radix-ui`; `checkbox.tsx:3` imports `@radix-ui/react-checkbox`. `package.json` carries both `radix-ui` and `@base-ui/react`. Slice code relies on Radix APIs: `SheetTrigger asChild` (`folio-settings-sheet.tsx:125`), `Button asChild` x4 (`books/page.tsx:271-301`). Migrating to Base UI would make those `render=` props. AGENTS.md describes a state that is not true yet.
- Dates: `date-fns` is not in `package.json`, and nothing in the slice uses it. `folio-book-card.tsx:371` uses `toLocaleDateString`; `folioSocietyCatalog.ts` uses `toLocaleString`/`toISOString`/`Date.UTC` (acceptable in Convex).
- Cron route is Pages Router: `src/pages/api/cron/sync-folio.ts` (Stack says "Not Pages Router"; "API routes are for external integrations only" is satisfied by Vercel Cron). It also duplicates what a Convex `crons.ts` entry could do; email would stay in Next/Resend.
- Forms: TanStack Form is used only in `books/page.tsx`. Zod is installed but unused in the slice.
- Icons (lucide) and toasts (sonner) are correct. No tRPC use. No `process.env` in `src/` for this slice.

### UI (shadcn)
- Raw `<button>` instead of `Button`: `folio-book-card.tsx:60,118,135,188,217,274,290`; `bookcase-controls.tsx:37,175,228,240,309`; `bookcase-designer.tsx:305`.
- Raw `<img>` instead of `next/image`: `folio-book-card.tsx:74,201,229`. `next.config.js` `remotePatterns` only has Spotify hosts, so the Folio and CloudFront CDN hosts would need adding.
- Raw `<input type="range">` (`bookcase-controls.tsx:281`) even though `ui/slider.tsx` exists. A raw toggle built from `<button>` + spans (`ToggleRow`, `:297-336`) needs the shadcn `Switch`.
- Raw `<label>` (`folio-filters.tsx:43,118`, `bookcase-controls.tsx:272`) should be `Label`. Raw `<a>` styled as links (`folio-book-card.tsx:308`) is acceptable (links).
- `ui/field.tsx` (shadcn `Field`) does not exist (only `field-group.tsx`). AGENTS requires `Field` for forms. Add it with `shadcn add field`.
- Drawer-over-Dialog: the settings surface is a `Sheet` (`folio-settings-sheet.tsx`), not a Drawer. The filters panel (`folio-catalog-page.tsx`) is also a `Sheet`. AGENTS says nothing about `Sheet`; clarify.
- `FolioBookDetail` is a custom bordered panel (`folio-book-card.tsx:~180`); candidate for `Card`.
- Raw `<table>`/`<select>`: none.

### React effects
`folio-catalog-page.tsx`:
- `:88-90` copies `filters.search` into `searchInput` state. Derive, or key the input.
- `:92-104` URL sync effect calling `router.replace` on every debounced change. Move it to the change handler.
- `:106-112` (with `biome-ignore`) resets cursor/seasons/`now` on `filterKey`. AGENTS says use `key`. Wrap the paged list in a child keyed by `filterKey`; this also removes a wasted extra query with stale cursor and new filters between filter change and effect.
- `:128-143` accumulates pages into state in an effect (guarded by `appliedCursorRef`). This duplicates what `usePaginatedQuery` does. Earlier pages become a frozen non-reactive copy, so cross-device ownership changes are not reflected. A custom cursor API prevents `usePaginatedQuery`, but pages could be rendered as stacked per-page components, each with its own `useQuery`.
- `:155-168` IntersectionObserver is legitimate (outside system). It needs the one-line comment. Likewise `folio-season-section.tsx:49` (window keydown) needs the comment.
- `folio-settings-sheet.tsx:39-45` syncs `config` into input state. Use a form with `defaultValues` plus `key`.
- `bookcase-designer.tsx:60` `matchMedia` in an effect (browser API, legitimate, but `useSyncExternalStore` or CSS avoids the flash); `:64,77,92` ResizeObserver/wheel/keydown are legitimate and need the comment. The global keydown handler does not ignore events from inputs (`0`, `+`, `-` are hijacked).
- `use-bookcase-config.ts:~17-39` localStorage load/persist effects: legitimate but racy (see E9); `useSyncExternalStore` fits better.
- `use-debounced-state.ts` is a legitimate timer effect.
- Data fetching: all via Convex hooks, no fetch in effects.

### Forms
- `books/page.tsx:129-151` uses TanStack Form but with no Zod schema, no validators, no shadcn `Field`, and no error display. The `FormValues` type is hand-written. The fire-and-forget `queueMicrotask(() => saveMutation(...))` (`:147`) has no `await`, `try/catch`, or toast, so a rejected mutation is an unhandled rejection. The 480 ms fake spinner uses `setTimeout` with no cleanup (`:149, 348`). The Delete button (`:359-361`) also has no error handling. Reuse one Zod schema for the form and the `bookSearch.create` validators (e.g. trim and `min(1)` on title or author, ISBN regex).
- `folio-settings-sheet.tsx:31-35,138-168` ID range uses `useState` string inputs, save-on-blur, and a manual `Number.parseInt` with silent return on NaN. The server error "Start ID must be less than end ID" is swallowed into a generic toast ("Couldn't update range."). Needs TanStack Form plus Zod (`startId < endId`, ints).
- `folio-filters.tsx:50-57` and `folio-catalog-page.tsx:73` live search as `useState`/URL-driven input. This is a live filter, not a submit form, so arguably exempt. AGENTS says "search boxes that submit"; state the live-filter exception explicitly.
- Bookcase sliders and steppers are controlled inputs bound to local config (not submit forms). Exempt, but the persisted config should be parsed with Zod.

### Dark mode
- Hardcoded palette instead of semantic tokens: `folio-book-card.tsx` (34 occurrences of `stone-*`, `teal-*`, `bg-[#f2efe8]`, `bg-[#f7f4ee]`, `bg-[#ebe7df]`, `bg-white` at `:~219`), `folio-filters.tsx:121,132` (`hover:bg-stone-100/70`, `border-stone-400/60`, `teal-800`), `folio-season-section.tsx` (`stone-*`, gradient). Cream panels will look wrong in dark mode.
- Bookcase: 52 hardcoded hex colors across `bookcase.css`, `bookcase-*.tsx`. This is an intentionally themed "drafting paper" canvas, not dark-mode aware. If kept, document an AGENTS exception ("themed canvases may use fixed palettes") or scope the palette to CSS variables with a `.dark` variant.
- `books/page.tsx` uses semantic tokens only (compliant).

### Toasts
- Mount and `sonner` use are fine. Gaps: `handleEnrich` and `handleProcessImages` give no success toast or result summary; `handleStartBackfill` failure toast says "Sync failed." (wrong message); the book save/delete flows have none; `handleSaveRange` swallows validation silently. The `toast.error("Couldn’t save.")` for ownership is fine.

### Env
- Compliant. `convex/s3Helper.ts` reads `process.env` (allowed in `convex/`). The non-null `!` reads give an unclear failure when a var is missing. Convex 1.41+ supports typed env via `convex.config.ts` (`defineApp({ env })`), which the guidelines now recommend.

### Auth
- Every function calls `requireAuth(ctx)` (no-op), except `processAllImages`, `processProductImages` (has it), `applyCatalogFields` and the internal ones. See E2. `FOLIO_OWNER_USER_ID = "folio-owner"` is a hardcoded single-user constant in `folioSocietyCatalog.ts:23`; consistent with "single-user" but not a derived identity.
- Middleware: `src/middleware.ts` matcher covers `/books`, `/folio-society`; `/bookcase` is not covered. It makes no data calls, so it is fine, but it is inconsistent with the other personal pages.

### Convex
Checked against `convex/_generated/ai/guidelines.md` and convex-expert rules.
- Object form, `./_generated/server` imports, `internal`/`api` imports: all correct. No `"use node"` anywhere in the slice (correct: only `fetch`/`crypto.subtle`). `v.id` is used where appropriate (`deleteSearch`, `updateRelease`); `productId: v.number()` is an external numeric id by design.
- `returns` validators: only 11 of 38 registered functions have them (all of `folioSocietyBackfill.ts`, `folioSocietyCatalog.ts`, and `getReleaseByExternalId`). Missing in `folioSociety.ts` (2), `bookSearch.ts` (3), `folioSocietyDetails.ts` (4), `folioSocietyImages.ts` (9), `folioSocietyReleases.ts` (9). Return `null` instead of `undefined` (`updateRelease`, `updateConfig` in Releases return `undefined`).
- Unbounded `.collect()`: `folioSocietyDetails.ts:60`, `folioSocietyImages.ts:57,70`, `folioSocietyReleases.ts:56,102,144`.
- `.filter()` instead of index: `folioSocietyImages.ts:69` (`.filter(isActive)`). Add `by_productId_isActive` or filter by `isActive` in the index.
- Public vs internal: functions called only from other Convex code and registered public with `api.*`: `createRelease`, `updateRelease`, `updateConfig` (Releases), `getConfig` (Releases), `getAllReleases`, `getAllDetails`, `upsertDetails`, `upsertImage`, `getImageByHash`, `getImageByProductAndOriginalFilename`, `getDetailsByProductId`, `getActiveImagesByProduct` (also client-called), `enrichImages`, `processProductImages`. Convert to `internal*` and call via `internal.*`.
- Dead public functions (no callers anywhere in `src`, `convex`, `scripts`): `getReleases`, `getRelease`, `getStats`, `getFamilyByTitleKey`, `getImagesByProduct`, `getImageByOriginalFilename`, `startStoredCatalogBackfill`, `folioSociety.getConfig` duplicate of `folioSocietyReleases.getConfig`, `folioSocietyReleases.updateConfig` (taking client `updatedAt`) vs `folioSociety.updateConfig`. Delete.
- Action -> action: `processAllImages` -> `enrichImages` -> `processProductImages`. Replace with shared helper functions.
- Mutations cannot fetch: respected (`fetch` is only in actions).
- Wall clock in queries: `folioSociety.getConfig:19`; `listCatalogPage` correctly takes `now` as an arg (but the client then only refreshes it on filter change, so a long-open tab keeps a stale `now`).
- Index naming: `by_external_id`, `by_firstSeenAt`, `by_isActive`, `by_titleKey`, `by_isActive_isBundle_seasonSortKey` etc. Mixed styles. The convex rule `by_field1_and_field2` is not followed (`by_isActive_isBundle_seasonSortKey` lacks `_and_`; `by_user_product`, `by_user_status` do not match fields `userId`). Cosmetic; renaming requires re-index. `by_createdAt` (bookSearch) and `by_firstSeenAt`, `by_lastSeenAt`, `by_isActive`, `by_fetchStatus`, `by_lastFetchedAt`, `by_slug` have no readers in the slice: unused indexes cost write amplification (`folioSocietyReleases` has 8 indexes + a search index).
- Schema evolution: new fields are `v.optional` (good). `visibility`, `raw`, `metadata` use `v.any()`; `backfillStatus` and `fetchStatus` are `v.string()` where `v.union(v.literal(...))` fits (`'ok'|'error'|'stale'` is even documented in a comment). `folioSocietyImages.blobUrl` stores a CDN URL string (S3, not Convex storage), so the "never store storage URLs" rule does not apply.
- Unbounded arrays: `folioSocietyProductDetails.galleryImages`/`authorIds` are small and bounded in practice.
- Pagination/bounds elsewhere: `.take(n)` is used correctly in catalog code (`take(20)`, `take(32)`, caps). `ctx.db.query("folioSocietyConfig").first()` as a singleton read is fine.
- Bounded-read gap: `setOwnership` `.take(20)` plus delete extras is fine.
- Self-verify: `tsc` clean; I did not run `convex dev --once`.

### Tests
- `vitest.config.ts` includes only `convex/launch-*.test.ts`, so nothing in this slice runs under `pnpm exec vitest run`. AGENTS says "new tests use Vitest", but the whole slice is `node:test` (8 files, 69 tests, all passing with `node --import tsx --test ...`).
- AGENTS's `node --test path/to/file.test.ts` fails on Node v22.14.0 here (`ERR_UNKNOWN_FILE_EXTENSION`); it needs tsx or Node >= 22.18. No `test` script exists in `package.json`, no CI workflow dir.
- Meaningful (behavioral): `filter-state.test.ts` (parse/serialize round-trips), `convex/_utils/folioCatalogFields.test.ts` (edition/title-key/season logic), and the pure-function parts of `folioSocietyCatalog-source.test.ts` (`seasonLabelFromKeys`, `pageCompleteSeasons`, `omitCappedTailSeason`, `releaseSectionLabel`, `comingPathExhausted`) which dynamically import and call real exports.
- Brittle (source-text regex, assert on file contents): `folio-book-card-source.test.ts` (e.g. asserts the string `cursor-pointer` exists, asserts a `className` matches a block-level regex, `doesNotMatch(/pr-9/)`), `folio-catalog-page-source.test.ts` (asserts `appliedCursorRef.current === ` and `pageSizeSeasons: 1` literally), `folioSocietyBackfill-source.test.ts`, `folioSocietyReleases-source.test.ts` (e.g. `/ids\.length <= 50|50/` is satisfied by any "50"), `schema.folio-catalog-source.test.ts`, and the source-assertion half of `folioSocietyCatalog-source.test.ts`. They pin implementation text, break on harmless refactors, and several enforce the effect-based accumulation that AGENTS discourages. The "does not call getAllReleases" tests are useful guardrails but would be better as `convex-test` runs.
- No tests for: `bookSearch` normalise/dedupe, `listCatalogPage` end-to-end (convex-test with edge-runtime exists in the repo for launch), `setOwnership`, image pipeline (including E3), bookcase `geometry.ts` (pure, in `_utils/` rather than `src/lib/`, no test), `contents.ts` RNG determinism.
- Bug workflow (CLAUDE.md): E3, E4, E7 each need a failing test first.

### Code style
- Helpers before the main exported component: `books/page.tsx` (`buildAbeBooksUrl`..., `SearchResultSkeleton` at `:28-118`, component at `:120`). Move helpers to `books/_utils/` (also gives them tests).
- Default exports without explicit return types: `FolioSocietyPage`, `BooksPage`, `BookcasePage`.
- Exported non-component helper `formatPriceDate` in `folio-book-card.tsx:~337` is unused. `FolioCatalogCard`/`CatalogPage`/`CatalogSeason` types duplicate the Convex validators (`catalogCardValidator`); derive with `FunctionReturnType<typeof api...>` and drop the casts (`folio-catalog-page.tsx:126`, `folio-season-section.tsx:103`).
- `className={`...${cond ? ...}`}` template literals instead of `cn()`: `books/page.tsx:269`, `bookcase-controls.tsx:324-331`, `bookcase/layout.tsx`.
- `"use client"` on `bookcase/page.tsx` and `folio-society/page.tsx` is unnecessary for `page.tsx` shells (the page can stay a server component).
- Heavy emoji `console.log` noise (about 150 lines) across `folioSocietyDetails/Images/Releases.ts`; dead `if (!config)` after `||` fallback (`folioSocietyReleases.ts:~232-243`); `type`-alias and tab/`function` style are otherwise compliant. `h-[calc(100vh-3.5rem)]` in `bookcase-designer.tsx:160` hardcodes the nav height and should use `dvh`/flex.

## Suggested changes (ranked)

| # | Change | Effort |
|---|---|---|
| 1 | E3: check `response.ok` before hash/upload in `processProductImages`; derive content type; add a test with a stubbed 404 | S |
| 2 | E1: replace `getAllDetails`/`getAllReleases` use in `enrichDetails` and `processAllImages` with paginated internal queries (or scheduled self-continuing internal action, like `folioSocietyBackfill.runBatch`); strip `raw` from reads | M |
| 3 | E2/Convex: convert helper mutations/queries/actions listed above to `internal*`; keep only client-called ones public (`listCatalogPage`, `setOwnership`, `getConfig`, `updateConfig`, `startFolioCatalogBackfill`, `syncReleases`, `enrichDetails`, `processAllImages`, `getActiveImagesByProduct`, `bookSearch.*`); cap `startId`/`endId` span in `syncReleases`/`updateConfig` | M |
| 4 | Delete dead code: `getReleases`, `getRelease`, `getStats`, `getFamilyByTitleKey`, `getImagesByProduct`, `getImageByOriginalFilename`, duplicate `getConfig`/`updateConfig`/`startStoredCatalogBackfill`, `ImageGallery.tsx`, `formatPriceDate` | S |
| 5 | Add `returns` validators to the 27 functions lacking them (this also removes the `"backfillStatus" in config` hack and the casts) | M |
| 6 | E4: stop `upsertImage` downgrading `hero`; exclude hero from gallery | S |
| 7 | Replace action->action chain with shared helpers; N+1 `getActiveImagesByProduct` with one query per batch; implement or remove `maxConcurrent` | M |
| 8 | E7: remove `hay.includes` post-filter in search mode | S |
| 9 | E8: guard `beginStoredCatalogBackfill` against `running`; add stale-run timeout/reset | S |
| 10 | Fix `getActiveImagesByProduct` (`.filter` + `.collect()`) with an index (`by_productId_isActive`) and `.take(n)` | S |
| 11 | Effects cleanup in `folio-catalog-page.tsx` (key-reset, handler-based URL sync, derived search input); comment legit effects | M |
| 12 | Forms: Zod schema plus TanStack `Field` for books page and settings ID range; handle save/delete errors with toasts; trim/require title or author server-side | M |
| 13 | UI: replace raw `<button>`/`<input range>`/toggle with `Button`/`Slider`/`Switch` (`shadcn add field switch`); `next/image` plus Folio CDN `remotePatterns` | M |
| 14 | Dark mode: map folio stone/teal/cream palette to semantic tokens (or define CSS variables with `.dark` values); decide bookcase exception | M |
| 15 | Move the Folio sync into `convex/crons.ts` + internal action (keep Resend email via an HTTP call or Next route), or move the cron route to App Router `route.ts` | M |
| 16 | Tests: wire node:test into a script/CI or convert the pure ones to Vitest; replace regex source tests with convex-test (`listCatalogPage`, `setOwnership`, image upsert, `bookSearch`); add `geometry.ts` tests | M |
| 17 | `listCatalogPage` cost: slim hot documents (drop `visibility` from releases, which is `v.any()`), reduce loop caps, or precompute season index | L |
| 18 | Remove emoji log noise, `@ts-ignore`/`biome-ignore <explanation>` in `s3Helper.ts`; typed env via `convex.config.ts` | S |
| 19 | Index cleanup (unused `by_createdAt`, `by_firstSeenAt`, `by_lastSeenAt`, `by_isActive`, `by_fetchStatus`, `by_lastFetchedAt`, `by_slug`); rename to `by_*_and_*` | S/M |
| 20 | Style: helper ordering in `books/page.tsx`, return types on default exports, `cn()` for conditional classes, derive types from Convex | S |

## AGENTS.md corrections

1. Stack row "UI components: shadcn/ui on **Base UI** (not Radix)" is not true: `src/components/ui/*` is Radix (`radix-ui`, `@radix-ui/react-*`) and `components.json` has no Base UI style. Either state "currently Radix; migrating" or finish the migration (`migrate-radix-to-base` skill exists). Slice code uses Radix-only props (`asChild`).
2. "Dates: date-fns": the package is not installed. Add it to `package.json` or relax the rule.
3. "Forms ... shadcn `Field`": `src/components/ui/field.tsx` does not exist. Add it or document `field-group`.
4. "Tests: Vitest; `pnpm exec vitest run`": `vitest.config.ts` includes only `convex/launch-*.test.ts`. Document that and the real command for node:test files (`node --import tsx --test <file>`, since `node --test` fails on Node 22.14 for `.ts`). Add a `test` script.
5. "Reads are always bounded" and "Every registered function has args and returns": codify with a short "legacy exceptions" list, because `folioSociety*` and `bookSearch` do not meet it today (27 of 38 lack returns; 6 unbounded collects).
6. Add a rule for Convex-only helpers: "functions called only from other Convex functions are `internal*`". The current rule says it only for "actions are only for external APIs".
7. "Auth: `requireAuth` ..." should state plainly that `requireAuth` is a no-op and that public functions are therefore reachable by anyone with the Convex URL, so a function's blast radius is its public surface. This drives rule 6.
8. Dark-mode rule needs an exception for self-contained themed canvases (bookcase designer, possibly Folio's "paper" look), or the Folio components need migrating.
9. Clarify `Sheet` vs `Drawer`: settings/filters panels here use `Sheet`; the "Drawer over Dialog" rule is silent on `Sheet`.
10. Clarify that the live search/filter inputs (URL-driven) are not "forms" under the TanStack Form rule.
11. Layout says feature pages put pure logic in `_utils/` but Tests says pure logic goes in `src/lib/` with colocated tests; the bookcase `geometry.ts` sits in `_utils/` untested. Pick one rule.
12. Stack says "Not Pages Router" but `src/pages/api/cron/*` exists; note that Pages API routes are legacy and where new cron work belongs.

# Audit: `albums` slice vs AGENTS.md

Date: 2026-10-07. Read-only audit; no source edited. Verification run: `npx tsc --noEmit` (0 errors in slice), `npx biome check` on slice (34 errors, 1 warning), `npx tsx --test` on slice node:test files (153/154 pass).

## Scope (files reviewed)

- Pages/UI: `src/app/albums/**` (layout, 8 route pages, `_context/albums-context.tsx`, 17 `_components/*`, `details/[albumId]/**`, `_utils/*`), plus shared `src/components/{album-rating-drawer,sync-albums-button}.tsx`.
- Convex (full read): `convex/spotify.ts` (4151 lines, 77 registered fns), `convex/spotifyPlayEvents.ts`, `convex/spotifyListenRepair.ts`, `convex/albumDuels.ts`; helpers `convex/_utils/{upsertSpotifyAlbumRecord,manualAlbum,albumListenDenormalized,albumLibraryIndexedList,duelElo,rankingWeek}.ts`.
- Convex fns referenced by albums pages (only the referenced fns reviewed): `albumEnrichment.getAlbumDetails`, `albumEnrichmentTrials.{listTrialsForAlbum,setTrialVerdict,promoteTrial}`, `rankingSnapshots.getCompleteWeek`, `rateYourMusicScrapes.backfillRymScrapeSpotifyAlbumMatches`, `forLaterAlbums.{getForLaterUiSummary,listForLaterAlbumRows,searchUnmappedRymScrapes}`.
- API/lib: `src/app/api/spotify/{album/[albumId],sync-history,refresh-token}`, `src/pages/api/cron/sync-spotify.ts`, `src/app/api/auth/{route,status/route}.ts`, `src/middleware.ts`, `src/lib/{spotify-sync,duel-*,ranking-*,album-*}.ts`, `src/lib/hooks/{use-spotify-auth,use-auth-token,use-sync-history,use-album-rating-drawer,use-debounced-state}`.
- Tests: 18 `convex/*-source.test.ts`/`*.source.test.ts`, `src/app/albums/_components/*.test.ts`, `src/lib/{album-detection,duel-*,ranking-*,spotify-listen-repair,...}.test.ts`, `convex/_utils/album*.test.ts`.

Pre-existing, not re-litigated: `requireAuth` (convex/auth.ts:5) is a no-op. Dependency noted per finding below: every slice function authorizes by client-supplied `userId` arg only.

## Summary

| AGENTS.md section | Status | # findings |
|---|---|---|
| Stack table | Drift | 7 |
| UI (shadcn on Base UI) | Non-conformant | 6 |
| React effects | Non-conformant | 4 |
| Forms | Non-conformant | 2 |
| Dark mode | Partial | 2 |
| Toasts | Conformant | 0 |
| Env | Conformant (see AGENTS note) | 1 |
| Auth | Non-conformant / depends on no-op | 5 |
| Convex | Non-conformant | 14 |
| Tests | Non-conformant | 5 |
| Code style | Mostly conformant | 5 |

## Errors & risks (ranked)

**E1. Spotify access + refresh tokens are readable by anyone via public Convex queries (security, high).** `spotify.getConnection` (convex/spotify.ts:651) returns the whole `spotifyConnections` doc (accessToken, refreshToken) for any `userId`; `getAllConnections` (:1608, no callers) returns every row. The albums layout reads it in the browser (`src/lib/hooks/use-spotify-auth.ts:35`, used by `albums-context.tsx:98`). Depends on `requireAuth` no-op (no auth call at all here). Fix: make token read/write `internalQuery/internalMutation`, expose only `{ isConnected, displayName }` publicly, and fetch Spotify tokens server-side (action or route).

**E2. `/api/spotify/*` routes and `/albums` are not covered by middleware; session cookie is unsigned (security, high).** `src/middleware.ts` matcher omits `/albums`, `/api/spotify/*`. `POST /api/spotify/refresh-token` (route.ts) takes `{userId}` from the body and returns the user's Spotify access token with no cookie check; `sync-history` and `album/[albumId]` trust an `X-Access-Token` header (a *Spotify* token, not the session token AGENTS describes). Session cookie is `base64url("user:ts")` (src/app/api/auth/route.ts:19) and `/api/auth/status` only decodes it; `SESSION_SECRET` is declared in `src/env.js` but never used, so the cookie is forgeable. Fix: sign session cookies (HMAC with `SESSION_SECRET`), add `/albums` and `/api/spotify` to middleware, derive `userId` server-side, never from body.

**E3. Whole-table reads on every albums page load (perf/cost, high).**
- `getUserAlbums` (spotify.ts:3220): unbounded `.collect()` on `userAlbums` + per-row `ctx.db.get(album)` (N+1). Subscribed in the layout context (`albums-context.tsx:137`), so it runs on every `/albums/*` page and re-reads everything on any listen/rating write. Returns full `spotifyAlbums` docs, including `rawData` (JSON of the full Spotify album) which sync now writes (`spotify-sync.ts:~262 rawData: JSON.stringify(spotifyAlbum)`; `upsertSpotifyAlbumRecord.ts:38`). That ships tens of KB per album to the browser and risks the 16 MB read limit. Fix: project needed fields (`name, artistName, imageUrl, releaseDate`) or read `albumLibraryItems`; paginate/bound; stop storing `rawData` (schema comment and `clearLegacyAlbumRawData` show it was meant to be removed).
- `getRatedAlbumsForYear` (:4078): collects all userAlbums then `get` each, subscribed unconditionally by `useAlbumRatingDrawer` in the layout even when the drawer is closed (`use-album-rating-drawer.ts:24`). Use an index on `(userId, hasRating/releaseYear)` or the library projection and subscribe only when the drawer is open.
- `getRecentlyPlayedTracks` (:1263): `.order("desc").collect()` on `by_userId_lastPlayedAt` then JS filter/slice to `limit`. Should be `.take(limit)` (undefined sorts last in desc).
- `listAlbumLibraryReleaseYears` (:3060): collects every `albumLibraryItems` row (wide docs with genre arrays) just to build a distinct-year set; runs on the Library page. Use convex-helpers `stream(...).distinct`/skip-scan or a small `libraryYears` table.
- `albumDuels` `loadRatedAlbumsForYear`/`loadScoreMap`/`listScores` (albumDuels.ts:80,106,436): unbounded `.collect()` on `userAlbums`/`albumDuelScores` with N+1 gets; `listScores` is subscribed by the duel arena (`rankings-duel-arena.tsx:62`).
- `getForLaterUiSummary` (forLaterAlbums.ts:1319-1329): two `.collect()` of `albumLibraryItems` just to take `.length` (explicitly banned by Convex guidelines).
- `listAlbumLibraryRows` (:2697, no callers): collects entire `spotifyAlbums` and entire `rateYourMusicSpotifyAlbumLinks` tables; dead code that would blow limits if called.

**E4. Public one-off/debug/admin Convex functions in the production API (security/deploy-risk, med).** 0 of 77 fns in spotify.ts are `internal*`. Public and destructive/unscoped: `clearLegacy*` (5 mutations, :94-495, only called from `scripts/clear-legacy-rawdata.sh`), `backfillCanonicalTrackArtistIds` action (:2215, no callers; uses `api.*` instead of `internal.*`, reads Spotify tokens), `debugTrackUserIds` (:4126, unbounded collect of `userTracks`, no callers), `getAllCanonicalTracks` (:2090), `getPendingSyncLogs` (:1531, collects rows holding large `rawResponse`), `setBackfillProgress`, `upsertCanonicalTrack`, `bulkUpdateCanonicalTrackArtists`, `deleteConnection`, `updateTokens`, `upsertConnection`. `spotifyPlayEvents.upsertPlayEvents` is public and only called server-side from `spotify-sync.ts:155`. Fix: convert to internal (call via `ConvexHttpClient` is not possible for internal; use an authenticated action or admin key) or delete the dead ones.

**E5. Client-driven backfill loops in the production page (deploy/ops risk, med).** `all-albums-view.tsx:290-420` loops `backfillAlbumLibraryItems`, `backfillSpotifyAlbumTitleKeys`, `backfillAlbumLibraryReleaseYearSortKey`, `backfillRymScrapeSpotifyAlbumMatches` from the browser, each a public mutation. Move to `@convex-dev/migrations` / internal mutations run from CLI; remove the UI.

**E6. `recordAlbumListen` does not maintain `firstListenedAt` / max `lastListenedAt` (correctness, med).** spotify.ts:3151-3155 sets `lastListenedAt = args.latestPlayedAt` unconditionally and never touches `firstListenedAt`. Sync detects sessions from a 24h ledger lookback (`spotify-sync.ts:LOOKBACK_WINDOW_MS`), so an older session discovered later regresses `lastListenedAt` and leaves `firstListenedAt` too late, which then mis-sets `isFirstListen` in `syncListenFilterFieldsForUserAlbum`. The sibling writers `recordManualListenForAlbum` (manualAlbum.ts:98-107) and `applyRepairCandidates` (spotifyListenRepair.ts:224-234) use min/max. Write a failing test first, then reuse one shared helper.

**E7. `convertAlbumListen` / `deleteAlbumListen` can silently drop a user's rating (correctness, med, verify intent).** When the source album has no remaining listens, `recalcUserAlbumListenStats` (spotify.ts:3551-3555) and `deleteAlbumListen` (:3837-3839) delete the `userAlbums` row, including `rating`/`position`; `convertAlbumListen` does not carry rating to the target. `deleteAlbumListen` derives `newCount = listenCount - 1` (:3836) instead of recounting, and `Math.min(...[])` yields `Infinity` if counts have drifted. Also none of these mutations verify the listen belongs to a user (ids only; relies on E2 + no-op auth).

**E8. Duplicated, drifting logic across Convex and src/lib (maintenance, low-med).** `convex/_utils/duelElo.ts`, `rankingWeek.ts`, `rankingOrdinals.ts` are hand-copied from `src/lib/*` ("Keep in sync" comment). `albumDuels.getPair`/`listDuelTop` (+`pickPair`, ~200 lines) are not used by any UI; the UI pairs client-side via `src/lib/duel-pairing.ts`. AGENTS permits `src/lib` code to be imported by Convex via relative imports; do that and delete the copies/dead server pairing.

**E9. Search pagination over-reads (perf, low-med).** `loadAlbumLibraryRowsPaginated` (spotify.ts:2986-3009) paginates the search index with `numItems = albumLibraryPostFilterScanSize(n)` (up to 1024 rows) even though search filters are applied in the index (`appendAlbumLibrarySearchIndexFilters`), so the "post-filter overscan" is unnecessary and returns up to 1024 wide rows per reactive page. The fallback branch at :3021-3040 is unreachable (`albumLibraryFiltersAllowIndexedScan` is `!search`, and the search branch returns first). `sortBy: "artist"` in search mode only sorts within the returned page, so order is not global.

**E10. Sync pipeline is many sequential round trips, in a Next route, storing unbounded raw JSON (perf/reliability, low-med).** `syncSpotifyHistory` (`src/lib/spotify-sync.ts`) runs one `getTrackByUserAndTrackId` query per unique track (just to count new/updated), one `getAlbumBySpotifyId` per album, one `recordAlbumListen` per session via `ConvexHttpClient`, with no retry; each run stores the full 50-play JSON in `spotifySyncLogs.rawResponse` forever (no prune; `convex-run-stdout.test.ts` documents a 16.6 MB return warning from `spotifyListenRepair.listSyncLogsPage` at `numItems: 5`). `spotifyListenRepair.listExistingListensForUser` (:68) unbounded-collects all of a user's listens (internal, CLI only; acceptable but note).

**E11. Smaller issues.** `getRecentSyncRuns`/`getPendingSyncLogs`/`getLatestRatingTimestamps`/`getAllAlbums`/`getTracksByAlbumId`/`getCategorizationByTrack`/`getCanonicalTrackBySpotifyId`/`upsertCanonicalTrack` have zero callers (dead public API); `updateAlbumRating` (:4003) has no 1-15 range check and logs on every call (`console.log` x4 in file); `searchUnmappedRymScrapes` searches only the latest 500 scrapes (forLaterAlbums.ts:1649); `listSyncLogsPage` cap of 25 can exceed the 16 MB return limit.

**E12. Schema-evolution debt.** `spotifyAlbums.source` ("Temporary optional for prod gate", schema.ts:601) and `userAlbumListens.{isFirstListen,hasRating,releaseYear}` ("Optional until backfill completes", schema.ts:1266) remain optional; `userAlbumListens.source`, `spotifySyncRuns.{source,status}`, `spotifySyncLogs.{syncType,status}` are `v.string()` with the allowed values only in comments, and mirrored as `v.string()` args (spotify.ts:1502,1519,1548-49,3107). Use `v.union(v.literal...)` (one existing source test already fails because the schema no longer matches its regex, see Tests).

## Convention drift by AGENTS.md section

### Stack table
- Radix, not Base UI: `src/components/ui/{button,dialog,alert-dialog,checkbox,dropdown-menu,popover,tabs,sheet,separator,label,select,tooltip,slider}.tsx` import `@radix-ui/*` / `radix-ui`; `components.json` is `"style": "new-york"`; only `ui/combobox.tsx` uses `@base-ui`. Slice uses `asChild` (Radix API) at `details/[albumId]/page.tsx:100`, `album-details-view.tsx:45`, `listen-history-row.tsx:63`, `all-albums-view.tsx:675,1051,1064`. Drawer is vaul (shadcn standard). Change: either migrate (`migrate-radix-to-base` skill) or fix AGENTS.md (see Corrections).
- Forms: no TanStack Form or Zod anywhere in the slice (grep `useForm|@tanstack/react-form|zod` = 0 hits in `src/app/albums`).
- Dates: no `date-fns` in the slice; manual date math and `toLocaleDateString`/`new Date(y, m, d)`/`setMonth` in `add-listen-view.tsx:33-145`, `add-album-to-library-dialog.tsx:47-60`, `_utils/formatters.ts:5-23`, `listen-history-row.tsx:274-276`, `album-card.tsx:51`.
- Pages Router present: `src/pages/api/cron/sync-spotify.ts` (AGENTS: "Not Pages Router"). Convert to an App Router route handler (`GET` with `Authorization: Bearer ${env.CRON_SECRET}`); also use a constant-time compare.
- Env: conforms in `src/` (`~/env`, no `process.env`); Convex `process.env` used at spotify.ts:2278,2296-97 (allowed by AGENTS; `convex/_generated/ai/guidelines.md` now prefers `defineApp({ env })` + `env` from `./_generated/server`, and there is no `convex/convex.config.ts`).
- tRPC: not used by the slice (good). API routes: slice uses `/api/spotify/{album,sync-history,refresh-token}`, which are external-integration shaped, but `sync-history` is a data write path (see E10 and the AGENTS "Actions are only for external APIs" rule).
- Icons: lucide-react only (conformant). Toasts: sonner only (conformant).

### UI rules
- Raw `<button>`: 28 sites: `tracks-view.tsx:119,134`, `album-rym-associate-drawer.tsx:99,145`, `listen-history-row.tsx:422,453`, `add-listen-view.tsx:332`, `rankings-duel-arena.tsx:407`, `listens-filters.tsx:47,111`, `rankings-filters.tsx:69,104`, `all-albums-view.tsx:879,890,939,952,969,1027`, `album-ranker.tsx:441,448`, `convert-listen-drawer.tsx:181,189,213`, `library-filters.tsx:158,212`. Replace with `Button` (variants), `ToggleGroup`/`Tabs` for segmented controls.
- Raw `<select>`: `rankings-filters.tsx:39`, `library-filters.tsx:84` (use shadcn `Select`; `ui/select.tsx` exists).
- Raw `<details>/<summary>`: `rankings-duel-arena.tsx:318` (use `Collapsible`/`Accordion`).
- Raw `<img>` (AGENTS: `next/image`): `tracks-view.tsx:181,204,215,223`, `add-album-to-library-dialog.tsx:352`, `all-albums-view.tsx:864`, `details/.../album-details-view.tsx:108`.
- Dialog vs Drawer: `AddAlbumToLibraryDialog` is a multi-field create form in a `Dialog` (add-album-to-library-dialog.tsx:256); AGENTS requires `Drawer`.
- Ad-hoc bordered cards: placeholder boxes in `layout.tsx:84` / `rankings-view.tsx:595` / `rankings-duel-arena.tsx:283` use hand-styled `rounded-lg border border-dashed` containers (use `Card`/`Empty` if present). a11y lint: `album-card.tsx:60` (click without key handler), 6 `useSemanticElements`.
- File size/structure: `all-albums-view.tsx` 1316 lines, `rankings-view.tsx` 853, `album-ranker.tsx` 562; main component first rule is respected but helpers are interleaved.

### React effects (17 `useEffect` in slice, none carries the required one-line comment)
Legitimate (outside system), only missing the comment: keydown listeners `rankings-duel-arena.tsx:199`, `album-ranker.tsx:303`, `rankings-view.tsx:277`; IntersectionObserver `history-view.tsx:109`; scroll `album-ranker.tsx:123`, `rankings-view.tsx:311`; focus `album-ranker.tsx:342`; timer cleanup `all-albums-view.tsx:831`.
Illegitimate (state-from-props / reset-on-change; use `key`, derive, or handler):
- `album-ranker.tsx:84` copies `albumToRate` into `currentRating/positionInRating` state; give the inner component `key={albumToRate.userAlbumId}` and initialise state from props.
- `add-album-to-library-dialog.tsx:88` resets 8 pieces of state when `open` becomes false; unmount the form or `key` it.
- `album-rym-associate-drawer.tsx:40` and `convert-listen-drawer.tsx:51` seed `searchInput`/`includeMapped` from props on open; use `key` and initial values (focus timer is legitimate, keep it, add comment).
- `all-albums-view.tsx:153` mirrors URL query into `searchInput` state (and `:157` pushes the debounced value back to the URL); derive from `searchParams` and navigate in `onChange` handler.
- `rankings-view.tsx:332,337,343` reset selection/optimistic state on `yearFilter`/`mode`/`frame` change and force `mode` when `yearIsAll`; use `key`s and derive effective `mode` during render.
- `use-debounced-state.ts` (shared) is an effect-based debounce; `use-auth-token.ts:19` fetches `/api/auth/status` inside an effect (AGENTS: never fetch in an effect) and `albums-context` depends on it.
- Biome `useExhaustiveDependencies` fails at `rankings-view.tsx:311,332,343`, `use-debounced-callback.ts:16`.

### Forms
- No form in the slice uses TanStack Form + Zod or `Field`. Raw `useState` forms: `add-album-to-library-dialog.tsx:74-86` (6 fields, hand-validated with toasts at :105-204, regex at :199), `convert-listen-drawer.tsx:41-49`, `album-rym-associate-drawer.tsx:33-38`, `add-listen-view.tsx` (date selection), filter rails (`library-filters.tsx`, `listens-filters.tsx`, `rankings-filters.tsx`; live-search/filters, arguably not "submit" forms but still `useState`/URL-driven with raw inputs).
- Zod schema is not shared with Convex mutation args (`addManualAlbumToLibrary` re-validates year in the handler, spotify.ts:1767-1773).

### Dark mode
- Hardcoded palette classes (26 `teal-*` + others) instead of semantic tokens: `ranking-board-row.tsx:81-85,98,107,121`, `album-card.tsx:66,92,107`, `rankings-duel-arena.tsx:318,413-417,439`, `listen-history-row.tsx:182,321,344-350`, `listens-filters.tsx:121`, `library-filters.tsx:17`, `rankings-view.tsx:507,595,827,841`, `rankings-filters.tsx:43`, `all-albums-view.tsx:996,1020,1030`, `enrichment-trials.tsx:169,287-302`, `album-details-view.tsx:160,310`. Only 19 `dark:` variants exist for ~41 palette usages; e.g. `teal-950/*` fills and `text-teal-800/70` (album-card.tsx:92) have no dark counterpart. Fix: define an accent token (e.g. `--accent-teal`) in `globals.css` and use `bg-accent`/`text-primary` style semantic classes.
- `listen-history-row.tsx:344` `bg-white text-zinc-800` for the Spotify badge is brand colour; acceptable if intentionally fixed, but a baseline test pins the literal string (`listen-history-row.baseline.test.ts:47`).

### Toasts
- Conformant: `<Toaster />` mounted once (not re-verified in layout; slice only calls `toast` from `sonner`). Note `use-sync-history.tsx` renders a multi-line emoji monospace JSX toast (10 s) for sync stats; consider a Drawer/`Sheet` result view.

### Env
- Conformant in `src/` (`~/env`). `src/lib/spotify-sync.ts` imports `~/env` (not `~/env.js`; fine). In Convex `process.env` is used where AGENTS allows. Minor: duplicated Spotify token-refresh logic in `convex/spotify.ts:2295-2333` and `convex/rooleases.ts:541,798` and `src/lib/spotify.ts`.

### Auth
- Depends on no-op `requireAuth`: 8 `requireAuth(ctx)` calls in spotify.ts (:1653,1704,1757,1844,1890,3385,3670,3707) are cosmetic; the other 69 fns do not call it. All slice fns take `userId` from args (AGENTS and Convex guidelines both forbid trusting it) and some take only a document id with no ownership check: `updateAlbumRating`, `deleteAlbumListen`, `convertAlbumListen`, `setSpotifyAlbumRymNotOnSite`, `associateSpotifyAlbumWithRymScrape`, `albumEnrichmentTrials.{setTrialVerdict,promoteTrial}`.
- AGENTS says pass the session token via `X-Access-Token` and validate with `validateSessionToken`; the slice uses `X-Access-Token` for the *Spotify* token and never calls `validateSessionToken`. See E1/E2.
- Client auth: `useAuthToken` (src/lib/hooks/use-auth-token.ts) not `~/lib/auth-context.tsx`.

### Convex
- Validators: all 77 spotify.ts fns, 3 spotifyPlayEvents, 4 listenRepair, 5 albumDuels have `args`; 57 of 77 in spotify.ts lack `returns` (only the library/listen/add-album/RYM fns have them). albumDuels, spotifyPlayEvents, spotifyListenRepair are fully conformant. Examples missing returns: `getConnection`, `upsertAlbum`, `getUserAlbums`, `recordAlbumListen`, `addManualAlbumListen`, `deleteAlbumListen`, `updateAlbumRating`, `getRatedAlbumsForYear`, `getRecentlyPlayedTracks`, `getLastSyncRun`, `saveSyncRun`, `createSyncLog`.
- `v.any()` in return (`enrichedAlbumListenValidator.album`, :3257); `v.string()` for enums (E12); hand-rolled paginated return shape instead of `paginationResultValidator` (:3375-3383).
- Indexes: DB `.filter()` used only in `_utils/albumLibraryIndexedList.ts:104-170` as post-index filters (acceptable per guidelines but combined filters scan the whole index range; 7 `any`-typed callbacks with biome-ignore).
- Bounded reads: 22 of 77 fns in spotify.ts contain `.collect()`; unbounded ones listed in E3/E4. spotifyPlayEvents `listPlayEventsForAlbumsSince` collects per album over 24 h (bounded in practice).
- Internal vs public: see E4. `spotifyListenRepair.ts` correctly uses internal fns.
- Nested `ctx.runMutation(internal.forLaterAlbums.refreshFilterProjectionsForUserAlbum)` from mutations (spotify.ts:60, manualAlbum.ts:112, spotifyListenRepair.ts:247): guidelines prefer a shared helper function over mutation-to-mutation calls. 
- Structure: AGENTS says reusable logic lives in `convex/model/` and public fns are thin; no `convex/model/` exists (helpers in `convex/_utils/`), `convex/spotify.ts` is a 4151-line grab-bag (playlists, categorizations, tokens, canonical tracks, library, listens, ratings) with mutations running 100+ lines. No `convex-helpers` custom auth functions anywhere (only `stream` imported). Suggest splitting by domain: `spotifyConnections`, `spotifyPlaylists`, `albumListens`, `albumLibrary`, `albumRatings`.
- `ctx.db.get(id)`/`patch(id, …)` legacy single-arg form used throughout; Convex 1.46 guidelines recommend `ctx.db.get("table", id)` (already used in `convex/launch.ts`). Low priority, mechanical.
- `Error` thrown instead of `ConvexError` for user-facing failures (albumDuels, spotify.ts); client shows `error.message` (add-album-to-library-dialog.tsx:245).
- `"use node"`: none in slice (conformant). Actions: only `backfillCanonicalTrackArtistIds` (dead, E4). Mutations never fetch (conformant).
- Timestamps are Unix ms (conformant). Date strings: `releaseDate` kept as Spotify string, parsed ad hoc in 3 places (`parseReleaseYear` in albumDuels.ts:46, `parseAlbumReleaseYear` spotify.ts:2548, `parseListenReleaseYear`).
- `as any` x6 in spotify.ts (:112,166,215,264,465,2108) casting cursors; use `string | null`.

### Tests
- Zero Vitest/`convex-test` tests in the slice. `vitest.config.ts` includes only `convex/launch-*.test.ts`, so `pnpm exec vitest run` (AGENTS command) never runs any albums test. No behaviour test exists for `recordAlbumListen`, `convertAlbumListen`, `deleteAlbumListen`, `albumDuels.pick/undoLast`, `applyRepairCandidates`, `upsertPlayEvents`, `listUserAlbumListensPaginated`.
- 18 `*-source.test.ts` files assert on source text with `readFileSync` + regex (e.g. `convex/albumDuels.source.test.ts`, `spotify.add-manual-album-to-library-source.test.ts`, `src/app/albums/_components/*-source.test.ts`, `listen-history-row.baseline.test.ts:47` pins `bg-white text-zinc-800`). They are brittle and prove nothing about behaviour; one fails now: `spotify.add-manual-album-to-library-source.test.ts` "spotifyAlbums declares optional spotifyAlbumId and source union" (schema now `source: v.optional(v.union(...))` across lines). Replace with `convex-test` tests.
- AGENTS's `node --test path/to/file.test.ts` does not work as written on Node v22.14 (`ERR_UNKNOWN_FILE_EXTENSION`; with `--experimental-strip-types` extensionless imports like `./duel-pairing` fail). `npx tsx --test` works (153/154 pass).
- Pure-logic coverage in `src/lib` is decent (album-detection, duel-*, ranking-*, spotify-listen-repair, parse-spotify-album-id) and `convex/_utils/album*` have unit tests; the Convex handlers themselves are untested.
- Bug workflow (write a failing test first): E6/E7 need repro tests before changes.

### Code style
- Conformant: function declarations, `type` aliases (no `interface`), kebab-case files, tabs, no `any` in `src/app/albums`, `~/` imports.
- Drift: exported components/hooks lacking explicit return types (`AlbumsProvider`, `useAlbums`, `AlbumsLayout`, most page defaults; `useAlbumRatingDrawer` has none); 9 `as Id<...>` casts widening string ids in the client (`albums-context.tsx:282,294`, `all-albums-view.tsx:234,275`, `convert-listen-drawer.tsx:80,92,110`, `rankings-duel-arena.tsx:383-384`) because `_utils/types.ts` uses `string` ids; cross-feature imports (`layout.tsx:9` from `spotify-playlister/_components`, `up-next-view` imports `for-later-albums/_components/year-range-picker`); `albums/rated/page.tsx` default export is named `RankingsPage`; Biome: 11 format, 5 organizeImports, 6 noExplicitAny, 6 useSemanticElements, 4 exhaustive-deps, 1 sorted-classes (`library-filters.tsx:182`), 1 noImplicitAnyLet (`spotify.ts:864`).
- `window.location.href = "/spotify-playlister"` for disconnect (`albums-context.tsx:167`) instead of `router.push`/`Link`.

## Suggested changes (ranked, with effort)

1. (M) Lock down Spotify tokens: make connection read/write internal; return `{isConnected, displayName}` publicly; move token refresh and `/api/spotify/*` to session-verified server paths (E1, E2).
2. (M) Sign session cookie with `SESSION_SECRET`; add `/albums`, `/api/spotify` to middleware; derive `userId` from the session in routes and pass to Convex via a server-only secret (E2). Largest security lever.
3. (M) Replace `getUserAlbums` in the layout with a bounded, projected query (or `albumLibraryItems`); gate `getRatedAlbumsForYear` on drawer open; fix `getRecentlyPlayedTracks` to `.take`; stop writing `rawData` (E3).
4. (S) Delete dead public functions (`listAlbumLibraryRows`, `getAllAlbums`, `getAllConnections`, `debugTrackUserIds`, `getPendingSyncLogs`, `getRecentSyncRuns`, `getLatestRatingTimestamps`, `getTracksByAlbumId`, `getCategorizationByTrack`, `getCanonicalTrackBySpotifyId`, `upsertCanonicalTrack`, `backfillCanonicalTrackArtistIds`, `albumDuels.getPair/listDuelTop`) after a final repo grep (E3, E4, E8).
5. (S) Make `clearLegacy*` and `backfill*` internal / `@convex-dev/migrations`; remove the backfill buttons from `all-albums-view.tsx` (E4, E5).
6. (S-M) Reproduce then fix `recordAlbumListen` first/last handling by sharing one helper with `recordManualListenForAlbum` and `applyRepairCandidates`; add `convex-test` tests (E6). Decide intended behaviour for rating loss on convert/delete and test it (E7).
7. (M) Add `returns` validators to the 57 fns missing them; literal unions for `source`/`status`/`syncType`; tighten the two "temporarily optional" schema fields after backfill (E12).
8. (M) Search pagination: drop overscan for the search-index path, delete unreachable fallback, make artist sort global or document it (E9). `listAlbumLibraryReleaseYears`: distinct-years skip-scan or tiny table (S).
9. (M) Make Vitest the real runner for Convex tests: widen `vitest.config.ts` `include`, port the 18 source-regex tests to `convex-test` behaviour tests, fix the failing one.
10. (L) UI convergence: replace raw `button/select/img/details`, convert `AddAlbumToLibraryDialog` to `Drawer`, convert forms to TanStack Form + Zod `Field`, remove state-copy effects with `key`, add effect comments, introduce semantic accent token for teal, use `date-fns`. Decide Base UI vs Radix first (see Corrections) to avoid migrating twice.
11. (M) Split `convex/spotify.ts` into domain modules with logic in `convex/model/`; replace mutation-to-mutation `runMutation` with a shared helper; move `duelElo/rankingWeek/rankingOrdinals` to a single source of truth via relative imports (E8).
12. (S) Convert `src/pages/api/cron/sync-spotify.ts` to an App Router route; batch the per-track/per-album Convex queries in `spotify-sync.ts` into one query/mutation each; prune `spotifySyncLogs` (E10).
13. (S) Biome clean-up (`pnpm check:write` fixes 17 format/import issues), replace `as any` cursor casts.

## AGENTS.md corrections

- UI stack row says "shadcn/ui on **Base UI** (not Radix)" but `components.json` is `new-york` (Radix) and 12 of 13 primitives in `src/components/ui` import Radix; only `combobox.tsx` is Base UI. Either schedule the migration (`migrate-radix-to-base`) or state "currently Radix; new components must be Base UI". Also: "Don't edit `src/components/ui/` by hand" conflicts with `asChild` usage that a Base UI migration removes.
- Auth: "`~/lib/auth-context.tsx` and `useAuthToken()` expose it" is inaccurate: `useAuthToken` is `~/lib/hooks/use-auth-token.ts` and returns `{userId, isLoading}`; `auth-context.tsx` exposes `isAuthenticated/login/logout`. "Single-user session auth: `src/middleware.ts` checks the session cookie" is only true for 8 route groups (books, folio-society, articles, concerts, birthdays, playlist-lyrics, lyrics/playlists, two migrate APIs); `/albums` and `/api/spotify/*` are unprotected. "Pass the access token ... via `X-Access-Token` ... validate with `validateSessionToken`" does not match the Spotify routes (header carries the Spotify token; no validation). The session cookie is unsigned base64.
- Convex: "Use auth-wrapped queries/mutations (built with convex-helpers custom functions)" and "reusable logic in `convex/model/`" describe a target state; neither exists (`convex/_utils/` is used; no custom functions). Mark as aspirational or add a migration plan. "Return `null`, never `undefined`" and "every registered function has `returns`" are violated by 57 fns in spotify.ts; add the rule's exception list or enforce.
- Convex env: guidelines now recommend `defineApp({ env })` and `env` from `./_generated/server`; AGENTS says `process.env`. Decide one.
- Tests: "`pnpm exec vitest run` — Vitest" should note `vitest.config.ts` only includes `convex/launch-*.test.ts`; `node --test path/to/file.test.ts` does not work on Node 22.14 for `.ts` files with extensionless imports; document `npx tsx --test <files>` as the working command. Also state that `*-source.test.ts` regex tests are discouraged.
- Stack: add a note that `src/pages/api/cron/*` (Pages Router) exists for QStash crons (8 files) or schedule the migration.
- Layout: add `.worktrees/` and `roberts-records/` (present in repo root) or confirm they are ignored; add `scripts/repair-spotify-album-listens.ts` + `pnpm repair:spotify-album-listens` to the Commands list.
- "Actions are only for external APIs (Spotify...)" vs reality: Spotify sync runs in a Next route using `ConvexHttpClient` (`src/lib/spotify-sync.ts`), not a Convex action. Either allow this pattern explicitly (API routes for external integrations) or migrate sync to an internal action invoked by cron.

# Audit: robs-rankings + rooleases vs AGENTS.md

Date: 2026-10-07. Read-only audit; verified by reading source, `biome check`, `tsc --noEmit` (no errors in slice), and running the slice's tests.

## Scope (files reviewed)

- Pages: `src/app/robs-rankings/page.tsx`, `_components/{ranking-board,ranking-album-card,edit-album-dialog,add-album-dialog,add-manual-album-dialog,import-playlist-dialog}.tsx`, `_utils/types.ts`; `src/app/rooleases/page.tsx`, `_components/{artist-list,artist-search,check-tracks-dialog,create-year-drawer,import-playlist-dialog,recent-tracks}.tsx`.
- Convex (confirmed by grepping `api.*` in the pages): `convex/robRankings.ts` (22 fns), `convex/rooleases.ts` (20 fns + 2 actions), `convex/rankingSnapshots.ts`, `convex/albumDuels.ts`, `convex/crons.ts`, `convex/auth.ts`. Also touched because the pages depend on them: `convex/spotify.ts` (`getConnection`, `getAllCanonicalTracks`), `convex/schema.ts` (robRanking*, roo*, spotifyArtists), `convex/_utils/{duelElo,rankingOrdinals,rankingWeek,robRanking*Stats}.ts`.
- API routes the pages POST to: `src/app/api/spotify/{import-robs-top-50,seed-artists,check-new-tracks}/route.ts`; `src/middleware.ts`; hooks `use-spotify-auth`, `use-auth-token`, `use-debounced-*`.
- `src/lib`: `ranking-{ordinals,week,wow}.ts`, `duel-{elo,pairing}.ts`, `rob-top-50-import.ts` + their tests; convex source tests `rankingSnapshots.capture-source.test.ts`, `albumDuels.source.test.ts`, `rob-ranking-genre-stats-source.test.ts`.
- Scope note: `rankingSnapshots.*`, `albumDuels.*`, and `src/lib/{ranking-*,duel-*}` are NOT used by the robs-rankings/rooleases pages. They are used by `src/app/albums/_components/{rankings-view,rankings-duel-arena}.tsx` (and the cron). They were audited because they were named in the slice. `robRankings.getPublished*` / `listPublishedYears` are used by `src/app/public/robs-top-50/**`, not by the editor page.

## Summary

| AGENTS.md section | Status | # findings |
|---|---|---|
| Stack table | Drift (Radix instead of Base UI; no TanStack Form; no date-fns; tests runner) | 6 |
| UI (shadcn) | Non-conformant | 12 |
| React effects | Non-conformant | 7 |
| Forms | Non-conformant (0 of 8 forms use TanStack Form + Zod; `Field` component not installed) | 8 |
| Dark mode | Mostly OK | 1 |
| Toasts | OK (sonner); a few success toasts fire before the mutation resolves | 2 |
| Env | OK (`env.js` in routes; `process.env` only in convex actions) | 0 |
| Auth | Non-conformant (userId-as-arg everywhere; no ownership checks; routes unprotected) | 6 |
| Convex | Non-conformant | 20 |
| Tests | Drift (node:test files cannot run via any script; vitest only collects `launch-*`) | 5 |
| Code style | Minor drift | 6 |

## Errors & risks (ranked)

### E1. Spotify tokens readable by anyone who knows the userId (HIGH, security)
`convex/spotify.ts:651` `getConnection` is a public `query({args:{userId}})` that returns the whole `spotifyConnections` row, including `accessToken` and `refreshToken`. Both pages call it via `src/lib/hooks/use-spotify-auth.ts` (type `SpotifyConnection` carries `accessToken`/`refreshToken`), and the rooleases actions call it with `api.spotify.getConnection` (`convex/rooleases.ts:527,785`). This depends on `requireAuth` being a no-op (there is no auth anywhere in these functions). Fix: make it internal for server use. For the client, expose a `isConnected`/`displayName` projection that omits tokens, and mint access tokens through a server route or action.

### E2. Every mutation in the slice trusts a client-supplied `userId` or has no ownership check (HIGH)
- `userId` as arg: `getOrCreateYear` (`robRankings.ts:92`), `listYearSummariesForUser:120`, `getYearsForUser:151`, `replaceYearFromAlbums:640`, `addAlbumToYear:699`, `addManualAlbumToYear:816`, and all `albumDuels` fns (`getPair`, `pick`, `undoLast`, `listScores`, `listDuelTop`), `rankingSnapshots.getCompleteWeek:244`. Guidelines say never accept a user id as an auth argument.
- No ownership check at all: `addAlbumToYear` (never loads the year), `removeAlbumFromYear:889`, `updateRankingAlbumManual:746`, `setRankingArtistNames:783`, `updateAlbumPosition:923`, `batchUpdatePositions:959` (checks that albums belong to `yearId`, not that the year belongs to the caller), `setYearPublished:612` (any caller can publish or unpublish any year; publishing exposes it on `/public/robs-top-50`).
- All of `rooleases.ts` has no auth, including destructive `clearArtistsFromYear:440`, `createYear`, `setDefaultYear`. `rooYears` has no `userId` column, so the tool is effectively global.
- Public actions `backfillArtistsFromTracks:509` and `enrichSpotifyArtists:711` can be fired by anyone with the deployment URL. They spend Spotify quota using the stored sync user's tokens. They should be `internalAction`.
- Single-user app: the practical fix is one auth-wrapped `customQuery`/`customMutation` (convex-helpers) that validates the session token and removes the `userId` args. `requireAuth` being a no-op is the pre-existing cause. This slice just inherits it.

### E3. API routes that write data are not behind the middleware and trust the body (HIGH)
`src/middleware.ts` matcher covers books/folio/articles/concerts/birthdays/playlist-lyrics only. Not covered: `/robs-rankings`, `/rooleases`, `/api/spotify/import-robs-top-50`, `/api/spotify/seed-artists`, `/api/spotify/check-new-tracks`. The pages gate only client-side via `LoginPrompt`. `import-robs-top-50/route.ts:17-41` takes `userId`, `yearId`, `accessToken` from the JSON body, uses an unauthenticated `ConvexHttpClient`, and calls `replaceYearFromAlbums`, which destroys the year's list. `ConvexHttpClient` never receives an `X-Access-Token`. Fix: add these paths to the middleware matcher, derive `userId` from the session in the route, and require `validateSessionToken`.

### E4. `getAvailableAlbums` reads the entire `spotifyAlbums` table, including `rawData` (HIGH, perf/cost, grows unbounded)
`robRankings.ts:596` does `ctx.db.query("spotifyAlbums").collect()`. Each doc carries `rawData` (full Spotify JSON string, schema.ts:613). This is a reactive subscription (`robs-rankings/page.tsx:53`) that is active whenever the page is open, even if the Add dialog is never opened, and re-runs on any album write (sync cron, imports). It will hit read-size and doc-count limits as the library grows. Fix: replace with a search-driven query. Either a search index on `spotifyAlbums.name` (`withSearchIndex`) or `by_albumTitleKey`, with `args.searchTerm`, `.take(50)`, and a `skip` until the dialog is open. Return a slim shape.

### E5. `searchArtists` collects all `spotifyArtists` and filters in JS (HIGH, perf)
`rooleases.ts:83-88`. Runs on every debounced keystroke; the table grows with every playlist import. Use a search index (`withSearchIndex("search_name", q => q.search("name", term))`) with `.take(20)`; add it to schema. The `by_name` index exists but is unusable for substring search.

### E6. Stale optimistic positions override server state in the ranking board (MED, correctness)
`ranking-board.tsx:31-33,50-60,76-81`. `optimisticUpdates` is only ever added to, never cleared or reconciled when `albums` updates. After a move, a later server-side change (remove an album, which shifts positions in `removeAlbumFromYear`; manual insert that shifts; another tab) is overridden by the old optimistic position for every album ever moved, so the board can show duplicate or incorrect ranks until reload. Also the debounced save (800 ms) is lost if the component unmounts or the year changes (`useDebouncedCallback` has no cleanup/flush). Fix: clear the entry when server `albums[i].position` equals the optimistic value, or key the board on `yearId` and reset; flush on unmount.

### E7. Unhandled mutation failures + premature success toasts (MED)
`robs-rankings/page.tsx:247-262` (`batchUpdatePositions`, `removeAlbumFromYear`: `void mutation(...)` with no catch, so a failed save silently reverts or leaves UI diverged), `:293-295` (`void addAlbumToYear(...)`; `AddAlbumDialog.handleAdd` toasts "Album added" and closes before the promise resolves, and the "50 limit"/"already in rankings" errors from the server become unhandled rejections). Make the handlers async, await, and toast errors.

### E8. `removeAlbumFromYear` / `getOrCreateYear` / publish logic (MED)
- `robRankings.ts:901-905`: `withIndex("by_yearId")` + `.filter(position > n)`. The existing `by_yearId_position` index supports `q.eq("yearId", ...).gt("position", removed)`.
- `getOrCreateYear` is called on page load and on every year dropdown change (`page.tsx:64,86`), so merely viewing a year inserts an empty `robRankingYears` row (query-by-mutation side effect). The year `<select>` lists 2016..now, so browsing creates rows.
- `batchUpdatePositions:959` does not validate that the resulting positions are unique or within 1..50; a partial/racy batch can leave duplicate positions, and the `by_yearId_position` `.first()` in `updateAlbumPosition` then picks arbitrarily. `updateAlbumPosition` is unused (dead code); delete.
- `addAlbumToYear:711` computes next position as `existing.length + 1`, which assumes contiguous 1..n positions. After a corrupt state the new row can collide.

### E9. `rooleases` check dialog receives a stale/null Spotify token (MED)
`rooleases/page.tsx:42-46` fetches a token once in an effect and passes it as `accessToken` prop to `CheckTracksDialog`. It is never refreshed (Spotify tokens expire in ~1 h) and is `null` until resolved (`check-tracks-dialog.tsx:29` toasts "No access token available"). The other dialogs correctly take `getAccessToken` and call it on click. Make `CheckTracksDialog` do the same and delete the effect + state.

### E10. `replaceYearFromAlbums` is a heavy single transaction with duplicated work (MED, deploy/runtime risk)
`robRankings.ts:640-696`: deletes all rows, inserts up to 50, calls `matchRymForSpotifyAlbum` for each (`attemptRymMatchForRankingAlbum:684`), then up to 100 `upsertAlbumLibraryProjection` calls (existing + new). The route already calls `api.spotify.attemptRymMatchForAlbum` per album first (`import-robs-top-50/route.ts:51`), so the matching runs twice. Each projection and match performs several unbounded `.collect()`s (`_utils/albumLibraryProjection.ts:155-325`, `albumMatching.ts:164,248`). Risk of hitting read/write limits as RYM data grows. Fix: drop the duplicate match in the mutation (or the route), and dedupe `albumId`s before projecting (an album in both old and new is projected twice).

### E11. Unbounded / filtered reads (MED, convention + growth risk)
- `.filter()` instead of `.withIndex`: `listYearSummariesForUser:127` and `getYearsForUser:158` (use `by_userId_year`, `q.eq("userId", ...)`); `getPublishedTopLevelGenreCountsForYear:339` and `getPublishedAlbumsForYear:516` (filter on year+published after scan; add index `by_published_year` `["published","year"]`); `removeAlbumFromYear:904`.
- Unbounded `.collect()`: `listYearSummariesForUser` (N+1 collecting every entry per year just to `.length`), `listPublishedYears:171`, `collectPublishedArtistFinishEntries:263-274` (all published years, all rankings, `ctx.db.get` per row, called by 4 separate public stats queries), genre-count builder `:363-410,466,481` (N+1 over albums, RYM links, release genres), `getAvailableAlbums:596` (E4), `getArtistsForYear:272` (per-year, OK in practice), `getTracksAddedForYear:343-353` (collects all, then `slice(limit)`; use `.take(args.limit ?? 50)`), `rankingSnapshots.orchestrateSunday:166` (`ctx.db.query("userAlbums").collect()` full-table scan weekly to find users; comment admits it), `captureUserWeek:199` + `captureYearForUser` (all albums for a user plus per-album `db.get`, plus delete/insert of every entry for every year in ONE mutation; will exceed 16k writes / 4096 docs-read-per-scan style limits for large libraries), `albumDuels.loadRatedAlbumsForYear:80`, `loadScoreMap:106`, `listScores:436` (full per-user scans, per-album `db.get`, in reactive queries), `spotify.getAllCanonicalTracks:2090` (used by `backfillArtistsFromTracks:579`).
- `rankingSnapshots` and `albumDuels` are not in the pages' call path, but `orchestrateSunday` runs weekly in prod via `crons.ts`.

### E12. Hidden runtime/deploy hazards (LOW-MED)
- `rooleases.ts:103` `cursor as any` plus a hand-rolled paginate wrapper instead of `paginationOptsValidator` / `.paginate(args.paginationOpts)`; also called via `api.*` from an action (public function used as internal plumbing).
- Actions call public `api.rooleases.*`/`api.spotify.*` instead of `internal.*`; N sequential `ctx.runQuery(getArtistBySpotifyId)` (`:612-619`) and 25-row `bulkUpsertArtists` batches with no time budgeting; `backfillArtistsFromTracks` loads ALL canonical tracks into action memory.
- `enrichSpotifyArtists` and `backfillArtistsFromTracks` duplicate ~40 lines of Spotify token-refresh code (also duplicated vs other Spotify actions); `rooleases.ts` is not Biome-formatted.
- `setYearPublished`: `Error` instead of `ConvexError` for user-facing validation failures (the UI shows `error.message`, which Convex strips in prod for plain `Error`: "Server Error"). Affects all `throw new Error(...)` messages surfaced via toast (`robRankings.ts:619,627,653,712,721,755,760,799,827,838,844,850,853`, `rooleases.ts:135`). In production the toasts will show a generic message. Use `ConvexError`.
- `getOrCreateYear` and `createYear` have races only theoretically (Convex serializes), fine.
- `rooleases` `createYear` year `min=2020 max=2030` in drawer vs. no server bound.
- Two copies of logic must be hand-synced: `src/lib/duel-elo.ts` vs `convex/_utils/duelElo.ts` (differ by a comment only), `src/lib/ranking-ordinals.ts` vs `convex/_utils/rankingOrdinals.ts` (convex copy is a subset), `ranking-week.ts` identical copy, `duel-pairing.ts:6` vs `albumDuels.seedEloFromRating:40` (3 copies of `seedEloFromRating`). Drift is already present for ordinals. AGENTS.md says src/lib code imported by Convex should use relative imports (no alias): that is feasible and would remove the duplicates (`import ... from "../src/lib/duel-elo"`); the repo instead copies and annotates "Convex cannot import from src/lib".

## Convention drift by AGENTS.md section

### Stack table
- Radix, not Base UI: `src/components/ui/{button,dialog,alert-dialog,checkbox,label,popover,separator,sheet,slider,tabs,tooltip}.tsx` import `radix-ui` / `@radix-ui/*`; `button.tsx` uses `Slot` and `asChild`. Only `combobox.tsx` uses `@base-ui/react`. `components.json` is `style: new-york` (the Radix style). The slice leans on Radix API: `asChild` at `robs-rankings/page.tsx:221`, `rooleases/page.tsx:200`, `rooleases/_components/check-tracks-dialog.tsx:70`. These break if the ui components are migrated to Base UI (`render` prop instead).
- Forms: no TanStack Form / Zod anywhere in the slice (see Forms).
- Dates: `date-fns` not used; `new Date(...).toLocaleString()` / `toLocaleDateString()` at `rooleases/page.tsx:165`, `recent-tracks.tsx:34`. Year math via `new Date().getFullYear()` is fine.
- Icons: lucide-react only. OK. Toasts: sonner only. OK. Env: OK.
- Data via API routes: `import-robs-top-50`, `seed-artists`, `check-new-tracks` are data-shaped writes that call Spotify and Convex. AGENTS.md allows API routes only for external integrations (Spotify). Since they call Spotify with the user's token they qualify, but they should be Convex actions or session-guarded (E3), and `check-new-tracks` plus `seed-artists` read/write via `ConvexHttpClient` without auth.
- Tests: see Tests.

### UI (shadcn)
1. Raw `<select>`: `robs-rankings/page.tsx:157`, `rooleases/page.tsx:107`, `rooleases/_components/create-year-drawer.tsx:132` (`~/components/ui/select` exists).
2. Raw `<button>`: `rooleases/_components/artist-search.tsx:91` (result rows). Use `Button`/`Combobox` (`ui/combobox.tsx` exists; this is a search-and-pick UI).
3. Raw `<img>` without Next `Image`: `ranking-album-card.tsx:47`, `artist-list.tsx:54`, `artist-search.tsx:100`, `edit-album-dialog.tsx:32`, `add-manual-album-dialog.tsx:29`. Biome-ignore comments name a non-existent rule (`lint/performance/noImgElement`) and produce 4 `suppressions/parse` errors. Either configure `images.remotePatterns`/`unoptimized` for arbitrary hosts or use `Image` with `unoptimized` and drop the suppressions. Spotify artist/album images (`artist-list`, `artist-search`) are on known hosts and should be `Image`.
4. Ad-hoc bordered cards where `Card` exists (`ui/card.tsx`): `rooleases/page.tsx:153` (`rounded-lg border bg-card p-4`), `recent-tracks.tsx:22`, `artist-list.tsx:50`, `ranking-board.tsx:208` (`rounded-lg border p-3`), import result panels (`robs-rankings/_components/import-playlist-dialog.tsx` "Import Complete", `rooleases/_components/import-playlist-dialog.tsx:~140`). Empty-state dashed boxes at `rooleases/page.tsx:136,236,256`, `robs-rankings/page.tsx:235`, `ranking-board.tsx:212` (use an `Empty` component if installed, else Card).
5. Drawer over Dialog: substantial forms are in `Dialog`: `AddManualAlbumDialog` (4 fields), `EditAlbumDialog` (3 fields), both `ImportPlaylistDialog`s (form + result), `CheckTracksDialog` (settings), `AddAlbumDialog` (search-and-pick view). Only `CreateYearDrawer` conforms. `AlertDialog` for "Replace existing list?" and "Clear all artists?" is correct.
6. Hand-rolled role=button div: `ranking-album-card.tsx:84-99` (div with `role="button"`, keyboard handler) containing nested interactive buttons/checkbox (invalid nested-interactive a11y). Use a real `Button`/list pattern or a roving-focus list.
7. Hand-rolled dropdown results popup `artist-search.tsx:89-124` (`absolute z-10 ... bg-popover shadow-lg`). Use `Popover`/`Combobox`.
8. `Skeleton` component exists but loading states are plain "Loading..." paragraphs (`robs-rankings/page.tsx:92-96,230-233`, `rooleases/page.tsx:81-85`); AGENTS.md style says `ComponentNameSkeleton` after the main component.
- Don't hand-edit `ui/`: no edits in the slice.

### React effects (all six effects)
| Location | Verdict | Change |
|---|---|---|
| `robs-rankings/page.tsx:74-88` | Violation. Copies Convex query result into state; guarded by `initializedRef`. No outside system. | Derive `const year = selectedYear ?? yearSummaries?.[0]?.year ?? currentYear`. Call `getOrCreateYear` in the year-change handler (and ideally fold "ensure year" into the mutations that need it, or lazily on first add/import). Better: stop auto-creating rows (E8). |
| `rooleases/page.tsx:42-46` | Violation. Async fetch in effect, stale token (E9). | Delete; pass `getValidAccessToken` to `CheckTracksDialog` and call on click. |
| `rooleases/_components/create-year-drawer.tsx:39-43` | Violation. Fetches playlists in effect on `[open]`; exhaustive-deps error; refetches forever if the list is empty/failed. | Load in the `onOpenChange(true)` handler or via a child component that mounts on open (`key`); or use a server action. |
| `robs-rankings/_components/edit-album-dialog.tsx:66-72` | Violation. Copies props to state. | Render the form in a child keyed by `album._id` with `useState(initial)`; drop the effect. |
| `robs-rankings/_components/add-manual-album-dialog.tsx:67-70` | Violation. Syncs `position` state from `nextPosition`. | Derive the default position; keep user input as an override (or key the form by `open`). |
| `ranking-board.tsx:98-128` (window `keydown`) | Legitimate (browser API). | Add the required one-line "syncs with window keydown" comment. Re-registers on every `moveAlbum` identity change. |
| `ranking-board.tsx:131-146` (scroll into view) | Legitimate (scroll). | Add comment; the `biome-ignore` is acceptable. |
- Also: `useDebouncedCallback` assigns `callbackRef.current = callback` during render (React-compiler/strict-mode unsafe) and has no unmount cleanup. `import-playlist-dialog` (both) use `setTimeout` in `handleClose` to reset state after animation; use `key` on the dialog body instead.
- `useCallback`/`useMemo` are used heavily in `ranking-board.tsx`; not required, not a violation.

### Forms
Zero conformance: no TanStack Form, no Zod, no shadcn `Field`. `ui/field.tsx` does not exist (only `field-group.tsx`), so the rule cannot currently be followed without `pnpm dlx shadcn@latest add field`. Offenders (each uses `useState` per input and hand validation with `toast.error`):
- `robs-rankings/_components/add-manual-album-dialog.tsx:58-125` (position number-as-string parsed by hand)
- `edit-album-dialog.tsx:51-100`
- `robs-rankings/_components/import-playlist-dialog.tsx:54-120` (single URL input; `extractPlaylistId` duplicated)
- `rooleases/_components/import-playlist-dialog.tsx:39-71` (same `extractPlaylistId`, duplicated again, defined inside the component)
- `rooleases/_components/check-tracks-dialog.tsx:29-30` (`days` number; no validation of `min`/`max`, `Number("")` = 0 allowed)
- `rooleases/_components/create-year-drawer.tsx:28-34`
- `rooleases/_components/artist-search.tsx:20-24` (search with Enter-to-submit; AGENTS.md explicitly lists "search boxes that submit")
- Add Album search input (`add-album-dialog.tsx:30`) is a filter, not a submit form (arguably exempt).
Fix: one shared `src/lib/spotify-playlist-id.ts` with a Zod `playlistInputSchema` (+ test), reused by both import dialogs and the routes; Zod schemas for `manualAlbum` (title/artist non-empty, `imageUrl` url, `position` int 1..50) shared with the Convex mutation validators.

### Dark mode
- Hardcoded color: `rooleases/_components/import-playlist-dialog.tsx:157` `text-green-600` (use a semantic token, e.g. add a `--success` token, or `text-foreground`). Everything else uses semantic tokens (`bg-card`, `text-muted-foreground`, `bg-destructive`). `rooleases/page.tsx:~203` `text-destructive hover:text-destructive` fine.

### Toasts
- sonner used correctly. Issues: premature success (E7); `console.error` + generic "Failed to ..." toast that discards server messages in rooleases (`artist-search.tsx:48`, `artist-list.tsx:30`, `page.tsx:224`).

### Env
- Conforms. `process.env` only in `convex/rooleases.ts:518,541,542,780,798,799` (allowed). Consider the guidelines' typed env (`convex.config.ts` + `env` from `./_generated/server`), not required by AGENTS.md.

### Auth
- Findings E1-E3. Additionally: nothing in the slice sends `X-Access-Token`; the client never presents credentials to Convex. `useAuthToken` calls `/api/auth/status` in an effect on every focus. `rooleases` queries (`getYears`, `getDefaultYear`, ...) run even before `userId` is known (`rooleases/page.tsx:50-51` are not `"skip"`ped when logged out), so unauthenticated visitors still subscribe to data before the LoginPrompt renders.

### Convex (per convex-expert rules)
- `args` validators: all present. `returns` validators: missing on 16/22 `robRankings` fns (all except the 6 `getPublished*Stats/Genre` queries), 22/22 `rooleases` fns incl. both actions; `rankingSnapshots` and `albumDuels` are fully conformant.
- Public vs internal: `backfillArtistsFromTracks`, `enrichSpotifyArtists` (public actions used only for ops), `bulkUpsertArtists`, `bulkAddArtistsToYear`, `getExistingArtistIds` (used only by a server route), `upsertArtist` (unused), `getArtistsPage` (only called by the action) are public. Should be `internal*` or auth-wrapped. `rankingSnapshots` correctly uses `internalMutation` for cron fan-out; `captureUserWeek` is exported twice (`seedUserWeek = captureUserWeek`, unused alias).
- Unused exports (delete or make internal): `getYearsForUser`, `updateAlbumPosition`, `setDefaultYear` (no UI), `upsertArtist`, `seedUserWeek`.
- `v.string()` where `v.id()`/literals fit: `robRankingAlbums.status` `v.string()` with comment "none|locked|confirmed" (use `v.union(v.literal...)`; always written as "none"; the field looks dead); `artistIds` as `v.array(v.string())` is OK (Spotify ids). `getOrCreateYear.userId` etc. should vanish with E2.
- `v.optional` fields written as `undefined` through `patch` (`artistNames: undefined`, `albumId: undefined`, `robRankings.ts:767,810`) is the intended way to unset in Convex; fine.
- Schema evolution: `robRankingAlbums.source` is optional with a fallback inference function `isManualRankingEntry` (`:33-41`); finish the backfill and tighten, or document. `robRankingAlbums.userId` duplicates the year's user.
- Indexes missing: `by_published_year`, search index on `spotifyArtists.name` and `spotifyAlbums.name`.
- Query time: `rankingSnapshots` / `albumDuels` queries correctly avoid `Date.now()` (and have source tests asserting that).
- `"use node"`: none in the slice, none needed (`fetch` in default runtime; `btoa` is available). `Buffer` is used in `convex/auth.ts:19` (not a "use node" file) which only works because the runtime shims it; flag for the auth rewrite.
- Mutations that fetch: none. Actions that touch `ctx.db`: none. Import table: all correct (`./_generated/server`, `./_generated/api`).
- Pagination: `albumDuels.undoLast:371-381` loops `.paginate` inside a mutation until it finds a non-undone duel; unbounded loop in one transaction if many duels are undone. Better: index `by_user_undoneAt`/`by_user_createdAt` + take with early exit, or mark an "active head".
- `crons.ts` uses `crons.weekly`; the Convex guidelines say never use `crons.hourly/daily/weekly`; use `crons.cron("...", "0 5 * * 0", ...)`. `crons.ts:7`.
- Biome: `convex/rooleases.ts` is unformatted and imports unsorted (`pnpm check:write`).

### Tests
- AGENTS.md says "new tests use Vitest" and `pnpm exec vitest run`. Reality: `vitest.config.ts` includes only `convex/launch-*.test.ts`. Every slice test is `node:test`. `pnpm exec vitest run src/lib/ranking...` reports "No test files found".
- The node:test files are not runnable with plain `node --test` on this machine (Node 22.14: `ERR_UNKNOWN_FILE_EXTENSION`; with `--experimental-strip-types` 8 of 11 files still fail on extensionless imports like `./duel-elo`). They pass only under `pnpm exec tsx --test ...` (61/61 pass for the 8 pure-logic files). There is no `package.json` script or documented command for them. AGENTS.md states `node --test path/to/file.test.ts`, which does not work for these files.
- Coverage gaps: no tests for any `robRankings` mutation logic (position shifting in `addManualAlbumToYear`/`removeAlbumFromYear`/`batchUpdatePositions`), `replaceYearFromAlbums`, any `rooleases` function, the three API routes, or the ranking board reordering. Existing convex "source tests" (`rankingSnapshots.capture-source.test.ts`, `albumDuels.source.test.ts`) assert on regexes over source text, so they pass even if behavior is wrong, and break on rename. Convex behavior should use `convex-test` (already a devDependency) under vitest, with an edge-runtime environment, per AGENTS.md.
- E6 (stale optimistic positions) and E8 (position invariants) are reproducible as unit tests; per the bug workflow they need failing tests first.
- Duplicated logic copies (`duelElo`, `rankingOrdinals`, `rankingWeek`) each have their own tests only on the src/lib side (convex copy has `duelElo.test.ts` only).

### Code style
- `forwardRef` + `export const` for a component (`ranking-album-card.tsx:62`): AGENTS.md wants `function` declarations (React 19: `ref` is a plain prop; drop `forwardRef`).
- Non-null assertions: `rooleases/page.tsx:~246 activeYearId!`, `artist-list.tsx:75 ra.artist!.name` (Biome `noNonNullAssertion`, 3 errors + 1 warning in the slice).
- `any`: `convex/rooleases.ts:103`.
- Import ordering: Biome `organizeImports` fails in `rooleases/page.tsx`, `check-tracks-dialog.tsx`, `create-year-drawer.tsx`, `convex/rooleases.ts`, `src/lib/duel-pairing.test.ts`; formatting fails in 6 files (`pnpm check` currently reports 19 errors on this slice).
- `src/app/robs-rankings/_utils/types.ts:1` imports `"convex/_generated/dataModel"` (works through `baseUrl: "."`), while every other file uses `../../../convex/_generated/...` relative paths. Pick one (or add a `~convex` path).
- Components do not follow "main exported component first, then helpers + Skeleton" strictly: `ImportPlaylistDialog` helpers first; both `AlbumArtPreview` copies are duplicated between add/edit dialogs (extract once).
- Inline prop types: `ranking-board.tsx:15` defines a named `RankingBoardProps` used once; `rooleases/page.tsx` casts `useQuery` row types inline in `.find((y: { _id: Id<"rooYears"> }) => ...)` and `artist-search.tsx:96` annotates callback params inline; types should come from `api` return types once `returns` validators exist (`FunctionReturnType`).
- Dead/duplicate: `onImported` prop in the robs import dialog is never passed; `Bucket` type exported but only used locally.
- Karpathy guidelines: `ranking-board.tsx` re-derives the same list three times (`displayAlbums`, `albumsByBucket`, `positionToIndex`); modest.

## Suggested changes (ranked, with effort)

| # | Change | Effort |
|---|---|---|
| 1 | Make `spotify.getConnection` internal / token-free for client; add a server-side token path (E1) | M |
| 2 | Introduce auth-wrapped `customQuery/customMutation` (convex-helpers); drop all `userId` args in robRankings/albumDuels/rankingSnapshots/rooleases; add ownership checks (`yearRow.userId`); make `backfillArtistsFromTracks`, `enrichSpotifyArtists`, `bulk*`, `getExistingArtistIds`, `upsertArtist` internal (E2) | L |
| 3 | Extend `src/middleware.ts` matcher to `/robs-rankings`, `/rooleases`, `/api/spotify/*` data routes; derive userId from session in routes; stop sending Spotify tokens/userId in request bodies (E3) | M |
| 4 | Replace `getAvailableAlbums` with a search-index query (`take(50)`, `skip` until dialog opens) (E4) | M |
| 5 | Replace `searchArtists` with a search index + `take(20)` (E5) | S |
| 6 | Fix optimistic-position reconciliation and flush-on-unmount in `ranking-board.tsx` with a failing test first (E6) | M |
| 7 | Await/catch every mutation call in `robs-rankings/page.tsx`; move success toast after resolve (E7) | S |
| 8 | Use `ConvexError` for user-facing validation errors (13 sites) so messages survive in production (E12) | S |
| 9 | Index fixes: `by_userId_year` in `listYearSummariesForUser`, `by_published_year` (new) for year lookups, range query in `removeAlbumFromYear`, `take(limit)` in `getTracksAddedForYear`; batch-validate positions in `batchUpdatePositions`; delete `updateAlbumPosition`, `getYearsForUser` (E8, E11) | S-M |
| 10 | Stop `getOrCreateYear` firing on browse; create the year on first write or via an explicit "Start year" action (E8) | S |
| 11 | Fix check-tracks token staleness; remove token effect and state in `rooleases/page.tsx` (E9) | S |
| 12 | Slim `replaceYearFromAlbums` (dedupe projections, drop double RYM match) or move to a scheduled batch (E10) | M |
| 13 | Add `returns` validators to the 16 `robRankings` and 22 `rooleases` functions; derive client types from `FunctionReturnType` | M |
| 14 | Add `ui/select`/`Card`/`Field`; replace 3 raw `<select>`, 1 raw `<button>`, ad-hoc cards; convert multi-field dialogs to Drawers | M |
| 15 | Migrate 8 forms to TanStack Form + Zod; share `playlistInputSchema` + `manualAlbumSchema`; install shadcn `field` | L |
| 16 | Remove the 5 effects that violate the rule; comment the 2 legitimate ones | S-M |
| 17 | Rework `orchestrateSunday`/`captureUserWeek` into bounded, chunked, index-driven steps; replace `crons.weekly` with `crons.cron` | M |
| 18 | Test infrastructure: add a script for node:test via `tsx --test`, or migrate pure-logic tests to Vitest (`include` has only `launch-*`); add `convex-test` coverage for robRankings mutations and rooleases | M |
| 19 | Remove convex/src duplicates by importing `../src/lib/*` relatively; drop the "keep in sync" copies | S |
| 20 | Style cleanup: `pnpm check:write`, drop `forwardRef`, non-null assertions, `any`, `text-green-600`, unify image handling, date-fns | S |

## AGENTS.md corrections

1. Stack table says "shadcn/ui on **Base UI** | Not: Radix". Reality: ui primitives (button, dialog, alert-dialog, checkbox, label, popover, sheet, tooltip, tabs, slider, separator) are Radix (`components.json` is `new-york`); only `combobox` is Base UI. Either migrate (`migrate-radix-to-base`) or state "Radix today, migrating"; and tell agents not to use `asChild` in new code if the migration is planned.
2. "Tests: Vitest" and `pnpm exec vitest run`: vitest only runs `convex/launch-*.test.ts` (see `vitest.config.ts` comment). Document how node:test files run (`pnpm exec tsx --test <files>`; `node --test` fails for these) and that Convex tests exist only for Launch; or fix the config.
3. "Many existing tests use `node:test` (`node --test path/to/file.test.ts`)": that command fails here (Node 22.14, extensionless imports). Replace with the working command or add a `pnpm test:node` script.
4. Forms rule relies on shadcn `Field`, but `src/components/ui/field.tsx` is not installed (only `field-group.tsx`) and `@tanstack/react-form` is imported in 1 file repo-wide. Note it as aspirational or add the install step.
5. Auth: "`src/middleware.ts` checks the session cookie ... pass the access token via `X-Access-Token`." Reality: middleware matches only 8 route families (not Spotify tools, albums, rankings, rooleases, or `/api/spotify/*`), Convex hooks never send `X-Access-Token`, `requireAuth` is a no-op, and functions take `userId` as an arg. Document the actual model and the target model (wrapped custom functions).
6. "Code in `src/lib/` that Convex imports uses relative imports only": the repo instead duplicates into `convex/_utils/` ("Convex cannot import from src/lib"). Decide which is true; either list the duplication convention (with a sync-test) or enforce relative imports.
7. "Use indexes ... Reads are always bounded": add that `.collect()` after `withIndex` is still unbounded, and name the sanctioned pattern for per-user lists (e.g. `.take(n)` with an explicit cap + comment).
8. "tRPC and data-shaped API routes are legacy": three Spotify-integration routes in this slice (`import-robs-top-50`, `seed-artists`, `check-new-tracks`) are data-shaped writes. State the rule for routes that both call an external API and write to Convex (preferred: a Convex action that reads the stored Spotify connection).
9. Convex bullets: add "use `ConvexError` for user-facing errors", and "never `crons.weekly/daily/hourly`" (from `convex/_generated/ai/guidelines.md`), since the repo's `crons.ts` uses `crons.weekly`.
10. Features list: `/rooleases` and `/robs-rankings` are listed; `/albums` also hosts the manual-ranking snapshots and duel arena (`rankingSnapshots`, `albumDuels`). Mention that so these modules are not mistaken for robs-rankings.

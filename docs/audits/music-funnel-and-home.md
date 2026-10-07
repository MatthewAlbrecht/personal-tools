# Audit: music-funnel + home vs AGENTS.md

Date: 2026-10-07. Read-only audit (no source edited). Verified by reading code, `biome check`, `tsc --noEmit` (no errors in slice), and `npx tsx --test` (36/36 slice tests pass).

## Scope (files reviewed)

- Pages/components: `src/app/page.tsx`, `src/app/_components/{home-music-dashboard,site-header}.tsx`, `src/app/music-funnel/page.tsx`, `src/app/music-funnel/_components/*` (11 files), `src/app/music-funnel/_utils/*`.
- Convex: `convex/musicFunnel.ts` (1389 lines, 24 functions), `convex/home.ts`, `convex/_utils/musicFunnelRepeats.ts`, schema tables `musicFunnel*` (`convex/schema.ts:1102-1240`). Cross-module refs confirmed by grep: `api.spotify.getConnection` / `api.spotify.updateTokens` (used by `useSpotifyAuth`, sync route, cron).
- API/lib: `src/app/api/music-funnel/sync/route.ts`, `src/pages/api/cron/sync-music-funnel.ts` (found by grep; Pages Router), `src/lib/music-funnel-{sync,sync-utils,visit,source-run-details,backfill-album-types}.ts`, `src/lib/hooks/{use-music-funnel-visit-cursor,use-spotify-auth,use-auth-token}.ts`.
- Tests: `convex/home.test.ts`, `convex/_utils/musicFunnelRepeats.test.ts`, `src/lib/music-funnel-*.test.ts`, `src/app/music-funnel/_utils/*.test.ts`, `_components/music-funnel-config-layout-source.test.ts`.
- Pre-existing, not re-litigated: `requireAuth` (`convex/auth.ts`) is a no-op. This slice depends on it only in `convex/home.ts` (4 calls, lines 30/62/109/138); `convex/musicFunnel.ts` does not call it at all.

## Summary

| Section | Status | # findings |
|---|---|---|
| Stack table | Drift (Radix-based ui; Pages Router cron; no ThemeProvider; no Field/zod usage) | 6 |
| UI (shadcn/Base UI) | Drift (raw `<button>`/`<input>`/`<label>`; Radix `asChild`) | 5 |
| React effects | Drift (2 avoidable effects; 1 legit) | 3 |
| Forms | Non-conformant (0 of 2 forms use TanStack Form + Zod) | 3 |
| Dark mode | Non-conformant on home + header (hardcoded hex/stone/teal) | 3 |
| Toasts | Conformant | 0 |
| Env | Conformant (`~/env.js` only; no `process.env`) | 0 |
| Auth | Non-conformant / AGENTS.md inaccurate (client-supplied `userId`, unauthenticated API route) | 4 |
| Convex | Mixed: all validators present; unbounded reads, all sync mutations public, N-per-call heavy mutation | 9 |
| Tests | Drift (no convex-test coverage for musicFunnel; source-grep tests; node:test) | 3 |
| Code style | Mostly conformant; Biome has 4 errors + 4 warnings in slice | 4 |

## Errors & risks (ranked)

1. **Perpetual "Loading..." when unauthenticated / session invalid (bug).** `src/lib/hooks/use-spotify-auth.ts:106` returns `isLoading: authLoading || connection === undefined`, but the connection query is `"skip"` when `userId` is null, and Convex `useQuery("skip")` returns `undefined`. So `isLoading` never clears for a logged-out user. `src/app/music-funnel/page.tsx:73` checks `isLoading` before `!userId`, so the `LoginPrompt` (`:77`) is unreachable; `home-music-dashboard.tsx:49-51` shows `HomeSkeleton` forever instead of the "Sign in" branch (`:53`) when the cookie exists but is expired/invalid (7-day token). `/music-funnel` is not in the middleware matcher, so there is no redirect either. Fix: `isLoading: authLoading || (userId !== null && connection === undefined)`. Effort S. Needs a failing test first per project bug workflow.
2. **Unauthenticated sync endpoint that spends Spotify credentials (security).** `src/app/api/music-funnel/sync/route.ts:13-17` trusts `body.userId` with no session check; `/api/music-funnel/sync` is not in `src/middleware.ts` matcher (only `/api/migrate-*` are). Anyone who can guess/learn the userId (username from the forgeable `base64url(username:ts)` cookie) can trigger Spotify writes to the owner's playlists. AGENTS.md says to validate `X-Access-Token` with `validateSessionToken`; the route does not (`header.tsx:45` and `sources-card.tsx:106` send no token). `request.json()` is cast, not validated (`route.ts:14`) and sits outside the try, so malformed JSON is an unhandled 500. Effort S-M.
3. **Spotify OAuth tokens are delivered to the browser.** `api.spotify.getConnection` (public query, `convex/spotify.ts:651`) returns `accessToken`/`refreshToken` for any `userId`. This slice subscribes to it on every page load via `useSpotifyAuth` (`music-funnel/page.tsx:34`, `home-music-dashboard.tsx:26`). The client only needs `isConnected`/`displayName`. Effort M (new narrow query + internal query for server use). Out-of-slice file, but the slice is the consumer.
4. **Every music-funnel function is public and takes a client-supplied `userId: v.string()`.** No auth wrapper, no `requireAuth`, no identity derivation: `getSettings`, `upsertSettings`, `listSources`, `upsertSource`, `setSourceActive` (takes only `sourceId`, no ownership check at all, `musicFunnel.ts:448`), `deleteSourceRun`, `finishRun`, etc. `upsertSource` with `sourceId` patches without checking `existing.userId === args.userId` (`:417-430`). Anyone with the Convex URL can read/write/delete funnel data. Single-user app, but the AGENTS rule "auth-wrapped queries/mutations for user-scoped data" is not followed anywhere in the slice. Effort L (needs the repo-wide auth decision; do not fix piecemeal).
5. **Sync orchestration is a public-mutation chain driven from a Next route, not a Convex action.** `src/lib/music-funnel-sync.ts` calls `ConvexHttpClient` (`:47`, `:206`) and 8 public mutations (`startRun`, `startSourceRun`, `recordTrackEncounters`, `recordPlaylistWrites`, `updateSourceSnapshot`, `finishSourceRun`, `deleteSourceRun`, `finishRun`) plus 3 read queries that exist only for sync (`getWrittenTrackIds`, `listEncounterRowsForAnalytics`, `listAlbumIdsMissingSpotifyAlbumType`). They cannot be `internal*` because `ConvexHttpClient` cannot call internal functions. AGENTS.md: "Actions only for external APIs (Spotify...)" and "API routes for external integrations only" — Spotify sync is exactly the action use case. Also dependent on a `src/pages/api/cron/sync-music-funnel.ts` Pages Router file ("Not: Pages Router") that no `vercel.json` cron references; the scheduler is not discoverable in the repo, so the cron path may be dead. Effort L.
6. **Unbounded `.collect()` on growing tables in reactive queries (perf / limit risk).**
   - `getUiSummary` (`musicFunnel.ts:819-822`) collects every encounter just to take `.length`. This is the "never `.collect().length`" anti-pattern, runs on the page header, and is re-run on every encounter insert. It will throw once the user's encounters exceed the 32k-doc / 16 MiB read limit. Fix: denormalized counter (e.g. on `musicFunnelSettings` or a `musicFunnelStats` doc), updated in `recordTrackEncounters`. Effort M.
   - `listAlbumIdsMissingSpotifyAlbumType` (`:278-281`): full-table `.collect()` of encounters, called after every successful full sync (`music-funnel-sync.ts:136`). Same ceiling. Fix: index on `[userId, spotifyAlbumType]` or `.take()` batches. Effort M.
   - `loadRepeatPlaylistAddedAtByTrackId` (`:1164`), `listSources`/`loadSourceLabelMap` (`:385-395`, `:1144`), `listRunSourceRuns` (`:870`), `listSourceRunEncounters` (`:902-910`), `recordTrackEncounters` per-track `.collect()` (`:717-722`): unbounded; mostly small today but not bounded by contract.
7. **`recordTrackEncounters` does the whole playlist in one mutation.** `:659-725` loops every track: 1 indexed read + 1 insert + 1 `db.get` per new track, then 1 `.collect()` per write-candidate (candidates = all tracks in the playlist, including existing ones). A first sync of a ~3-5k track playlist approaches the 16k-write / 32k-read transaction limits, and the return payload echoes every encounter twice (`insertedEncounters` + `writeCandidateEncounters`) against the 16 MiB return limit. Chunk the call client-side (e.g. 200 tracks) or move into an action that batches. Effort M. Related: `getWrittenTrackIds` (`:964`) does one query per id from an unbounded args array.
8. **Repeat analytics silently truncated at 5000 encounters.** `listRepeats`/`listTrackRepeats`/`listAlbumRepeats`/`listArtistRepeats` use `loadEncounterRows(..., 5000)` newest-first (`:1001,1024,1059,1074`) and `listEncounterRowsForAnalytics` is capped at 5000 (`:954`). Once the table exceeds 5000, older encounters vanish: `sourceCount`, `firstSeenAt`, `becameRepeatAt` and the per-run `trackRepeatsFound` become wrong, and repeats whose first sighting aged out disappear from the UI. (Playlist-write dedupe uses the real index and stays correct.) Also each recompute reads 5000 docs with embedded `artists` arrays and is invalidated by any encounter write; `MusicFunnelMissedBanner` mounts on the Timeline tab too (`page.tsx:104`) so the heavy `listRepeats` runs even when Repeats is not shown. Effort M-L (materialize repeat rows at write time).
9. **Dangling `sourceRunId` on playlist writes.** `music-funnel-sync.ts:473-484`: when `newEncounterCount === 0` the source run is deleted via `deleteSourceRun`, but `recordPlaylistWrites` already stored `sourceRunId` on any main/repeat writes made in that same pass (e.g. after the user newly configures a destination playlist, `:437-460`). Those `musicFunnelPlaylistWrites` rows reference a deleted doc, and the returned counters report writes that are attributed to no run. Also that path returns `sourceSucceeded: false`, so `sourcesScanned` stays 0 and `syncMusicFunnel` can report `success` with `sourcesScanned: 0`. Effort S-M.
10. **No concurrency or duration guard on sync.** No `maxDuration` on the route (`route.ts`) or cron handler; sources are scanned sequentially with unbounded Spotify pagination plus many Convex round trips. Two simultaneous syncs (double tab, cron + manual) can both pass the "already written" check and both add the same tracks to the Spotify playlist before either records the write (Spotify write and Convex record are not atomic, `music-funnel-sync.ts:584-599`). Effort M.
11. Minor correctness: `listRecentListens` (`home.ts:33-50`) does not dedupe albums (the UI keys on `${albumId}-${index}`, `home-music-dashboard.tsx:237`, to paper over duplicates). `listNeedsRating` (`:66-70`) scans only the newest 40 listens and can return fewer than `limit` or none even when unrated albums exist. `listPlayNextPlaceholder` is a byte-for-byte duplicate of `listRecentlySavedForLater` (`:131-157`) and doubles the subscription. `useMusicFunnelVisitCursor(userId ?? "")` (`page.tsx:39`) runs with `""` before auth resolves and registers pagehide listeners / writes storage keys for the empty user. `upsertSource` has no duplicate check although `by_userId_spotifyPlaylistId` exists and is never queried (`schema.ts:1131`). `upsertSource` PATCH sets `notes: undefined` to clear, which is correct for patch, fine.

No `Date.now()` in queries, no `.filter()`, no `fetch` in mutations, no `"use node"` misuse, no `_creationTime` in an index, no `v.string()` for document ids (ids are `v.id(...)`), all functions are object-form and import from `./_generated/server`. Schema evolution: `kind` and `spotifyAlbumType` were added as `v.optional` (correct); `toSourceReturn` normalizes legacy `kind`.

## Convention drift by AGENTS.md section

### Stack table
- **Radix, not Base UI.** `src/components/ui/{button,dialog,tabs,label,checkbox,select,...}.tsx` import `radix-ui`; only `combobox.tsx` uses `@base-ui/react`. `button.tsx` uses Radix `Slot` (`asChild`); the slice relies on it (`page.tsx:31,34`, `home-music-dashboard.tsx:99`). Base UI has no `asChild` (uses `render`), so a Base UI migration of Button breaks these. Do not edit by hand; this is a repo-level migration decision.
- **Pages Router:** `src/pages/api/cron/sync-music-funnel.ts` (with 6 sibling cron files) uses `NextApiRequest`. Needed change: port to `src/app/api/cron/*/route.ts` or, better, a Convex cron + internalAction (see risk 5).
- **tRPC:** `TRPCReactProvider` still wraps the root layout; slice does not use it. OK.
- **Dates:** `music-funnel-header.tsx:94` uses `new Date(...).toLocaleString()`; `formatRelativeTime` in `src/lib/utils.ts:8` is hand-rolled date math (used by `timeline.tsx`). Both should be date-fns (`format`, `formatDistanceToNow`).
- **Forms:** TanStack Form is installed but used in 1 file repo-wide (`src/app/books/page.tsx`); `zod` installed; the shadcn `Field` component named in AGENTS.md does not exist in `src/components/ui/` (only a local `field-group.tsx`).
- **Env:** conformant (`~/env.js` in `route.ts:3`, `music-funnel-sync.ts:2`; no `process.env`).
- **Theming:** `next-themes` is imported only by `sonner.tsx`; there is no `ThemeProvider` in `src/app/layout.tsx` (`<html>` has no `suppressHydrationWarning`/class handling). No `.dark` class is ever applied, so every `dark:` variant in the slice (`repeat-lists.tsx:155-160`, `source-run-details.tsx:58`, `new-chrome.tsx:9`, `sources-card.tsx:~292`) is inert.

### UI rules
- Raw `<button>`: `music-funnel-header.tsx:121,133` (tab switcher, should be shadcn `Tabs` — `tabs.tsx` exists), `music-funnel-repeat-lists.tsx:53` (type filter, `Tabs` or `ToggleGroup`), `music-funnel-timeline.tsx:93` (expand row, use `Button variant="ghost"` or `Collapsible`).
- Raw `<input type="radio|checkbox">` + `<label>`: `music-funnel-sources-card.tsx:329-350` (Kind radio) and `:420-431` (Active). Use shadcn `RadioGroup` / `Checkbox` (checkbox.tsx exists) inside `Field`.
- `<Label>` without `htmlFor` for the Kind and Curator fields (`sources-card.tsx:322,385`) is an a11y gap.
- Drawer over Dialog: conformant (`music-funnel-config-drawer.tsx` uses `Drawer`).
- Images use `next/image`: conformant. Icons: `lucide-react` only, conformant. `cn()` used for conditionals: conformant.
- Ad-hoc bordered cards on home: `home-music-dashboard.tsx:~105, ~160` hand-build `rounded-2xl border ... bg-[#f7f6f3]` surfaces instead of `Card` (exists at `ui/card.tsx`).

### React effects
- `music-funnel-settings-card.tsx:26-29`: effect copies `settings` into state. No outside system. Replace with a `key` on `settings?.updatedAt` (remount) plus `defaultValues` in the TanStack form.
- `music-funnel-curator-combobox.tsx:30-32`: effect mirrors `value` into `filter` state. Derive, or key the combobox by the selected curator, or let the combobox own `inputValue`.
- `use-music-funnel-visit-cursor.ts:15-48`: legitimate (sessionStorage/localStorage + pagehide/visibilitychange), but missing the one-line "syncs with browser storage" comment, assigns an unused `sessionValue` (`:23`), and `setVisitSince` after reading storage could be `useSyncExternalStore`. Minor.
- No effect-driven fetching in the slice (but `use-auth-token.ts:15` fetches `/api/auth/status` in an effect, violating "never fetch in an effect"; shared hook, out of slice, root cause of risk 1).

### Forms
- `music-funnel-settings-card.tsx` and `music-funnel-sources-card.tsx` are `useState`-driven with hand-rolled validation (`sources-card.tsx:~114-117`, `toast.error("Playlist ID and display name are required")`), `type="button"` + `onClick` save instead of `<form onSubmit>`. Required: a Zod schema (shared with the Convex args where practical; `parseSpotifyPlaylistId` as a transform), TanStack Form, `Field` errors. Settings card: 2 inputs; Sources card: 7 fields + conditional logic (one-off vs recurring), roughly 1 day.
- `spotifyPlaylistIdInputProps` (`_utils/spotify-playlist-id-input.ts`) hijacks `onPaste`/`onBlur`; becomes a Zod `.transform` plus `onBlur` normalization in the form.
- Convex-side: `upsertSource` trims strings itself (`musicFunnel.ts:421-425`) with no validation of non-empty `displayName` or playlist id shape.

### Dark mode
- `home-music-dashboard.tsx`: 28 hardcoded color classes (`bg-[#e9e8e4]`, `bg-[#f7f6f3]`, `text-stone-*`, `text-teal-*`, `bg-teal-900`, an inline SVG noise `style`), no `dark:` variants. Renders a light page on a dark theme.
- `site-header.tsx:13,18`: `bg-[#efeeea]/90`, `text-stone-950`, `border-stone-900/10`. Combined with no `ThemeProvider`, the whole app header is light-only.
- `page.tsx:14` hardcodes `oklch(...)` gradients (acceptable decorative, but should be tokenized).
- Music-funnel components use semantic tokens (`bg-muted`, `text-muted-foreground`, `border-border`) plus palette colors with explicit `dark:` variants (amber/teal/rose/violet in `new-chrome`, `repeat-lists`, `source-run-details`); these are fine once ThemeProvider exists.

### Toasts
Conformant: `sonner` `toast` in `header.tsx`, `settings-card.tsx`, `sources-card.tsx`; `<Toaster />` mounted once in `src/app/layout.tsx:39`. One nit: success toast after `upsertSource` for a one-off whose sync fails shows an error even though the source saved (message handles it).

### Env
Conformant. Slice reads env only via `~/env.js`.

### Auth
- Slice uses a client-fetched `userId` (`useAuthToken` → `/api/auth/status`, which decodes the unsigned base64 cookie) and passes it as a Convex arg everywhere. AGENTS.md describes an `X-Access-Token` header flow for API routes/Convex; the slice uses neither (`ConvexReactClient` in `src/providers/ConvexProvider.tsx` cannot send custom headers; `ConvexHttpClient` in the sync lib sends none). `validateSessionToken` is not called by any slice file.
- `src/middleware.ts` protects neither `/music-funnel` nor `/api/music-funnel/sync` (matcher lists books, folio-society, articles, concerts, birthdays, playlist-lyrics, two migrate APIs). `/` is gated by a server-side cookie-presence check only (`page.tsx:7-8`), consistent with middleware but not validity.
- `home.ts` calls `requireAuth(ctx)` (no-op, noted); `musicFunnel.ts` does not call it at all, so even the nominal check is absent. Home's `requireAuth` calls give false assurance.

### Convex
- Validators: every registered function has `args` and `returns` (conformant, including `v.literal` unions and `v.id`). `handler` return annotations exist where self-referencing. `getUiSummary`/`listSourceRunEncounters` etc. return `null`-safe shapes; optional fields returned as `undefined` inside objects is fine (`v.optional`).
- Indexes: all reads use `withIndex`; no `.filter()`.
- Public vs internal: 14 of 24 functions in `musicFunnel.ts` are sync plumbing, public only because of the `ConvexHttpClient` architecture (risk 5). Dead public surface: `listRecentRuns`, `listRunSourceRuns`, `listTrackRepeats`, `listAlbumRepeats`, `listArtistRepeats` are referenced by no file in src/, scripts/, convex/ (grep). Delete or make internal.
- "Thin public functions; logic in `convex/model/`": `musicFunnel.ts` holds ~600 lines of helper logic (`buildTrackRepeats`, `buildAlbumRepeats`, `buildArtistRepeats`, `loadEncounterRows`) in the public-function file; `convex/model/` does not exist; the repo has `convex/_utils/`. Pure logic is duplicated between `convex/musicFunnel.ts` (repeat building) and `src/lib/music-funnel-sync-utils.ts` (`computeTrackRepeatSummaries` etc.); two implementations of repeat detection can drift.
- Unused import `MutationCtx` (`musicFunnel.ts:3`); `Biome` does not flag it.
- Timestamps: Unix ms: conformant. `userId: v.string()` is the established project convention.
- `home.ts`: `args` has a bounded `limit` via `clampLimit`; reads are bounded; `rows = []` (implicit evolving `any[]`) at `:39,73`.
- `ctx.db.get(id)` / `patch(id, …)` use the legacy one-arg signature; guidelines for `convex ^1.41` show the table-name form (`ctx.db.get("users", id)`). Works today; repo-wide.

### Tests
- No `convex-test` coverage for `convex/musicFunnel.ts` (24 functions; none of the mutations, bounded reads, repeat logic or `listSourceRunEncounters` userId guard is exercised). Only pure helper tests (`musicFunnelRepeats.test.ts`, `music-funnel-sync-utils.test.ts`).
- `convex/home.test.ts` and `music-funnel-config-layout-source.test.ts` are source-grep tests (regex over file text); they assert implementation strings (`.take(`, index name) not behavior, and the latter pins "no `<Card`" markup. Brittle; replace with `convex-test`.
- All slice tests use `node:test`, run via `tsx`/`node --test` (plain `node --test` fails on `.ts` in Node 22.14: `ERR_UNKNOWN_FILE_EXTENSION`; needed `npx tsx --test`). `vitest.config.ts` only includes `convex/launch-*.test.ts`, so `pnpm exec vitest run` (AGENTS.md's test command) runs none of this slice. AGENTS.md: "new tests use Vitest" — none of the slice's tests do, and there is no `test` script that runs them.
- No test for the sync route / `music-funnel-sync.ts` orchestration (`syncMusicFunnel`, `syncMusicFunnelSource`), which is the highest-risk code.

### Code style
- Biome (`npx biome check` on the slice): 4 format errors (`music-funnel-visit.ts`, `music-funnel-visit.test.ts`, `convex/_utils/musicFunnelRepeats.ts`, `route.ts:58`) and 4 `useSortedClasses` warnings (`site-header.tsx:18`, `home-music-dashboard.tsx:90,121`, `source-run-details.tsx:58`). `pnpm check:write` fixes all.
- `type` aliases, kebab-case files, tab indentation, `function` declarations: conformant. Missing explicit return types on exported components (`MusicFunnelHeader`, `MusicFunnelTimeline`, `MusicFunnelSourcesCard`, `HomeMusicDashboard`, `SiteHeader`, `MusicFunnelConfigDrawer`, etc.) — AGENTS says "explicit return types on exported functions"; most hooks/utils comply, components do not.
- Main component first, helpers after: conformant everywhere. `ComponentNameSkeleton` convention: `HomeSkeleton` should be `HomeMusicDashboardSkeleton`.
- `body as {…}` and `as Id<...>` casts at `route.ts:14,49` and `use-spotify-auth.ts:35` (`as SpotifyConnection | null | undefined`): replace with Zod parse / typed query. No `any`.
- Dead code: `sessionValue = String(resolved)` (`use-music-funnel-visit-cursor.ts:23`), `listPlayNextPlaceholder` ("Phase 3" comment).

## Suggested changes (ranked, with effort)

| # | Change | Fixes | Effort |
|---|---|---|---|
| 1 | Fix `useSpotifyAuth` `isLoading` for skipped query; add a regression test (extract the pure `isLoading` rule to `src/lib/`) | Risk 1 | S |
| 2 | Auth-gate `/api/music-funnel/sync` (validate session cookie/`X-Access-Token` with `validateSessionToken`, derive `userId` server-side, Zod-parse body, add to middleware matcher, set `maxDuration`) | Risks 2, 10 | S-M |
| 3 | Replace `getUiSummary` encounter `.collect()` with a denormalized counter; bound `listAlbumIdsMissingSpotifyAlbumType` with an index + `.take()` | Risk 6 | M |
| 4 | Stop returning tokens from a public query; expose a token-free `isConnected`/`displayName` query for clients, keep tokens behind an internal function | Risk 3 | M |
| 5 | Chunk `recordTrackEncounters` (client-side batches of ~200, or action), trim return payload | Risk 7 | M |
| 6 | Fix dangling `sourceRunId`: do not delete the source run if any writes were recorded for it (or null out `sourceRunId`) | Risk 9 | S-M |
| 7 | Add `ThemeProvider` (next-themes, `attribute="class"`) to layout; convert `home-music-dashboard.tsx` and `site-header.tsx` to semantic tokens | Dark mode | M |
| 8 | Convert the 2 config forms to TanStack Form + Zod (`Field`, `RadioGroup`, `Checkbox`); remove the 2 forbidden effects | Forms, effects | M |
| 9 | Replace raw `<button>`/`<input>`/`<label>` with `Tabs`/`ToggleGroup`/`Checkbox`/`RadioGroup` | UI | S-M |
| 10 | Materialize repeat rows at write time (or paginate + remove the 5000 cap); lazy-mount `MissedBanner` data | Risk 8 | L |
| 11 | Move sync into a Convex `internalAction` + internal mutations (and a Convex cron), delete the Pages-Router cron and public plumbing mutations | Risks 4, 5 | L |
| 12 | Add `convex-test` suites for `musicFunnel.ts` and `home.ts`; replace source-grep tests; add vitest `include` (or a `test` script) so slice tests actually run | Tests | M |
| 13 | Delete dead public functions (`listRecentRuns`, `listRunSourceRuns`, `list{Track,Album,Artist}Repeats`, `listPlayNextPlaceholder` dup); drop unused `MutationCtx` | Convex hygiene | S |
| 14 | `pnpm check:write`; use date-fns for dates; explicit return types on exported components | Style | S |
| 15 | `listRecentListens` dedupe by album; `listNeedsRating` widen/paginate window | Risk 11 | S |

## AGENTS.md corrections

1. **UI stack row** says shadcn on Base UI, "not Radix". Reality: all `src/components/ui` primitives except `combobox` are Radix (`radix-ui` + `@radix-ui/*` in `package.json`), and `Button` uses `asChild`. Either state the true current state ("migrating; Radix today") or perform the migration. Do not leave agents writing `render={}` props that the installed Button does not support.
2. **Theming row / Dark mode rules** assume a root `ThemeProvider`; none exists in `src/app/layout.tsx`. Add it or note the gap.
3. **Auth section** ("pass the access token via `X-Access-Token`; validate with `validateSessionToken`") does not describe how Convex hooks work: `ConvexReactClient` cannot send that header, and the slice (and by grep most of the app) passes a client `userId` arg instead. Document the actual model (cookie + `userId` arg, `requireAuth` is a no-op, API routes under `/api/spotify/*` use `X-Access-Token`) and the threat model (single-user, unsigned cookie), or fix it. The "Auth-wrapped queries/mutations" Convex rule currently has zero implementations to copy.
4. **Convex "Actions only for external APIs ... API routes for external integrations only"** vs reality: Spotify sync runs in a Next route using `ConvexHttpClient` and public mutations (`music-funnel-sync.ts`). Clarify which is canonical; mark the Next-route pattern legacy if so.
5. **Tests**: `pnpm exec vitest run` only runs `convex/launch-*.test.ts` (see `vitest.config.ts`); the other `node:test` files (331 test files in repo, most outside the vitest include) need `npx tsx --test <file>` (plain `node --test` on `.ts` fails on Node 22.14). Document the working command and add a package.json `test` script. Also AGENTS.md's `// @vitest-environment edge-runtime` note conflicts with the config's global `environment: "edge-runtime"`.
6. **Layout section** omits `src/pages/api/cron/*` (Pages Router, 7 files) which contradicts "Not: Pages Router" and the "API routes only for external integrations" rule. List it as legacy or migrate.
7. **Forms rule** references shadcn `Field`; `src/components/ui/field.tsx` does not exist (only a local `field-group.tsx`). Add it via `pnpm dlx shadcn@latest add field` or fix the wording.
8. **Convex layout** says "reusable business logic lives in `convex/model/`"; the repo uses `convex/_utils/` and has no `model/` dir. Align the doc or the code.
9. **Convex client rule** "Never fetch in an effect" is violated by the shared `use-auth-token.ts` and `auth-context.tsx`; either call out the exemption or move auth status to a Convex/Next server read.
10. **Explicit return types on exported functions**: nearly every exported React component in the slice omits them. Clarify whether components are exempt (JSX return inference).

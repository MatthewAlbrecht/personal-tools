# Audit: playlist tools (spotify-playlister, smart-playlists, playlist-lyrics) vs AGENTS.md

Audited 2026-10-07, read-only. Verified by reading source, grep, and running `pnpm typecheck` (clean), `biome check` on the slice (26 errors, see Style), and the slice's node:test files via `pnpm exec tsx --test` (63/63 pass).

## Scope (files reviewed)

- Pages/components: `src/app/spotify-playlister/**` (page.tsx 1177 lines, 6 components, `_hooks/use-spotify-player.ts`), `src/app/smart-playlists/**` (page, `new`, `[id]/edit`, recipe-form/card/list, genre-clause-list, sliders), `src/app/playlist-lyrics/**` (list, editor 1311 lines, reader, zine, sync dialog, `_utils/song-display*`). Public mirrors `src/app/public/playlist-lyrics/**` only for how they call Convex.
- Convex: `convex/smartPlaylists.ts`, `convex/playlistLyrics.ts`, `convex/spotify.ts` (only slice-used functions: connection, playlists, categorizations, userTracks, pending suggestions, sync logs/runs, upsertAlbum), `convex/migrate.ts` (0 bytes), `convex/schema.ts` (relevant tables), `convex/_utils/smartPlaylist*`, `convex/_utils/playlistLyrics.ts`, `convex/_utils/forLaterFilterProjection.ts`, `convex/auth.ts`. Also touched via calls: `rateYourMusicScrapes.listRateYourMusic{Genre,Descriptor}Keys`, `geniusCreditLabels.*ForSync`.
- API routes: `src/app/api/spotify/**` (all 20), `src/app/api/smart-playlists/{create,sync}`, `src/app/api/playlist-lyrics/{add-song,rescrape-song,_utils}`, `src/app/api/migrate-playlist-lyrics`, `src/app/api/auth{,/status}`, `src/middleware.ts`, `src/pages/api/cron/sync-smart-playlists.ts` (+ sync-spotify skim).
- Lib: `src/lib/spotify.ts`, `spotify-sync.ts`, `smart-playlists-sync.ts`, `smart-playlists/*`, `hooks/use-spotify-auth.ts`, `hooks/use-auth-token.ts`, `parse-spotify-playlist-id.ts`.
- Tests: `src/lib/smart-playlists/*.test.ts`, `convex/_utils/{smartPlaylist*,playlistLyrics}.test.ts`, `convex/smartPlaylists.for-later-genre-source.test.ts`, `src/app/playlist-lyrics/_utils/song-display.test.ts`, `src/lib/zine/playlist-spotify-track-sync.test.ts`.

Note on `requireAuth` (convex/auth.ts) being a no-op: not re-litigated. Dependence in this slice: `playlistLyrics.ts` has 38 `requireAuth(ctx)` calls that do nothing; `smartPlaylists.ts` and almost all of the slice's `spotify.ts` functions do not call it at all and trust a client-supplied `userId`. So the Convex layer here enforces zero authorization; the only gate is the Next middleware, and that gate does not cover most of this slice (E1).

## Summary table

| AGENTS section | Status | # findings |
|---|---|---|
| Stack table | Drift | 8 |
| UI (shadcn / Base UI) | Drift | 7 |
| React effects | Drift | 5 |
| Forms (TanStack Form + Zod) | Non-conformant | 4 |
| Dark mode | Minor drift | 3 |
| Toasts | Conformant (sonner everywhere, no `alert`) | 0 |
| Env | Mostly conformant | 2 |
| Auth | Non-conformant / unsafe | 6 |
| Convex | Non-conformant | 14 |
| Tests | Drift | 4 |
| Code style | Drift | 6 |
| AI SDK / Spotify OAuth (special attention) | Risky | 9 |

## Errors & risks (ranked)

Severity: P0 = exploitable or data-loss today, P1 = real bug or will break at scale, P2 = latent.

### P0

**E1. Spotify access AND refresh tokens are readable by anyone who can reach the Convex deployment.**
- `convex/spotify.ts:651` `getConnection` is a public `query` taking `userId: v.string()` and returning the whole `spotifyConnections` doc (`accessToken`, `refreshToken`). `:1608` `getAllConnections` is a public no-arg query that returns every connection (unbounded `.collect()`), and nothing in `src/` or `convex/` calls it (dead). `:608 upsertConnection`, `:661 updateTokens`, `:690 deleteConnection` are public mutations with no ownership check, so tokens can be overwritten or deleted by anyone.
- `userId` is just `AUTH_USERNAME` (see E3), which is guessable. `NEXT_PUBLIC_CONVEX_URL` is public by design.
- The browser itself subscribes to the token doc: `src/lib/hooks/use-spotify-auth.ts:32-35` (`SpotifyConnection` type includes `refreshToken`, lines 8-18). A refresh token should never reach the client.
- Fix: make token functions `internalQuery`/`internalMutation` (add `returns`), expose access to them only through a server-only path (Convex action holding `SPOTIFY_CLIENT_ID/SECRET` in Convex env, or a shared-secret arg checked against `process.env` in convex/), return only `{ isConnected, displayName, spotifyUserId }` to the client, and delete `getAllConnections`. Effort: M-L (touches `refresh-token` route, 3+ cron handlers, `use-spotify-auth`, page.tsx).

**E2. Middleware does not protect most of this slice; several routes are open to the internet.**
- `src/middleware.ts` matcher covers only `/playlist-lyrics*`, `/lyrics/playlists*`, `/api/migrate-playlist-lyrics`, `/api/migrate-lyrics` (+ books, etc.). It does NOT cover `/spotify-playlister`, `/smart-playlists`, any `/api/spotify/*`, `/api/smart-playlists/*`, or `/api/playlist-lyrics/*` (the last two do their own `session` cookie presence check; the Spotify ones do none).
- `POST /api/spotify/refresh-token` (`src/app/api/spotify/refresh-token/route.ts:6-54`): unauthenticated; takes any `userId` in the JSON body and returns that user's Spotify access token (and refreshes it). This is a direct account-token leak.
- `POST /api/spotify/categorize` and `/generate-playlist-description` (and `/backfill-playlist`): unauthenticated OpenAI calls, no body size limits, no rate limit. Anyone can burn OpenAI credit. `categorize` fans out `Promise.allSettled` over `ceil(playlists/4)` parallel `generateObject` calls with an unbounded caller-supplied `playlists` array (`categorize/route.ts:49-75`).
- Remaining Spotify routes only proxy a caller-supplied Spotify bearer, which is low impact on its own; `sync-history` and `smart-playlists/{create,sync}` additionally trust a body `userId` and write to Convex with it.
- Fix: add all of `/spotify-playlister`, `/smart-playlists`, `/api/spotify/*` (except `callback`, which must stay reachable), `/api/smart-playlists/*`, `/api/playlist-lyrics/*` to the matcher AND validate the session in the route (the middleware only checks cookie presence, see E3). Effort: S for matcher, M for per-route validation.

**E3. Spotify OAuth flow weaknesses** (`src/app/api/spotify/auth/route.ts`, `callback/route.ts`).
- No `state` parameter, so the callback is CSRF-able: an attacker can link their Spotify account to the victim's session by getting the victim to open a crafted `/api/spotify/callback?code=...` URL (`auth/route.ts:19-25`, `callback/route.ts:10-23`).
- Callback derives `userId` by base64-decoding the `session` cookie with no validation or expiry check (`callback/route.ts:68-83`). The session cookie itself is `base64url("username:timestamp")` with no signature (`src/app/api/auth/route.ts:17-19`; `SESSION_SECRET` is declared in env.js but unused), so any visitor can forge a cookie for any `userId` and bind their own Spotify account to it. Pre-existing auth design; flagging the slice's reliance on it.
- `?error=${error}` is interpolated unencoded into a redirect URL (`callback/route.ts:15`).
- Scopes include `user-read-email` (profile `email` is never used) and `show_dialog: "true"` on every connect.
- Fix: generate a random `state`, store in an httpOnly cookie, verify on callback; validate session via `validateSessionToken`/a signed cookie; `encodeURIComponent` the error; drop unused scope. Effort: M.

**E4. playlist-lyrics Convex surface is fully unauthenticated and includes whole-table dump/replace endpoints.**
- Every `playlistLyrics.*` call is `requireAuth` (no-op). `getBySlug` (`:327`) returns drafts, private `notes`, scrapes; draft slugs are `untitled-playlist-${Date.now()}` (`:467`), guessable. The "private vs public" split in the zine component is UI-only (`playlist-lyrics-zine.tsx:100-ish` `canEdit = variant === "private"`; the public route mounts the same component and all ~15 mutation hooks).
- Migration helpers are public: `listForSync` (`:1512`, unbounded `.collect()` of every playlist plus every lyric scrape; will eventually exceed the 16 MiB read limit), `upsertPlaylistForSync` (`:1545`), `replaceItemsForSync` (`:1600`, deletes all items of a playlist). Anyone with the deployment URL can wipe playlists.
- Fix: mark the three `*ForSync` functions `internal*` and run the dev-to-prod sync via a script using admin auth (there is already `scripts/migrate-lyrics-to-prod.js`), and gate the rest as soon as a real Convex auth/secret exists. Effort: M.

### P1

**E5. Real bug: categorization cache stores `undefined` suggestions.** `src/app/spotify-playlister/page.tsx:589` writes `data.suggestedPlaylists as PlaylistSuggestion[]`, but `categorize/route.ts:111` returns a bare array on success (only the empty case returns `{ suggestedPlaylists: [] }`, `:100`). Line 570 handles both shapes, line 589 does not. Result: after a successful categorize, re-selecting that track in-session restores `reviewState.suggestions === undefined` (page.tsx ~398-416), and the effect at `:360` will not repair it because it only fills the cache when `!cached`. Per CLAUDE.md bug workflow: write a failing test first (extract the response normalisation into `src/lib/`), then fix; also make the route always return `{ suggestedPlaylists }`.

**E6. AI-suggested `trackId`s are added to the user's Spotify playlist without validation.** `backfill-playlist/route.ts:87-125`: the model is told to return `trackId` "EXACTLY as provided", but results are only filtered by confidence. Client confirm (`page.tsx` ~`isValidSpotifyId` = format check only) will happily add a hallucinated 22-char id. Filter `object.matches` to the ids sent in that batch before returning. Same class in `categorize/route.ts`: returned `playlistId` is never checked against the supplied playlists. Effort: S each.

**E7. Unbounded Convex reads that will hit the 16 MiB / 32k-doc limit as data grows (all reactive, re-run on every write).**
- `convex/spotify.ts:1263 getRecentlyPlayedTracks`: `.withIndex("by_userId_lastPlayedAt").order("desc").collect()` then `.filter().slice(limit)` (`:1276`). Use `.take(limit)` (undefined `lastPlayedAt` sorts last in desc). The page calls it on every load and upserts 50+ rows each time, invalidating it.
- `:1351 getLikedTracksHistory`: collects all `userTracks` for the user and sorts in JS (`:1361`); needs index `by_userId_lastLikedAt` (add as `staged: true`, per guidelines, if the table is large).
- `:922 getCategorizations`: `.collect()` when no `limit` (`:935`), and page.tsx:59 passes none; then N canonical lookups. `:1032 searchCategorizations` (unused) collects all. `:1578 getRecentSyncRuns` collects all then slices; `:1531 getPendingSyncLogs` collects rows holding full `rawResponse` strings.
- `convex/smartPlaylists.ts`: `resolveForLaterMatches` (`:163`) collects every active for-later library item (`.collect()`), `resolveRankingsMatches` (`:292`) collects the user's entire `albumLibraryItems`, `loadUserAlbumByAlbumId` (`:143`) collects all `userAlbums`, and `loadRymGenreParentKeysByChild` (`forLaterFilterProjection.ts:59`) collects the entire genre-relationship table, on every filter edit in the form (`previewMatches` is a live query, re-run each keystroke because `previewNow` changes with every `patchFilters`, recipe-form.tsx:140). Add narrower indexes/denormalized fields, cap, or compute preview via paginated reads; at minimum drop `now` from args when no relative window is active.
- `listRecipes` (`:485`), `listActiveRecipesForUser` (`:735`), `playlistLyrics.listPublic` (`:313`, collect then `slice(limit)`), `getPlaylists`/`getActivePlaylists` (`spotify.ts:760,772`): bounded in practice but violate the "never unbounded" rule; add `.take(n)`.

**E8. Smart-playlist sync stores unbounded arrays and is non-atomic.**
- `smartPlaylists.syncedTrackUris` / `syncedAlbumIds` (schema.ts:469-490, commit at `smartPlaylists.ts:674`) are `v.array(v.string())` of every synced track. Convex arrays cap at 8192 entries and the guidelines forbid unbounded arrays in a doc. A recipe matching more than 8192 tracks makes `commitSyncSuccess` throw after the Spotify playlist has already been rewritten, leaving Convex state stale and the next run re-diffing against an old baseline. Replace with a content hash plus a child table, or store only `contentHash` + counts for `mirror` mode.
- `src/lib/smart-playlists-sync.ts:74-86` loads per-album track URIs with one Convex query per matched album, sequentially, plus a Spotify call per album when canonical rows are incomplete (`:259-263`). 500 albums means 500+ sequential round trips inside a Next route with no `maxDuration`/timeout. Batch into `listCanonicalTrackUrisByAlbums`.
- No lock: manual sync, create-time sync and the cron can interleave. `replaceAll` (`:129-134`) does PUT of first 100 then POSTs the rest; failure mid-way leaves a truncated playlist while recipe state is unchanged.
- `create/route.ts:69-95` creates the Spotify playlist before inserting the recipe; an insert failure orphans a playlist.
- `src/pages/api/cron/sync-smart-playlists.ts` exists but no schedule invokes it: `vercel.json` has only `sync-folio` and `send-birthday-reminders`; `convex/crons.ts` and `infra/` have nothing for it. Confirm where it is scheduled; if nowhere, "mirror" recipes only update on manual sync.

**E9. `playlistLyrics.listForSync` + `/api/migrate-playlist-lyrics` is a read-all-and-replace sync run from a UI button** (`playlist-lyrics-list.tsx:62-70`, route lines 28-110). One query returns all playlists plus all scrapes (lyrics text) in one response; one mutation deletes and reinserts all items per playlist. It also depends on E4's public endpoints on the prod deployment. Belongs in `scripts/`.

**E10. `saveCategorization`/`upsertPlaylist`/`savePendingSuggestions` look up by non-user keys.** `spotify.ts:859` (`by_trackId` only, legacy index), `:1431` (`by_trackId`), `upsertPlaylist` uses `by_spotifyPlaylistId` only (`:718`), so a second `userId` would overwrite the first user's rows. `updatePlaylistDescription`/`togglePlaylistActive`/`deletePlaylist` take a bare doc id with no ownership check (`:776-812`). Harmless with exactly one user, wrong by construction.

### P2

- E11. `convex/spotify.ts` slice functions have no `returns` validators (verified 34 of 34 sampled; file has 20 `returns:` across 77 exports) and several return raw docs (`getConnection`, `getPendingSuggestions`, `getTrackByUserAndTrackId`). `syncType`/`status`/`source`/`confidence` are `v.string()` where fixed sets are used (`spotifySyncLogs`, `spotifySyncRuns`, aiSuggestions `confidence`); use `v.union(v.literal(...))`.
- E12. `spotifySyncLogs.rawResponse` (full recently-played JSON, `spotify-sync.ts:98-102`) is written on every sync with no retention/cleanup; unbounded growth. Add a cron prune.
- E13. `src/lib/spotify.ts`: no 429/`Retry-After` handling, no 401 retry, no timeouts, response body echoed into thrown errors, ids interpolated into paths without encoding, mixed `/tracks` (deprecated path) and `/items` endpoints (`addTracksToPlaylist` vs `addItemsToPlaylist` duplicate each other), `unfollowPlaylist` is dead (`recipe-card.tsx:137` calls Spotify directly). `liked-tracks/route.ts:6` `parseInt` with no radix/NaN check, and the page only ever loads offset 0 (first 50 likes).
- E14. `src/lib/spotify.ts` is imported by client components (`sync-spotify-playlist-dialog.tsx:20`, `getAllPlaylistTracks`) while it imports `~/env.js` (server secrets) and `Buffer`. Works today only because the client path never touches `env`. Split into `spotify-api.ts` (pure fetch helpers) and `spotify-token.ts` (`import "server-only"`), and keep browser Spotify calls out (three places call `api.spotify.com` from the browser: `use-spotify-player.ts:235`, `recipe-card.tsx:137`, `page.tsx:987`).
- E15. Token-refresh logic is copy-pasted in `refresh-token/route.ts`, `cron/sync-smart-playlists.ts:30-50`, `cron/sync-spotify.ts`, and others; extract one `getValidAccessToken(userId)`.
- E16. `page.tsx` effect at `:351-357` re-runs the 3 Spotify fetches plus upserts whenever `connection` changes identity (every token refresh patches the doc, which re-emits the reactive query, which changes `getValidAccessToken`, `fetchRecentTracks`, etc.).
- E17. `createDraft` slug collision possible within the same millisecond (`playlistLyrics.ts:467`, no uniqueness check); `reorderItems` and `updateZinePageRecommendations` have no callers (dead); `convex/migrate.ts` is an empty file; `smartPlaylists.migrateFiltersToV2` (`:768`) is a spent one-off (schema validator only accepts V2, so legacy docs cannot exist post-deploy), and does an unbounded `.collect()`.
- E18. `fetch(canonicalUrl)` to Genius has no timeout/size cap (`api/playlist-lyrics/_utils.ts:38`); host is correctly restricted to genius.com (`normalizeGeniusSongUrl`), so no SSRF.

## Convention drift by AGENTS.md section

### Stack table
- **Radix, not Base UI (repo-wide, felt in slice).** 12 of 13 shadcn files that import a primitive use Radix (`src/components/ui/{button,dialog,alert-dialog,select,slider,checkbox,tooltip,popover,tabs,sheet,dropdown-menu,label,separator}.tsx`; only `combobox.tsx` is Base UI). `package.json` has `radix-ui` and 8 `@radix-ui/*` packages. Slice uses the Radix API in 11 places: `asChild` at `spotify-connection.tsx:31`, `playlist-manager.tsx:769,792`, `recipe-form.tsx:740`, `recipe-list.tsx:32,51`, `recipe-card.tsx:200,223`, `[id]/edit/page.tsx:61`, `playlist-lyrics-list.tsx:168`, `playlist-lyrics-zine.tsx`. Either migrate (skill `migrate-radix-to-base`) or fix AGENTS (see corrections).
- **tRPC** not used in slice (conformant). **API routes for data**: `/api/spotify/{recent-tracks,liked-tracks,playlists,currently-playing,album*,artist-albums}`, `/api/smart-playlists/{create,sync}`, `/api/playlist-lyrics/*` are internal data/action endpoints, not "external integrations"; AGENTS says "don't extend". The AI routes (`categorize`, `generate-playlist-description`, `backfill-playlist`) are API routes though AGENTS says AI belongs in Convex actions.
- **AI**: `ai@^5.0.108` + `@ai-sdk/openai@^2.0.80`. `@ai-sdk/openai` is not in the AGENTS table (needed provider package; add it). `generateObject` still works in v5 but is deprecated in v6; hard-coded dated model id `gpt-5-nano-2025-08-07` in 3 files (`categorize:69`, `backfill-playlist:88`, `generate-playlist-description:31`); no `maxOutputTokens`, `abortSignal`, `maxRetries`, or `maxDuration`. `openai(...)` reads `OPENAI_API_KEY` from `process.env` implicitly rather than from `~/env.js`; use `createOpenAI({ apiKey: env.OPENAI_API_KEY })` in one `src/lib/ai.ts` with a single model constant. Request bodies are `as`-cast, not Zod-parsed, although Zod is already imported in the same files for the output schema.
- **Pages Router**: `src/pages/api/cron/*` (including `sync-smart-playlists.ts` for this slice) is Pages Router, which AGENTS says not to use. Cron handlers also use emoji in logs.
- **Dates**: no `date-fns` anywhere in slice. Manual: `new Date(...).toLocaleString()` `recipe-card.tsx:192`, `toLocaleDateString` `playlist-lyrics-list.tsx:278`, `playlist-lyrics-editor.tsx:1306`; month/year math `recipe-form.tsx:508-513,781-798`.
- **Env**: conformant in routes (`~/env.js`), see Env.
- **Tests**: see Tests.

### UI rules
- Raw `<button>`: 25 occurrences (`page.tsx:1070`, `mini-player.tsx:56,68`, `song-review-card.tsx:80`, `recent-tracks.tsx:71,107`, `track-row.tsx:45,83`, `tracks-panel.tsx:181,191,201,396,433`, `backfill-preview-dialog.tsx:76,160,196,227`, `recipe-form.tsx:664,696,760`, `genre-clause-list.tsx:243`, `playlist-suggestions.tsx:150,170`, `playlist-lyrics-editor.tsx:520`). Use `Button`.
- Hand-rolled modal: `backfill-preview-dialog.tsx:65,148` (`fixed inset-0 z-50 ... bg-black/50` + `Card`). It is a substantial review view, so per AGENTS it should be a shadcn `Drawer`, not a Dialog. Its 4 `<button>` also lack `type` (Biome a11y errors).
- Raw `<img>`: 7 (`track-row.tsx:35`, `mini-player.tsx:30`, `song-review-card.tsx:64`, `tracks-panel.tsx:385`, `recent-tracks.tsx:78`, `playlist-lyrics-editor.tsx:1113`, `playlist-lyrics-reader.tsx:281`); `next.config` already allow-lists `i.scdn.co` and spotifycdn, so `next/image` is feasible for Spotify art (Genius art and user-supplied QR URLs would need remote patterns or `unoptimized`).
- Dialog vs Drawer: `sync-spotify-playlist-dialog.tsx` is a `Dialog` containing one URL field + async action; borderline, acceptable as "minimal", but a Drawer is more consistent with the rest of the editor (`CreditDefaultsDrawer` is already a Drawer). `recipe-card.tsx` `AlertDialog` for delete with a checkbox is conformant.
- Ad-hoc bordered card: `recipe-form.tsx:~326` `div.rounded-lg.border.bg-card.p-4` should be `Card`.
- Template-literal classNames instead of `cn()` in `track-row.tsx:30,53,90`, `tracks-panel.tsx:403,439`, `mini-player.tsx:45` (Biome only sorts inside `cn`).
- Cap on file size: `page.tsx` is 1177 lines with 20+ inline handlers and 22 `console.log`; split by feature.

### React effects
- `page.tsx:360-373`: effect copies a Convex `useQuery` result into `useState` cache (`pendingSuggestionsCache`); derive during render from `getPendingSuggestions ?? cache` instead. This effect is also what masks E5.
- `page.tsx:351-357`: effect-driven fetching of Spotify data (`fetchRecentTracks/LikedTracks/SpotifyPlaylists`) via `fetch` in an effect; AGENTS: "never fetch in an effect". Spotify is an external system, but the project already has server sync (`syncSpotifyHistory`, cron) writing to Convex; the page should only read Convex and trigger sync from a button/event handler or a Convex action.
- `song-review-card.tsx:33-35`: effect resets `userInput` when `initialInput` changes; use `key={track.id}` (AGENTS: reset with a key).
- `playlist-lyrics-editor.tsx:1046-1048`: `useEffect(() => setShowOnBackCover(initialShow), [initialShow])` is the same prop-to-state sync. `:927-932` and `:1050-1052` push status to a parent on change (`onStatusChange`), derive in parent or lift the persist state instead.
- `use-spotify-player.ts:80-82` ref-sync effect and `:85-214` SDK load: legitimate (external SDK), but no one-line "syncs with Spotify Web Playback SDK" comment, the injected `<script>` is never removed, and the hook logs 11 `console.log`.
- `use-auth-token.ts` (shared, used here): fetch-in-effect for session status; AGENTS' `useAuthToken()` is expected to expose the session, and this is how it does it, so this is more an AGENTS-vs-reality note.

### Forms
No TanStack Form, no Zod, no shadcn `Field` anywhere in the slice (grep: 0 hits for `@tanstack/react-form`, `useForm`).
- `recipe-form.tsx` (877 lines): ~10 `useState` + manual `trim()` validation + `toast.error("Name is required")` (`:176-181`); filter model is an 80-line hand-written normaliser.
- `song-review-card.tsx` (one textarea), `playlist-manager.tsx` (add / create / edit forms, ~15 `useState`), `playlist-lyrics-editor.tsx` (add-song URL, manual-song 4 fields, autosave fields via `useZineEditorPersist`), `sync-spotify-playlist-dialog.tsx` (one URL field), `backfill-preview-dialog.tsx` (selection state).
- Convex args validators already exist; define Zod schemas in `src/lib/` (e.g. `smartPlaylistFiltersSchema`), reuse in the form and in `/api/smart-playlists/create` (currently hand-written `if` chains at `create/route.ts:38-66`). Autosave editor fields are a different pattern (debounced persist); decide whether AGENTS' "every form" covers them (see corrections).

### Dark mode
- Hard-coded palette colors outside tokens: Spotify-green `text-green-500`, `bg-green-500/10`, `ring-green-500/50` (`track-row.tsx:30,77,90,95`, `tracks-panel.tsx:152,427,439`, `playlist-manager.tsx:511,730,803`, `mini-player.tsx:45`, `recent-tracks.tsx:94`), confidence badges `green/yellow/gray-500/600` (`playlist-suggestions.tsx:75-77`), `text-teal-800` (`playlist-lyrics-editor.tsx:522,621`, low contrast in dark), `text-amber-800` (`sync-spotify-playlist-dialog.tsx:159`), `bg-white` on QR image (`:1115`, arguably intentional for QR contrast), `text-white`/`bg-black/40` overlays on art (acceptable over images). Add semantic `--success`/`--warning` tokens or use `text-primary`/`text-muted-foreground`/`text-destructive`.
- Print classes `print:border-gray-300 print:bg-gray-50` in reader are print-only; fine.
- `backfill-preview-dialog.tsx` uses `bg-background`/`Card` so is theme-safe.

### Toasts
Conformant: `sonner` `toast` used throughout; no `alert()`/`confirm()`. Minor: failures `console.error` + generic toast discard server detail in several handlers (`page.tsx`).

### Env
- All src reads go through `~/env.js` (no `process.env` in slice). Two items: `@ai-sdk/openai` reads `process.env.OPENAI_API_KEY` implicitly (see Stack), and `src/env.js` omits nothing relevant but `SESSION_SECRET` is validated yet unused by the auth that this slice depends on.
- `middleware.ts` does not use env; fine.

### Auth
- AGENTS says "Pass the access token ... via the `X-Access-Token` header; validate with `validateSessionToken`". In this slice `X-Access-Token` carries the **Spotify** bearer token (`page.tsx:210`, `recipe-form.tsx:226`, etc.), the routes never call `validateSessionToken`, and `userId` comes from the request body. Name collision with a different meaning.
- Convex functions take `userId` as an argument (`smartPlaylists.ts` all 12 functions; `spotify.ts` connection/playlist/track functions); Convex guidelines say never. No `convex-helpers` custom-function wrappers exist anywhere in the repo (only `stream` is imported), contrary to AGENTS' "use auth-wrapped queries/mutations".
- See E1-E4 for concrete holes.

### Convex
- No auth wrappers, `userId` args, `requireAuth` no-op (above).
- `returns` validators: `smartPlaylists.ts` and `playlistLyrics.ts` conform (all functions have args+returns; good). `spotify.ts` slice functions all missing `returns` (E11).
- Indexes: all reads use `withIndex` (no `.filter` in the three files; verified). Missing: `userTracks.by_userId_lastLikedAt` (E7).
- Bounded reads: violations listed in E7/E8/E17 (about 17 unbounded `.collect()` in slice functions).
- Internal vs public: sync/migration helpers and token/connection functions should be internal (E1, E4); `commitSyncSuccess/Failure`, `insertRecipe`, `resolveMatches`, `listActiveRecipesForUser` are called from Next server code via `ConvexHttpClient` so cannot be `internal` without an admin key or a Convex action wrapper; they are currently world-callable. Consider moving the sync into a Convex action so these become internal.
- Import table: correct everywhere (`query/mutation` from `./_generated/server`, `api` from `./_generated/api`). No `"use node"` files exist in the repo (none needed in slice); no mutation fetches.
- `v.id` vs `v.string`: `spotifyPlaylistId`, `canonicalUrl` etc. are external ids (string OK); `syncedAlbumIds: v.array(v.string())` holds Spotify ids (fine); `filters.excludedAlbumIds` correctly `v.id("spotifyAlbums")` but the TS model/Next route types it `string[]` and casts (`create/route.ts:85`).
- Schema evolution: `spotifySongCategorizations` still carries a pile of `@deprecated` migration fields and is dual-written (`saveCategorization`), legacy `by_trackId` index is the one actually used for lookups; legacy `spotifyTracks` table still in schema. Finish the migration or document.
- Staged indexes for any new index on `userTracks`/`spotifySongCategorizations` (large).
- Time: queries do not read the clock (good; `now` passed as arg), but see E7 on arg churn.
- `Date.now()` as part of `slug` and `lastError: undefined` in patch (valid, clears field).

### Tests
- AGENTS: "new tests use Vitest; Convex tests use convex-test". Reality: `vitest.config.ts` includes only `convex/launch-*.test.ts`; every slice test is `node:test`, so `pnpm exec vitest run` runs none of them. `node --test file.ts` fails on Node 22.14 (`ERR_UNKNOWN_FILE_EXTENSION`); they pass with `pnpm exec tsx --test <files>` (63 pass). There is no `test` script in package.json.
- Coverage: pure logic in `src/lib/smart-playlists/*` is well covered (sync-plan, expand-tracks, hash, rule-summary, added-window, sliders). Not covered: `src/lib/spotify.ts`, `spotify-sync.ts`, `smart-playlists-sync.ts`, any API route, any slice Convex function behavior (`resolveMatches`, `commitSync*`, `playlistLyrics` mutations), OAuth, the categorize response shape (E5).
- `convex/smartPlaylists.for-later-genre-source.test.ts` is a source-text regex test (reads the `.ts` file and asserts substrings); brittle and does not exercise behavior. Replace with `convex-test` against `resolveMatches`.
- Some pure logic lives in `convex/_utils/` mirrored from `src/lib/` (e.g. `smartPlaylistAddedWindow.ts` is a copy of `src/lib/smart-playlists/added-window.ts`); two copies, two test sets, drift risk.

### Code style
- Biome on slice: 26 errors: 6 `noExplicitAny` + 1 `noImplicitAnyLet` in `convex/spotify.ts` (`:112,166,215,264,465,2108,864`; AGENTS "No `any`"), 4 `useButtonType` (`backfill-preview-dialog.tsx`), 11 `format` (page.tsx, playlist-manager, tracks-panel, track-row, playlistLyrics.ts, spotify.ts, reader, 3 api routes, rule-summary.test.ts), 4 `organizeImports`. Run `pnpm check:write` on these.
- Explicit return types on exported functions: missing on `SpotifyPlaylisterPage` (`page.tsx:33`), `SongReviewCard`, `PlaylistManager`, `SpotifyConnection`, `useSpotifyPlayer` has one, `GET/POST` in `add-song`/`rescrape-song` routes, `auth/route.ts` `POST` in `/api/auth`.
- `console.log` x72 across slice (`page.tsx` 22, `backfill-playlist` 13, `use-spotify-player` 11, `seed-artists` 8, `check-new-tracks` 6, ...), including `console.log("Authorization header present:", ...)` and logging full track objects.
- Function declarations: conformant (arrows only inline). `type` not `interface`: conformant (only `interface Window` in `use-spotify-player.ts:16`, a legitimate declaration merge).
- Component-first ordering: page.tsx defines helpers (`createMinimalTrackFromDb`, `createMinimalTrack`) inside the component body between hooks; hoist.
- Kebab-case files: conformant. `~/*` imports: conformant, but slice mixes `~/` and deep relative `../../../../convex/_generated/api` (unavoidable for generated code).

### AI SDK usage details (special attention)
| Route | Call | Issues |
|---|---|---|
| `categorize/route.ts` | `generateObject` x ceil(n/4) in `Promise.allSettled` | no auth; unbounded input; unbounded fan-out; inconsistent response shape (E5); `playlistId` not validated (E6); no abort/timeout; success path ignores per-batch failures (partial results returned as success) |
| `generate-playlist-description/route.ts` | `generateText` | no auth; no length cap on `userNotes`; user text interpolated straight into prompt |
| `backfill-playlist/route.ts` | sequential `generateObject` per 10 songs | no auth; unbounded `categorizations`; sequential so N/10 round trips (serverless timeout); ids not validated (E6); `accessToken` in JSON body (others use header); the non-`dryRun` branch is unused by the client and duplicates `addTracksToPlaylist` with raw fetch |
- None use streaming, `maxDuration`, `maxOutputTokens`, `abortSignal`, or provider `reasoningEffort` (gpt-5-nano is a reasoning model, so latency/cost vary). Recommended: one `src/lib/ai.ts` with `createOpenAI({ apiKey: env.OPENAI_API_KEY })`, a `MODEL` constant, Zod-parsed request bodies, session check, and caps (e.g. <= 60 playlists, <= 200 categorizations).

### Spotify OAuth / token handling summary
- Auth-code flow without PKCE/state (E3); token exchange and refresh are server-side (good), secrets from `~/env.js` (good).
- Tokens stored in plaintext in Convex and exposed to the client (E1).
- Refresh: `updateTokens` correctly keeps the old refresh token when Spotify omits a new one (`spotify.ts:684`); `refresh-token` route passes `newTokens.refresh_token` (optional) correctly.
- Refresh logic duplicated 3+ times (E15); no concurrency guard, so cron plus a browser refresh can both refresh.
- Client holds a Spotify token and calls Spotify directly (player SDK is required to; the other 3 call sites are not).

## Suggested changes (ranked, with effort)

1. **S** Add `/spotify-playlister`, `/smart-playlists`, `/api/spotify/*` (minus `callback`), `/api/smart-playlists/*`, `/api/playlist-lyrics/*` to `middleware.ts` matcher; stop-gap until route-level validation exists. (E2)
2. **S** Lock down `POST /api/spotify/refresh-token`: derive `userId` from the validated session instead of the body; same for `sync-history`, `smart-playlists/*`. (E2)
3. **M** Stop returning tokens to the browser and make token functions internal; delete `getAllConnections`; return a sanitized connection view; route token reads through a server-only helper. (E1)
4. **M** Add OAuth `state` (+ validate session in callback), drop `user-read-email`. (E3)
5. **S** Gate the three `*ForSync` playlistLyrics functions (internal) and move dev-to-prod sync to a script; remove the "Sync to Production" route/button or make it admin-only. (E4, E9)
6. **S** Fix the categorize response shape + page.tsx:589 cache bug with a regression test written first; always return `{ suggestedPlaylists }`. (E5)
7. **S** Validate AI-returned `trackId`/`playlistId` against the input sets; add caps and `maxDuration`. (E6)
8. **M** Replace unbounded reads with `.take()`/index (`getRecentlyPlayedTracks`, `getLikedTracksHistory` + staged index, `getCategorizations`, `getRecentSyncRuns`, `listRecipes`, `listPublic`). (E7)
9. **M-L** Rework smart-playlist matching to avoid reading whole tables per keystroke (pre-projected fields/index, debounce preview, drop `now` when no relative window); batch `listCanonicalTrackUrisByAlbums`. (E7, E8)
10. **M** Remove `syncedTrackUris` array from the recipe doc (hash + counts or child table); add per-recipe sync lock; wire or delete the `sync-smart-playlists` cron. (E8)
11. **M** Add `returns` validators and `v.literal` unions to the slice's `spotify.ts` functions; add `userId` ownership checks on playlist mutations; stop trusting `userId` args once an auth wrapper exists. (E10, E11)
12. **M** Centralize AI (`src/lib/ai.ts`) and token refresh (`src/lib/spotify-token.ts`, `import "server-only"`); split `spotify.ts` helpers from the secret-using refresh. (E13-E15, AI)
13. **L** Migrate forms to TanStack Form + Zod + shadcn `Field`: `recipe-form` first (shared Zod schema also used by `create/route.ts`), then playlist-manager, song-review-card, editor add-song forms.
14. **M** UI conformance pass: `Button` for 25 raw buttons, `next/image` for 7 images, replace `backfill-preview-dialog` with `Drawer`, `cn()` for template-literal classes, semantic color tokens, `date-fns` for 3 date formats.
15. **M** Remove effects: derive pending-suggestions cache, `key` reset in song-review-card, parent-driven status in editor; move Spotify reads out of page effects. Strip the 72 `console.log`.
16. **S** `pnpm check:write` on slice; fix 6 `any` in `convex/spotify.ts`; add explicit return types.
17. **S** Delete dead code: `convex/migrate.ts` (empty), `smartPlaylists.migrateFiltersToV2`, `playlistLyrics.reorderItems/updateZinePageRecommendations` (or wire them), `spotify.getAllConnections/searchCategorizations/getCategorizationByTrack/getPendingSyncLogs`, `spotify.unfollowPlaylist`, dead non-dry-run branch of backfill route.
18. **M** Tests: add `convex-test` suites for `resolveMatches`, `commitSyncSuccess`, `playlistLyrics` mutations; a unit test for the categorize response normaliser; widen `vitest.config.ts` or document `tsx --test`; replace the regex source test.
19. **S** Spotify client hardening: 429/Retry-After, timeouts, encode path ids, one `/items` endpoint family.

## AGENTS.md corrections

1. **UI stack row says Base UI, repo is Radix.** Either state "shadcn on Radix (migration to Base UI in progress; only `combobox` is Base UI)" or schedule the migration; as written, any agent following AGENTS will emit `render=` props while every existing component takes `asChild`.
2. **Tests.** Replace "Many existing tests use `node:test` (`node --test path`)" with the working command (`pnpm exec tsx --test path`, Node 22.14 cannot run `.ts` natively), and state that `vitest.config.ts` currently only includes `convex/launch-*.test.ts`; "new tests use Vitest" needs the config change or a note on where to put them. Add a `test` script.
3. **"Code in `src/lib/` that Convex imports uses relative imports only."** In practice Convex cannot import from `src/` (bundler root is `convex/`); the repo mirrors logic into `convex/_utils/` (e.g. `smartPlaylistAddedWindow.ts`, `duelElo.ts`) and `src/` imports from `convex/_utils/` (e.g. `api/playlist-lyrics/*`). Document that direction, plus the "keep in sync" convention, or provide a shared package.
4. **Auth section.** `X-Access-Token` is described as the session token validated by `validateSessionToken`; in the Spotify code it is the Spotify bearer token and nothing validates the session. Rename the Spotify header (e.g. `X-Spotify-Token`) and state that Next middleware only guards listed matchers and only checks cookie presence. Also document that the session cookie is unsigned, and that Convex has no auth wrappers today (so "Use auth-wrapped queries/mutations" is aspirational), plus the "never accept `userId` as an arg" rule.
5. **"Actions are only for external APIs (Spotify, Resend, scraping, AI)" vs "API routes are for external integrations only".** Practice: all Spotify/AI/scraping calls live in Next API routes and Pages-Router crons, zero Convex actions use them. Pick one home and say so; also AGENTS forbids Pages Router while all crons live in `src/pages/api/cron/`.
6. **Stack table gaps.** Add `@ai-sdk/openai` (provider) and state the model constant location; add `ConvexHttpClient`/`convex/nextjs` as the sanctioned server-side Convex client; note `convex-helpers` is currently used only for `stream`.
7. **Forms rule.** Clarify whether debounced autosave editors (`useZineEditorPersist`) and selection-only dialogs count as "forms"; as written ("every form, including single-input") ~all slice UI is non-conformant.
8. **Features list** lists `/playlist-lyrics` but it redirects to `/lyrics/playlists` (list lives there); `src/app/public/playlist-lyrics` (public mirror) and the `/api/migrate-*` routes are not mentioned. Add a short note that `/public/*` is middleware-exempt.
9. **Env rule.** Add "AI SDK providers read `process.env` implicitly; construct providers with `env.*`".

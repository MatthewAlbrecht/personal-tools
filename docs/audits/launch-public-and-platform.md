# Audit: Launch + Public + Platform / cross-cutting vs AGENTS.md

Date: 2026-10-07. Read-only audit. Verified with grep/read plus: `pnpm exec vitest run` (5 files / 57 tests pass), `pnpm typecheck` (clean), `pnpm check` (190 errors / 18 warnings), `node --import tsx --test <136 node:test files>` (887/895 pass, 8 fail), regex scans of `convex/` (scripts kept outside the repo).

## Scope (files reviewed)

- Launch: `convex/launch.ts` (839 lines), `convex/launchActions.ts`, `convex/_utils/launchLayout.ts`, `src/app/api/launch-config/route.ts`, the real Launch UI `public/launch.html` (2740 lines, static, NOT a Next route) + `public/launch-{dnd,model}.mjs`, tests `convex/launch-*.test.ts`, `public/launch-*.test.mjs`, `tests/launch-dnd.spec.mjs`, `playwright.config.mjs`.
- Public/auth UI: `src/app/public/**`, `src/app/login/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/providers/ConvexProvider.tsx`.
- Platform: `convex/schema.ts` (1795 lines, 73 tables), `convex/crons.ts`, `convex/migrate.ts` (0 bytes), `convex/migrations/*` (8 files), `convex/auth.ts`, `convex/auth.config.js`, `convex/s3Helper.ts`, `src/middleware.ts`, `src/env.js`, `src/lib/auth-context.tsx`, `src/lib/hooks/use-auth-token.ts`, `src/app/api/{auth,auth/status,convex-auth}`, tRPC leftovers (`src/server/api/**`, `src/trpc/**`, `src/app/api/trpc`), `src/pages/api/cron/*`, root config (`components.json`, `biome.jsonc`, `vitest.config.ts`, `package.json`, `vercel.json`, `tsconfig.json`).
- Whole-`convex/` index/bounded-read/validator scans (counts below are regex-based; treat as +/- a few).

## Summary table

| AGENTS.md section | Status | # findings |
|---|---|---|
| Stack table | Partial | 11 |
| UI (shadcn on Base UI) | Non-conforming | 6 |
| React effects | Partial | 6 |
| Forms | Non-conforming | 3 |
| Dark mode | Broken (dark theme unreachable) | 3 |
| Toasts | Conforming | 0 |
| Env | Mostly conforming | 5 |
| Auth | Non-conforming, security-critical | 10 |
| Convex | Partial (launch.ts good on validators, bad on auth/bounds) | 16 |
| Tests | Partial | 6 |
| Code style | Mostly conforming | 4 |

---

## Errors & risks (ranked)

### CRITICAL (security)

**E1. The entire Convex backend is open to the internet; `requireAuth` is a no-op and nothing replaces it.** (Detail in "Auth analysis" below.)
- By regex there are 385 public registered functions (162 `query`, 210 `mutation`, 13 `action`) vs 28 internal. 171 `requireAuth(ctx)` call sites (not ~195) all return `true` (`convex/auth.ts:5-9`). `convex/auth.config.js:2` has `providers: []`, so `ctx.auth.getUserIdentity()` is always `null`.
- The deployment URL is public by design: `NEXT_PUBLIC_CONVEX_URL` ships in the client bundle (`src/providers/ConvexProvider.tsx:7`) and `GET /api/launch-config` returns it with no auth (`src/app/api/launch-config/route.ts:5`).
- Worst concrete exposures: `api.spotify.getAllConnections` (`convex/spotify.ts:1608-1612`, no args, no `returns`, returns every row of `spotifyConnections` incl. `accessToken` + `refreshToken`); `api.spotify.getConnection({userId})` (`:651`); `updateTokens` (`:661`); every Launch function; 8 public one-off migration mutations incl. `migrations/initializeRatingHistory:clearRatingHistory` (`:78`, deletes ALL `ratingHistory`, no args validator); `backfillUserTracks.run/processBatch/runBatch`, `backfillSpotifyAlbumsSource.run/runBatch`, `backfillSpotifyAlbumId.run`, `backfillCategorizedAt.run`, `backfillListenFilterFields.runBatch`; `launch.backfillLayoutOrdering` (`launch.ts:537`, public mutation that rewrites data).
- `userId` is a client-supplied argument on dozens of functions (e.g. `useSpotifyAuth` passes the cookie username as `{ userId }`, `src/lib/hooks/use-spotify-auth.ts:36`); Convex guidelines: "NEVER accept a userId as a function argument for authorization purposes".

**E2. Session cookie is unsigned and forgeable; middleware only checks it exists.**
- `src/app/api/auth/route.ts:17-19`: token = `base64url("<username>:<Date.now()>")`. `SESSION_SECRET` (`src/env.js:15`) is declared as required and used nowhere in `src/`, `convex/`, `scripts/`.
- `src/middleware.ts:7-35` redirects only when `!session` (cookie absent). Any non-empty cookie value passes. `/api/auth/status` (`status/route.ts`) only checks that it decodes to `x:<recent ms>`; it does not even compare the username. `src/app/page.tsx:7` gates the dashboard on cookie presence (`!= null`).
- Fix: HMAC-sign with `SESSION_SECRET` (Web Crypto works in middleware), verify in middleware, `timingSafeEqual` for the password compare, and rate-limit login.

**E3. Middleware protects only 9 path prefixes; most of the app and every data-shaped API route is unauthenticated.**
- `src/middleware.ts:41-59` matcher: `/books`, `/folio-society`, `/articles`, `/concerts`, `/birthdays`, `/playlist-lyrics`, `/lyrics/playlists`, `/api/migrate-playlist-lyrics`, `/api/migrate-lyrics`.
- NOT protected: `/albums`, `/for-later-albums`, `/music-funnel`, `/album-enrichment`, `/spotify-playlister`, `/smart-playlists`, `/robs-rankings`, `/rooleases`, `/lyrics` (non-playlist), `/launch.html`, and all other `/api/*`.
- Unauthenticated Next routes that cost money or fetch arbitrary URLs: `src/app/api/spotify/generate-playlist-description/route.ts` and `spotify/categorize` (OpenAI spend), `extract-article` (fetches caller-supplied URL), `scrape-genius`, `music-funnel/sync`, `spotify/refresh-token` (returns a user's Spotify access token for any `userId` in the body), `spotify/import-robs-top-50`, `spotify/seed-artists`, `for-later-albums/find-rym-links`.
- The "public" bypass at `middleware.ts:7-9` is dead code (the matcher never includes `/public`).

**E4. `launchActions.previewLink` is an unauthenticated open fetch proxy** (`convex/launchActions.ts:5-37`). Any caller can make Convex fetch any URL (`redirect: "follow"`), read the full body with `response.text()` (no size cap, no timeout) and get title/favicon back. `isLocalUrl` (`:114-127`) only short-circuits localhost; it is not an SSRF guard. Fix: auth + scheme allowlist (http/https) + `AbortSignal.timeout` + body cap.

**E5. Launch stores arbitrary URL schemes** (`launch.ts:820-827` `normalizeUrl` accepts any `scheme:`; `launchActions.ts:100-107` same). `public/launch.html:1365,1426,1466,1515` set `link.href = bookmark.url`. `target=_blank rel="noopener noreferrer"` mitigates but `javascript:`/`data:` bookmarks can be planted by anyone (E1). Allowlist `http:`/`https:` in both normalizers.

### HIGH (correctness / perf / deploy)

**E6. Unbounded `.collect()` in Launch mutations and verify query.** `launch.ts:94-95, 132-133, 191-192, 262-263, 300-301, 339-340, 549-550, 567-568, 620-623` collect whole tables before `validateDatasetLimits` throws (cap 500 bookmarks / 100 projects, `launchLayout.ts:148-151`). `list`/`getLayout`/`applyLayoutOperation` already use `take(MAX+1)`; use the same helper everywhere. `persistPadZones` (`launch.ts:725-740`) patches every bookmark in a zone (up to 250) on each create/update/remove even when unchanged, rewriting docs and invalidating all subscribers; patch only on diff.

**E7. Public lists are unbounded or unfiltered.** `geniusAlbums.listPublicRecent` (`convex/geniusAlbums.ts:128-140`): `limit` is an unvalidated client number into `.take(limit)`, no `returns`, and it lists ALL albums, not just ones intended to be public; `getPublicAlbumBySlug` (`:155`) is byte-for-byte the same data as the "authed" `getAlbumBySlug` (`:145`). `playlistLyrics.listPublic` (`convex/playlistLyrics.ts:307-325`) `.collect()`s every ready playlist then `.slice(limit)`. Cap `limit` (`Math.min`) and use `.order("desc").take()` on an index.

**E8. Other unbounded `.collect()` on tables that grow** (index-scan or full-scan; outside this slice but platform-relevant): `concerts.ts:318` (`concertEvents`, full table in a mutation), `concerts.ts:417` (`userConcertEvents`), `folioSocietyReleases.ts:56,102,144`, `folioSocietyDetails.ts:60`, `spotify.ts:1611` (tokens, see E1), `spotify.ts:2093` (`spotifyTracksCanonical`, can be large), `spotify.ts:2757`, `spotify.ts:4129` (`userTracks`), `rankingSnapshots.ts:166` (`userAlbums`), `robRankings.ts:596` (`spotifyAlbums`), `rooleases.ts:83` (`spotifyArtists`), `playlistLyrics.ts:1523`, `geniusCreditLabels.ts:94,149,163,341`, `smartPlaylists.ts:776`, plus 6 in `migrations/*` and ~100 `.collect()` behind an index with no cap (221 `.collect()` total in non-test convex source). One `.filter()` full scan on a growing table: `forLaterAlbums.ts:1817` (`forLaterAlbumItems`, `.filter(albumId)` inside a loop over album ids; the only albumId index is `by_userId_albumId`, so add the `userId` prefix or an `albumId`-only index). `robRankings.ts:126,157,338,515` filter `robRankingYears` (tiny, but still `.filter`).

**E9. Missing validators.** 185 registered functions have no `returns` validator and 7 have no `args` (`migrations/initializeRatingHistory.ts:13,38,78`, `migrateRatingsToThreeTier.ts:33,59,99`, `articles.ts:108`). In this slice: all of `convex/migrations/*` (12 functions). `launch.ts`/`launchActions.ts` are fully compliant.

**E10. Index coverage vs query paths: no missing indexes.** Scan of every `ctx.db.query("T")...withIndex("idx")` in `convex/` found 0 references to non-existent indexes and 0 prefix mismatches (`musicFunnel.ts:387` flagged by the script is a false positive from a nested `q.eq`). Gaps are the reverse: 96 `ctx.db.query` chains use no index (mostly `.collect()`/`.first()` singletons or migrations; see E8) and ~50 indexes appear unreferenced anywhere (see Schema section). Launch tables (`launchBookmarks`, `launchProjects`) have no indexes and are always read whole; acceptable only because of the 500/100 cap.

**E11. `s3Helper.ts`.** `convex/s3Helper.ts:30` `body: args.content.buffer` uploads the whole backing `ArrayBuffer`, which is wrong for any `Uint8Array` view with offset/length smaller than its buffer (silent corruption). Hand-rolled SigV4 with 7 `@ts-ignore`s and 5 `biome-ignore ... <explanation>` placeholders. It is imported from both Convex (`folioSocietyImages.ts:5`) and a Next route (`src/app/api/rate-your-music/covers/route.ts:6`), so a "Convex" file reads `process.env` inside Next (breaks the Env rule's separation) and it is deployed as a Convex module. It also contradicts the Convex rule "don't add a parallel object store / store storage ids not URLs" (CloudFront URLs are stored in `folioSocietyImages`).

**E12. Failing tests / non-runnable test command.** (a) AGENTS.md says `node --test path/to/file.test.ts`; on Node 22.14 (installed) that fails with `ERR_MODULE_NOT_FOUND` (extensionless relative imports); it only works with `node --import tsx --test`. (b) With tsx, 8 of 895 fail: `convex-module-paths.test.ts` (false positive: it flags 30 `*.test.ts` files with hyphens, but the Convex bundler skips files with multiple dots (`node_modules/convex/src/bundler/index.ts:465-467`), so no deploy risk; fix the test to skip `*.*.ts`), plus 7 source-regex tests that drifted (`projection build sets appearsInForLater via membership helper`, `For Later UI keys mutations ...`, `setForLaterAlbumMarkedAsSingle patches library membership`, `Spotify album writes persist normalized album title keys`, `spotifyAlbums declares optional spotifyAlbumId and source union`, `upsertAlbum persists rawData ...`, `genres stats page uses published years ...`). (c) There is no `test` script and no CI (`.github` absent), so nothing catches this.

### MEDIUM

**E13. Dark mode cannot activate.** `globals.css:4` is `@custom-variant dark (&:is(.dark *))`, `.dark {}` tokens exist (`:87`), but no `ThemeProvider` is mounted (`src/app/layout.tsx:36-50`), nothing adds the `dark` class (grep for `classList`/`ThemeProvider`: none). `next-themes` is imported only by `components/ui/sonner.tsx:3`, so the Toaster always reads theme `"system"` from a missing provider.

**E14. Auth state fetched in effects, N times.** `useAuthToken` (10 callers) does `fetch("/api/auth/status")` on mount and on every `visibilitychange` (`use-auth-token.ts:15-37`); `AuthProvider` does it again (`auth-context.tsx:31-43`). Data fetching in effects is banned by the Effects rule; derive from the cookie server-side in the root layout and pass in, or use one context.

**E15. Open-redirect hardening gap.** `src/app/login/login-form.tsx:27` `router.replace(next || "/")` with unvalidated `next` (middleware only ever sets a pathname). Restrict to values starting with a single `/`.

**E16. `src/app/api/convex-auth/route.ts` and `auth/status` duplicate the token-parsing logic** (same 7-day parse in 3 places + `convex/auth.ts:validateSessionToken`, which is never called). `X-Access-Token` is actually the *Spotify OAuth access token* in all 14 routes that read it, not an app session token.

**E17. Launch is a static HTML app, outside every convention** (`public/launch.html`, 2740 lines inline JS): no shadcn, no Tailwind tokens, no theme, no auth/middleware, imports Convex from `https://esm.sh/convex@1.46.0/browser` (CDN dependency, version must be kept in lockstep with `package.json` by hand), calls functions by string (`"launch:applyLayoutOperation"`, `public/launch.html:2710`) so renames/arg changes are not typechecked. Test files (`public/launch-*.test.mjs`, ~5.8k lines) are served publicly in production.

**E18. Schema: string enums and unfinished migrations.** `spotifySyncLogs.syncType/status/source` (`schema.ts:1357-1371`), `userAlbumListens.source` (`:1265`), `robRankingAlbums.status` (`:1453`) are `v.string()` with the value set in a comment; use `v.union(v.literal(...))`. `launchBookmarks.padPosition` / `launchProjects.position` are still `v.optional` after the backfill (`schema.ts:1772-1787`) and `launch.ts:375,381` carry dead `existing.projects ?? []` fallbacks although `projects` is required. Long-lived "optional during migration" fields: `schema.ts:494-502, 589, 601, 670-672, 1266, 1475, 1509`.

**E19. `crons.weekly` is banned by the Convex guidelines** (`convex/crons.ts:6`); use `crons.cron("...", "0 5 * * 0", ...)`. The rest of scheduled work runs on Vercel cron + `src/pages/api/cron/*` (8 Pages Router files, bearer `CRON_SECRET`, only 2 are in `vercel.json`): conflicts with "App Router only / actions only for external APIs".

### LOW

- `convex/migrate.ts` is a 0-byte file (git history only); delete. The Convex bundler skips it ("no export or import").
- `launch.ts` and `launchActions.ts` duplicate `normalizeUrl`/`stripUtm` (`launch.ts:820-839` vs `launchActions.ts:100-119`); `launch.ts:81-85,117-119` take `tags: v.array(v.string())` although `launchTagValidator` exists.
- `launch.ts` mixes `ctx.db.get(id)` / `patch(id, ...)` with the explicit-table form (`launch.ts:125 vs 194`); pick one.
- `launchActions.ts` exports plain helpers (`extractLinkPreview`) from a Convex module for tests; they are not registered functions so OK, but move to `_utils/`.
- `package.json` dead deps: `cheerio`, `ts-node`, `cn` (the `cn` npm package, unrelated to `~/lib/utils`), `server-only` (only `src/trpc/server.ts`), `@trpc/*`, `@tanstack/react-query`, `superjson` (only tRPC). `@types/node ^26` vs Node 22 runtime.
- `biome.jsonc` `files.ignore: []`: lints `convex/_generated` (13 diagnostics) and checks `public/*.mjs`.

---

## Auth analysis (what protection really exists)

| Layer | What exists | Real protection |
|---|---|---|
| Login | `POST /api/auth` compares form username/password to `AUTH_USERNAME/AUTH_PASSWORD` with `===`, sets `session` cookie (httpOnly, sameSite lax, 7d, secure in prod) | OK for browser login; no rate limit, non-constant-time compare |
| Cookie | `base64url("user:ms")`, unsigned | None: forgeable by anyone who reads the format (E2) |
| Middleware | cookie-presence redirect on 9 prefixes | Page-level gate for `/books`, `/folio-society`, `/articles`, `/concerts`, `/birthdays`, `/playlist-lyrics`; nothing for the rest (E3) |
| Next API routes | `X-Access-Token` = Spotify token (not app auth); bearer secrets only for `CRON_SECRET`, `ALBUM_ENRICHMENT_SECRET`, `RYM_EXTENSION_INGEST_SECRET`; many routes with none | Partial, per-route |
| Convex | `auth.config.js` empty, plain `ConvexProvider`, `requireAuth` no-op | None. 385 public functions; any client with the URL can read/write/delete everything |

What is exposed through public Convex functions, by class: Spotify OAuth tokens (E1), all personal data (albums, listens, concerts, birthdays, articles), destructive migrations, ability to schedule external fetches/actions (`previewLink`, Spotify/Genius/RYM/Ticketmaster/S3/Resend-adjacent actions). `/api/launch-config` makes discovering the URL trivial, though the URL is in the JS bundle regardless.

### Recommended fix (convex-helpers custom functions)

Stage 0 (hours, S): stop the worst leaks without redesigning auth. Change `getAllConnections`, `getConnection`, `updateTokens`, `clearRatingHistory`, all `migrations/*` public mutations and `launch.backfillLayoutOrdering/verifyLayoutOrdering` to `internal*`; Next routes that need Spotify tokens (`spotify/refresh-token`, crons) then need a server-to-Convex channel (stage 2). Sign the cookie (E2) and expand the middleware matcher to default-deny (allowlist `/login`, `/public/**`, `/api/auth`, `/_next`, static, cron/secret routes).

Stage 1 (M-L): real identity in Convex.
1. Mint a JWT in `POST /api/auth` after the password check: `sub = AUTH_USERNAME`, `iss = APP_URL`, `aud = "convex"`, short expiry (1h), signed with an asymmetric key (private key in Next env, declared in `src/env.js`). Serve JWKS at `/.well-known/jwks.json` (plus `/.well-known/openid-configuration`) from a Next route, or use the `customJwt` provider type in `convex/auth.config.ts` (rename from `.js` to `.ts` per the guidelines) with `issuer`, `jwks`, `applicationID: "convex"`, `algorithm`.
2. Client: replace `ConvexProvider` with `ConvexProviderWithAuth` whose `useAuth` returns `{ isLoading, isAuthenticated, fetchAccessToken }`; `fetchAccessToken` hits a cookie-gated `GET /api/auth/token`. This also replaces `AuthProvider`/`useAuthToken` fetch-in-effect logic. `launch.html`: `client.setAuth(fetchToken)` (or port Launch to a Next page).
3. `convex/functions.ts`:
```ts
import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import { query, mutation, action } from "./_generated/server";

async function owner(ctx: { auth: Auth }) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new ConvexError("Unauthenticated");
	return { userId: identity.tokenIdentifier, username: identity.subject };
}
export const authedQuery = customQuery(query, {
	args: {},
	input: async (ctx) => ({ ctx: { ...(await owner(ctx)) }, args: {} }),
});
export const authedMutation = customMutation(mutation, { /* same */ });
export const authedAction = customAction(action, { /* same */ });
export const publicQuery = query; // explicit, greppable "this is public" alias
```
4. Mechanical migration: `requireAuth(ctx)` call sites (171) become `authedQuery/authedMutation/authedAction` and drop every `userId: v.string()` arg in favor of `ctx.userId`; only public pages use `publicQuery` (the 8 Rob's Top 50 / lyrics / playlist-lyrics queries, with real `published` filtering and capped limits). Delete `requireAuth` and `validateSessionToken` once no caller remains.
5. Enforce: add a Vitest source test (the repo already has this pattern) that fails if any `convex/**/*.ts` (except `functions.ts`, `_utils`, `_generated`, `schema.ts`, `crons.ts`) imports `query|mutation|action` directly from `./_generated/server`.
6. Table `userId` columns stay `v.string()` (single user), but write `identity.tokenIdentifier` consistently; plan a one-time rewrite of existing `userId` values (they are currently the username) or keep `subject` as the stored key.

Stage 2 (M): server-to-Convex callers. 33 files under `src/` (Next routes, 8 Pages cron handlers) use `ConvexHttpClient`/`fetchQuery` anonymously. Give them `client.setAuth(await mintServiceToken())` (same JWT, `sub` = owner) or move the cron work into `convex/crons.ts` -> internal actions, which removes the need for Next-to-Convex auth for cron/sync jobs. Browser extension/enrichment bearer-secret routes can stay as bearer routes calling internal-only HTTP actions (`convex/http.ts`, `httpAction`) if desired.

Stage 3 (S): `previewLink` becomes `authedAction` with the E4 hardening.

---

## Convention drift by AGENTS.md section

### Stack table (status: partial)

| Concern | Reality | Change |
|---|---|---|
| Framework | App Router, TS strict, but 8 `src/pages/api/cron/*.ts` (Pages Router) and `public/launch.html` | Move cron work to `convex/crons.ts` + internal actions (or App Router route handlers); port Launch to `src/app/launch/` |
| Package manager | pnpm | OK |
| Styling | Tailwind v4 | OK |
| UI | `components.json` `"style": "new-york"` (Radix). 13 of 14 primitives in `src/components/ui` import Radix: `radix-ui` umbrella in `tabs, sheet, button(Slot), select, slider`; `@radix-ui/react-{alert-dialog,checkbox,dialog,dropdown-menu,label,popover,separator,tooltip}` in the matching files. Only `combobox.tsx` uses `@base-ui/react`. 70 `asChild` uses in 45 files, 0 Base UI `render=` props. `package.json` lists both umbrella and 8 individual `@radix-ui/*` | See migration plan step 3 |
| Icons | `lucide-react` in 115 files, no Hugeicons (OK). Extras: `simple-icons` (1 file, brand logo `components/zine/zine-cover-page.tsx`), inline `<svg>` in 5 files (`bookcase-designer`, `for-later-row`, `for-later-recommendation-drawer`, `listens-filters`, `zine-cover-page`) | Replace inline svgs with lucide; list `simple-icons` as an allowed exception or remove |
| Forms | TanStack Form in 1 file (`src/app/books/page.tsx:3,129`); 10 other files with `<form>` use `useState`. No `react-hook-form` anywhere (OK). shadcn `Field` not installed (`src/components/ui/field-group.tsx` is a hand-rolled substitute) | `pnpm dlx shadcn@latest add field`, convert forms |
| Toasts | `sonner` mounted once in `layout.tsx:46`; no `alert(` | OK |
| Theming | `next-themes` in `package.json`, only `sonner.tsx` imports it, no `ThemeProvider` (E13) | Add provider |
| Backend | Convex | OK; `convex-helpers` used only for `stream` (`spotify.ts:1`, `forLaterAlbums.ts:1`); no custom functions |
| Dates | `date-fns` is NOT in `package.json` and unused; ~34 manual `toLocale*String`/`Intl.DateTimeFormat`/`toISOString().slice` sites in `src/` | Add `date-fns`, replace formatting |
| Env | `@t3-oss/env-nextjs` + Zod present | See Env |
| Email/AI | Resend, `ai` + `@ai-sdk/openai` present | OK |
| tRPC | Pure dead scaffold: `src/server/api/root.ts` has only `_placeholder`; zero consumers; `TRPCReactProvider` still wraps the app (`layout.tsx:44`) and route `src/app/api/trpc/[trpc]/route.ts` is live | Delete (see plan step 1) |
| Tests | Vitest only runs `convex/launch-*.test.ts` (`vitest.config.ts:8`), 136 other files on `node:test` | Consolidate |
| Lint | Biome 1.9.4; `pnpm check` fails (190 errors: 95 format, 34 organizeImports, 20 `noNonNullAssertion`, 9 `noExplicitAny`, 6 `useExhaustiveDependencies`, 6 `useSemanticElements`, 4 `useButtonType`, 2 `noDangerouslySetInnerHtml`, 13 inside `convex/_generated`) | Ignore `_generated`, `public/`, run `check:write` once |

### UI rules (non-conforming)
- Raw `<button>` outside `components/ui`: 104 lines in 49 files; `<select>`: 9 files; `<table>`: 1; raw `<input>`: 6 files. Slice instances: `src/app/public/robs-top-50/page.tsx:82`, `stats/page.tsx:92`, `stats/unique-artists/page.tsx:95`, `stats/genres/page.tsx:92,107` (year pills should be `ToggleGroup`/`Tabs`/`Button`).
- `<img>` instead of `next/image`: `src/app/public/lyrics/[slug]/page.tsx:84`, `top-50-year-view.tsx:53`.
- Drawer-over-Dialog: no violation in this slice.
- Launch UI is hand-rolled HTML/CSS/JS (E17).
- `src/components/ui/` contains non-CLI files (`combobox-filter.ts`, `combobox-filter.test.ts`, hand-rolled `field-group.tsx`) outside what the CLI generates.

### React effects (partial)
- Derived state synced by effect: `src/app/public/robs-top-50/page.tsx:32`, `stats/page.tsx:35`, `stats/unique-artists/page.tsx:36`, `stats/genres/page.tsx:51` all copy `searchParams`/`publishedYears` into `selectedYear` state. Derive: `const activeYear = paramYear in published ? paramYear : userPick ?? defaultYear`.
- Fetch in effect: `src/lib/auth-context.tsx:31`, `src/lib/hooks/use-auth-token.ts:15` (E14).
- Repo-wide: 78 `useEffect(` calls; those two hooks lack the required one-line "syncs with X" comment (`visibilitychange` listener is legit, the fetch is not).

### Forms (non-conforming)
- `src/app/login/login-form.tsx:13-17`: `useState`-driven login, hand validation (`"Invalid credentials"`), no Zod, no `Field`. Needs TanStack Form + Zod schema `{ username: min(1), password: min(1) }`, `Field`/`FieldError`, `toast`/form-level error.
- Repo-wide 10 other `<form>` files: `lyrics/page.tsx`, `lyrics/_components/credit-defaults-drawer.tsx`, `articles/new/page.tsx`, `concerts/venues/page.tsx`, `concerts/_components/discover-venues-card.tsx`, `birthdays/_components/birthday-form.tsx`, `playlist-lyrics/_components/playlist-lyrics-editor.tsx`, `spotify-playlister/_components/song-review-card.tsx`, `smart-playlists/_components/recipe-form.tsx`. Launch dialogs use hand-written DOM forms.
- No shared Zod schemas feed Convex args anywhere (launch uses Convex validators only).

### Dark mode (broken)
- E13. Also `login-form.tsx:56` `text-red-500` (use `text-destructive`); `public/lyrics/[slug]/page.tsx:178` `print:border-gray-300 print:bg-gray-50` (print-only, acceptable but hardcoded). `launch.html` has its own CSS and no theme support at all.
- `layout.tsx:19-21`: font CSS variable named `--font-geist-sans` is assigned to Source Sans 3 (misleading).

### Toasts: conforming (`Toaster` once at `layout.tsx:46`). Login errors are inline text; acceptable but a toast is the stated convention for user-facing errors.

### Env (mostly conforming)
- `process.env` in `src/` outside `env.js`: `src/trpc/react.tsx:49,76,77` (dies with tRPC removal). `convex/s3Helper.ts` reads `process.env` and executes inside Next via `rate-your-music/covers/route.ts:6` (E11).
- `SESSION_SECRET` required but unused (E2); `OPENAI_API_KEY` is validated but only read implicitly by `@ai-sdk/openai`.
- All Convex-side env (`TICKETMASTER_API_KEY`, `SPOTIFY_*`, `AWS_*`, `CLOUDFRONT_DOMAIN`, `S3_BUCKET_NAME`, `SPOTIFY_SYNC_USER_ID`) is undeclared; Convex 1.41+ supports typed env in `convex/convex.config.ts` (`defineApp({ env })`), which `_generated/ai/guidelines.md` recommends over `process.env`. No `convex.config.ts` exists.
- `emptyStringAsUndefined` + required server vars means a build needs all secrets (use `SKIP_ENV_VALIDATION` in CI).

### Auth: see E1-E3, E14-E16 and the analysis above. AGENTS.md's Auth section describes an architecture that does not exist.

### Convex (partial)
Conforming: `launch.ts`/`launchActions.ts` use object form, `args` + `returns` everywhere, `v.id`, `v.literal` unions, `withIndex("by_key")` on the singleton, `take(MAX+1)` in reads, `Date.now()` only in mutations, `null` returns, no `"use node"` mixing (none in repo), correct import table (verified: no `import ... from "convex/server"` registrations), `ConvexError`-style structured errors in `launchLayoutError`. Date columns are Unix ms.
Drift:
- E1, E4, E6-E11, E18, E19 above.
- Internal vs public: 385 public, 28 internal. Only `rankingSnapshots.orchestrateSunday`, parts of `forLaterAlbums`/`migrations` are internal.
- `convex/model/` does not exist; the real convention is `convex/_utils/` (about 100 files, 41 tests) imported by both Convex and `src/` (22 `src` files import `convex/_utils/*`). Monoliths remain: `spotify.ts` 4151 lines, `forLaterAlbums.ts` 2124, `playlistLyrics.ts` 1982, `geniusAlbums.ts` 1851.
- No auth-wrapped custom functions; `convex-helpers` used for `stream` only.
- Public mutations that are one-off scripts live in `convex/migrations/` (public `mutation`s, no `@convex-dev/migrations`).
- Calendar dates: `YYYY-MM-DD` convention not violated in this slice.

### Schema: tables, indexes, growth (73 tables; `[n]` = index count)

- Singletons / tiny config (no growth concern): `folioSocietyConfig [0]` (read with `.first()`, no index needed), `musicFunnelSettings [1]`, `backfillProgress [1]`, `launchLayoutState [1]` (singleton by `by_key`; `recentOperationIds` capped to 50, `launchLayout.ts:224`), `rooYears [2]`, `launchProjects [0]` (cap 100), `launchBookmarks [0]` (cap 500).
- Reference/catalog (bounded by domain): `folioSocietyReleases [9]`, `folioSocietyProductDetails [4]`, `folioSocietyImages [5]`, `bookSearch [3]`, `geniusCreditLabels [3]`, `rateYourMusicGenres [4]`, `rateYourMusicGenreRelationships [5]`, `rateYourMusicDescriptors [2]`, `concertVenues [2]`, `userConcertVenues [3]`, `spotifyPlaylists [3]`, `smartPlaylists [2]`, `articles [2]`, `birthdays [1]`, `concertCalendarFeeds [2]`.
- **Likely to grow unbounded (need pagination/`take` everywhere they are read; check each reader):** `spotifyPlayEvents [3]`, `userAlbumListens [6]`, `spotifyTracks [5]` (legacy), `userTracks [4]`, `spotifyTracksCanonical [2]`, `spotifyAlbums [4]`, `albumLibraryItems [13]`, `forLaterAlbumItems [16]` plus its 3 facet tables and `forLaterAlbumRecommendations [2]`, `forLaterSyncRuns [2]`, `musicFunnelTrackEncounters [6]`, `musicFunnelPlaylistWrites [4]`, `musicFunnelRuns [2]`, `musicFunnelSourceRuns [3]`, `spotifySyncLogs [3]`, `spotifySyncRuns [2]`, `ratingHistory [3]`, `manualRankingSnapshotEntries [3]` (weekly x ~50), `albumDuels [1]`, `albumDuelScores [2]`, `rateYourMusicScrapes [3]`, `rateYourMusicSpotifyAlbumLinks [4]`, `rateYourMusicReleaseGenres/Descriptors [2 each]`, `geniusSongs [2]`, `geniusLyricScrapes [3]`, `playlistLyricsItems [3]`, `concertEvents [8]`, `userConcertEvents [8]`, `spotifySongCategorizations [4]`, `spotifyPendingSuggestions [2]`, `albumEnrichmentTrials [3]`, `birthdayReminderDeliveries [1]`.
- Others: `folioSocietyOwnership [2]`, `geniusAlbums [2]`, `playlistLyrics [3]`, `spotifyConnections [2]`, `spotifyArtists [2]`, `albumEnrichments [3]`, `albumCoverDescriptorFacets [2]`, `albumOccasionFacets [2]`, `musicFunnelSources [3]`, `userAlbums [3]`, `manualRankingSnapshots [1]`, `robRankingYears [2]`, `robRankingAlbums [3]`, `rooArtists [3]`, `rooTracksAdded [3]`.
- Index naming: all `by_*`; several omit the full field list contrary to the guideline ("by_userId_active" vs fields `["userId","isActive"]`, `by_user_year_week`, `by_snapshotId` = `["snapshotId","ordinal"]`, `by_user`, `by_published`). Cosmetic.
- Redundant prefix indexes (`by_userId` is a prefix of `by_userId_*` on ~15 tables, `by_isActive` on `folioSocietyReleases`, etc.): every prefix is already served by the longer index; the short ones only matter if no longer index exists. Dropping them reduces write cost (candidates: `forLaterAlbumItems.by_userId_active` vs `by_userId_isActive_lastSeenAt`, `rateYourMusicGenreRelationships.by_parentGenreId`, `concertEvents.by_venueId`).
- Indexes with no code reference anywhere in `convex/`, `src/`, `scripts/` (name-literal search, excluding schema): `folioSocietyReleases.{by_firstSeenAt,by_lastSeenAt,by_isActive}`, `folioSocietyProductDetails.{by_lastFetchedAt,by_fetchStatus}`, `folioSocietyImages.by_isActive`, `geniusSongs.by_trackNumber`, `geniusLyricScrapes.by_scrapeStatus`, `spotifyConnections.by_spotifyUserId`, `albumLibraryItems.by_userId_appearsInForLater_createdAt`, `albumCoverDescriptorFacets.by_coverDescriptorKey_albumId`, `albumOccasionFacets.by_occasionKey_albumId`, `albumEnrichmentTrials.by_albumId_and_slice`, `forLaterAlbumItems.{by_userId_albumTitleKey,by_rymDiscoveryStatus,by_userId_rymScrapeId,by_userId_rymDiscoveryStatus,by_userId_filter{ReleaseYear,HasListened,RymMatched,HasRymUrl}_lastSeenAt,search_forLaterAlbumItems}`, `forLaterAlbum{Genre,Duration,Descriptor}Facets.by_userId_*Key_lastSeenAt`, `forLaterSyncRuns.by_spotifyPlaylistId_startedAt`, `musicFunnelSources.by_userId_spotifyPlaylistId`, `musicFunnelRuns.by_userId_status_startedAt`, `musicFunnelSourceRuns.by_sourceId_startedAt`, `musicFunnelTrackEncounters.by_sourceId_createdAt`, `ratingHistory.by_userAlbumId_ratedAt`, `manualRankingSnapshotEntries.{by_user_year_week_ordinal,by_user_album_week}`, `spotifyArtists.by_name`, `rooArtists.by_artistId`, `rateYourMusicGenreRelationships.{by_parentGenreId,by_childGenreId,by_parentKey,by_childKey,by_parentGenreId_childGenreId}`, `concertVenues.by_name`, `concertEvents.{by_dedupeKey,by_venueId_dateTime,by_venueId_dateRangeStart,by_dateTime,by_dateRangeStart}`, `userConcertEvents.{by_userId_eventDate,by_userId_venueId_eventDate}`. Several of the `forLaterAlbumItems`/`concertEvents` ones look like in-flight or planned work (verify before dropping).
- `v.id` is used in 62 places; remaining `*Id: v.string()` are genuine external Spotify/Ticketmaster ids (OK). `userId: v.string()` on ~40 tables is by design (single user, no `users` table).
- `v.any()` in 3 places: `schema.ts:74, 169, 191`. Optional fields: 398 `v.optional` (many are legacy migrations, see E18).
- Adding indexes to large tables: none staged; Convex 1.41 guideline recommends `staged: true` for large existing tables (`albumLibraryItems`, `forLaterAlbumItems`, `userAlbumListens`) next time an index is added.

### Tests (partial)
- Layout: Vitest in `vitest.config.ts` (environment set globally to edge-runtime, so the `// @vitest-environment` pragma AGENTS mentions is unnecessary) but includes only 5 launch files. Playwright covers Launch DnD against a `python3 -m http.server` of `public/` (`playwright.config.mjs:15`), not the Next app. `node:test` runs the rest (136 files, 555 total test files incl. `roberts-records` vendored deps, which is gitignored).
- Launch Convex suites: 2 of 5 use `convexTest` (`launch-layout.test.ts`, `launch-migration.test.ts`); `launch-environments.test.ts` and `launch-layout-source.test.ts` assert on regexes over `launch.ts` source (brittle; e.g. `launch-environments.test.ts:4-6`). `launch-actions.test.ts` imports from a Convex module. No auth test (none possible now).
- No `pnpm test` script, no CI. No test for `middleware.ts`, `/api/auth`, `use-auth-token`, `src/env.js`, `convex/auth.ts` (the most security-relevant code has zero tests).
- 8 failing tests (E12).
- AGENTS rule "Bugs: write a failing test first": followed for Launch (migration/layout tests), cannot be audited elsewhere.

### Code style
- `function` declarations: conforming in slice. `type` aliases: conforming. Kebab-case files: Convex files are camelCase (`launchActions.ts`, `s3Helper.ts`), required by Convex module naming for function modules, but `src/providers/ConvexProvider.tsx` is PascalCase (rule says kebab-case).
- `any`: 9 `noExplicitAny` errors (1 `rooleases.ts`, 5 `spotify.ts`, 3 generated); `!` assertions 20 (`bandcampReleaseDate.ts` x3, `migrateRatingsToThreeTier.ts`, `s3Helper.ts` x4 with `<explanation>` placeholders).
- Explicit return types on exported functions: `launch.ts` exports are Convex registrations (fine); `src/lib/auth-context.tsx` `AuthProvider`, `useAuth` lack explicit return types; `middleware()` lacks one.
- Main-component-first ordering: conforming in `login-form.tsx`, `layout.tsx`.

---

## Suggested changes (ranked, with effort)

| # | Change | Effort |
|---|---|---|
| 1 | Make `getAllConnections`, `getConnection`, `updateTokens` internal or token-free; make all `migrations/*` and `launch.backfill/verify` internal; delete `getAllConnections` (E1) | S |
| 2 | Sign session cookie with `SESSION_SECRET` (HMAC, constant-time compare); verify in middleware; default-deny matcher (E2, E3) | S-M |
| 3 | `previewLink`: http/https allowlist, timeout, response cap (+ auth after #5); same scheme allowlist in both `normalizeUrl`s (E4, E5) | S |
| 4 | Remove dead tRPC + `TRPCReactProvider`, delete deps (`@trpc/*`, `@tanstack/react-query`, `superjson`, `server-only`), unused `cheerio`, `ts-node`, `cn` | S |
| 5 | Convex JWT auth + `convex-helpers` `authedQuery/Mutation/Action`; migrate 171 `requireAuth` sites and `userId` args (E1) | L (3-5 days) |
| 6 | Add `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `suppressHydrationWarning` on `<html>`), theme toggle in `site-header` (E13) | S |
| 7 | Cap/validate public query args; filter public listings by a real `isPublic`/`published` flag; use index + `take` (E7) | S-M |
| 8 | Launch: replace `.collect()` with the bounded helper, diff-only patches in `persistPadZones`, tighten `tags` to `launchTagValidator`, share one URL normalizer in `_utils/` (E6, low items) | S-M |
| 9 | Fix `convex-module-paths.test.ts` to skip multi-dot files; update the 7 drifted source tests; add `pnpm test` (vitest) and a CI workflow running `typecheck`, `check`, `test` (E12) | S-M |
| 10 | Biome: `files.ignore` for `convex/_generated`, `public/`; run `pnpm check:write`; fix remaining 20 lint errors (`!`, `any`, a11y) | S-M |
| 11 | Replace derived-state effects on 4 public pages; replace raw `<button>`/`<img>`; login form to TanStack Form + Zod + `Field`; validate `next` redirect | M |
| 12 | `crons.weekly` -> `crons.cron`; move Vercel/Pages-Router cron handlers to `convex/crons.ts` + internal actions; delete `convex/migrate.ts` | M |
| 13 | Add `returns` validators to the 185 functions (use `convex-helpers/validators` `doc()` / schema-derived object validators); add `args: {}` to the 7 missing | M-L (mechanical, per-module) |
| 14 | Schema hygiene: literal unions for the 6 string enums, finish optional-field backfills (`padPosition`, `position`, legacy `spotifySongCategorizations`/`userTracks` fields), drop unused/redundant indexes after verifying | M |
| 15 | Replace unbounded `.collect()` across E8 list (pagination/`take`, or counters/aggregate) | M-L |
| 16 | Port Launch to `src/app/launch/` (shadcn, typed `api.launch.*`, auth, theme, no esm.sh) and stop serving tests from `public/` | L |
| 17 | `s3Helper`: pass the `Uint8Array` directly (or `.slice().buffer`), swap hand SigV4 for `ctx.storage` (or `aws4fetch`; ask first), remove from Next import path | S-M |

## Repo-wide migration plan (ordered)

1. **Delete dead weight (S, 1-2 h).** tRPC (`src/server/api`, `src/trpc`, `src/app/api/trpc`, provider in `layout.tsx`), deps `@trpc/client|react-query|server`, `@tanstack/react-query`, `superjson`, `server-only`, `cheerio`, `ts-node`, `cn`; `convex/migrate.ts`. Check with `pnpm typecheck`.
2. **Platform safety first (S-M, 1 day): items 1-3 above** (internalize token/migration functions, signed cookie, default-deny middleware).
3. **Radix -> Base UI (M-L, 1.5-2.5 days).** Use the `migrate-radix-to-base` + `shadcn` skills. Switch `components.json` `style` to the Base UI variant, re-add primitives with `pnpm dlx shadcn@latest add <name> --overwrite` for the 13 Radix-backed files (`alert-dialog, button, checkbox, dialog, dropdown-menu, label, popover, select, separator, sheet, slider, tabs, tooltip`); `button.tsx` loses `Slot`/`asChild` in favor of `render={<Link .../>}`; convert 70 `asChild` uses in 45 files (codemod-able except `Select`/`DropdownMenu` item composition); then remove `radix-ui` and the 8 `@radix-ui/*` packages. Keep `vaul` for `drawer` (shadcn still ships it). Verify with typecheck and a visual pass on Select/Dialog/Tooltip. Add the missing shadcn `field`, `table` (1 raw table), `toggle-group`/`tabs` for pills.
4. **Icons (S, 2 h).** lucide is already canonical. Replace 5 inline SVG files with lucide icons; decide on `simple-icons` (1 use) and either document it in the Stack table or inline the one logo as a component.
5. **next-themes + dark mode (S, 1-2 h).** `ThemeProvider attribute="class" defaultTheme="system" enableSystem` in `layout.tsx`; toggle (shadcn `dropdown-menu`) in `SiteHeader`; audit hardcoded colors (`text-red-500` etc.) and Launch.
6. **date-fns (S-M, half day).** `pnpm add date-fns`; replace the ~34 manual date formatting sites with `format`/`formatDistanceToNow`/`parseISO` (keep Unix ms in Convex, `YYYY-MM-DD` strings for calendar dates).
7. **Forms (M-L, 2-3 days).** Install shadcn `field`; define Zod schemas in `src/lib/schemas/*` or `convex/_utils` (relative-import-only so Convex mutations reuse them); convert login + 10 `useState` forms to TanStack Form. No `react-hook-form` to remove (not installed).
8. **Convex auth wrapper (L, 3-5 days): the design above**, including stage 2 server callers; then drop `userId` args and `requireAuth`.
9. **`convex/model/` extraction (L, ongoing).** Decide the real convention first: either rename AGENTS to `convex/_utils/` (recommended: it exists, ~100 files, imported by `src`) or move to `model/`. Then split the monoliths (`spotify.ts` 4151, `forLaterAlbums.ts` 2124, `playlistLyrics.ts` 1982, `geniusAlbums.ts` 1851) into thin public functions over `_utils`/`model` helpers, one module per PR, adding `returns` validators and bounded reads as each is touched.
10. **Test runner consolidation (M, 1-1.5 days).** Set `vitest.config.ts` `include: ["**/*.test.{ts,tsx,mjs}"]`, exclude `.worktrees`, `roberts-records`, `tests/` (Playwright), keep `environment: "edge-runtime"` for `convex/**` only via `environmentMatchGlobs`/projects and `node` for `src/**`; mass-convert `import test from "node:test"`/`node:assert` to `vitest` (`assert` can stay as `node:assert/strict`; only the `test/describe` import and `t.mock` need changes; no `mock`/`describe` usage was found in the node:test files). Add `pnpm test` and a CI job (`typecheck`, `check`, `vitest run`). Playwright stays for Launch/UI.
11. **Convex hygiene sweep (M-L).** `returns` validators, bounded reads, `staged` indexes, literal unions, `crons.cron`, typed env in `convex/convex.config.ts`.
12. **Biome clean-up (S-M).** Ignore generated/public, run format+organizeImports (129 auto-fixable), then fix the ~60 manual diagnostics; add to CI so it stays green.

## AGENTS.md corrections

1. **Auth section is inaccurate.** There is no access token validated by `validateSessionToken` (it is never called); `X-Access-Token` carries the Spotify OAuth token; `useAuthToken()` returns `{ userId, isLoading }` (username), not a token; the middleware covers only 9 prefixes; `requireAuth` is a no-op; Convex has no auth provider. Rewrite to the intended design (signed session cookie, Convex custom JWT, `authedQuery/Mutation/Action` from `convex/functions.ts`) once it lands, and state today's limits explicitly until then.
2. **UI/Stack says "shadcn on Base UI, not Radix"** but 13/14 primitives and `components.json` (`new-york`) are Radix. Either add "migration in progress" or finish step 3.
3. **"Not Pages Router" / "API routes are for external integrations only"** conflict with `src/pages/api/cron/*` (8 files, Vercel cron, bearer `CRON_SECRET`) and with ~25 data-shaped routes under `src/app/api/spotify`, `smart-playlists`, `music-funnel`, `for-later-albums` that call public Convex via `ConvexHttpClient`. Add a "Scheduled jobs" rule (Convex crons -> internal actions) and an explicit list of legacy route groups.
4. **"Business logic in `convex/model/`"**: directory does not exist; reality is `convex/_utils/` (shared with `src/`), and `src/lib/` holds client-only logic. Document `_utils/` or migrate.
5. **"Pure logic goes in `src/lib/` ... Code in `src/lib/` that Convex imports"**: Convex never imports `src/lib`; `src/` imports `convex/_utils` (22 files). Reverse the sentence.
6. **Test commands:** `node --test path/to/file.test.ts` does not work on the installed Node 22.14 without `--import tsx`; add the flag or move to Vitest. Note vitest currently runs only `convex/launch-*.test.ts`. Remove the `// @vitest-environment edge-runtime` instruction (config sets it globally) or move to per-file environments when step 10 lands.
7. **Stack table lists `date-fns` and `next-themes` as in use**: `date-fns` is not installed; `next-themes` is installed but no provider is mounted. Also lists "Env: process.env not allowed in `src/`" yet `convex/s3Helper.ts` is imported by a Next route.
8. **Features list is missing `/launch.html`** (static page in `public/`, Convex `launch*`), and the zine tooling (`src/components/zine`; no `/zine` route listed). Queue lives at `/albums/up-next`, covered by `/albums`. Add `launch` with its non-standard location, or move it into `src/app/launch/`.
9. **"Biome enforces sorted classes"**: the rule is `warn` only (`biome.jsonc:12`) and `pnpm check` currently fails; mention `check:write` before commit or make it an error after cleanup.
10. **Convex section:** add the rules the codebase needs and the guidelines state: "no `crons.weekly/daily/hourly`", "one-off migrations are `internal*` (or `@convex-dev/migrations`), never public", "queries never take a `userId` arg once auth lands", "public pages use `publicQuery` with capped args". Remove the "~195 call sites" language if cited elsewhere (actual count: 171 `requireAuth(` call sites).

# AGENTS.md conformance audit

Nine slice audits, each run against `AGENTS.md` with the `convex-expert` skill applied to its Convex files. Source code was not changed. Date: 2026-10-07.

| Report | Pages |
|---|---|
| [launch-public-and-platform](launch-public-and-platform.md) | launch, public, login, schema, crons, auth, tRPC, deps/config. **Has the auth plan and the 12-step migration plan.** |
| [albums](albums.md) | albums |
| [for-later-and-enrichment](for-later-and-enrichment.md) | for-later-albums, album-enrichment |
| [music-funnel-and-home](music-funnel-and-home.md) | music-funnel, home |
| [playlist-tools](playlist-tools.md) | spotify-playlister, smart-playlists, playlist-lyrics |
| [rankings-and-rooleases](rankings-and-rooleases.md) | robs-rankings, rooleases |
| [lyrics-and-articles](lyrics-and-articles.md) | lyrics, articles |
| [books-and-folio-society](books-and-folio-society.md) | folio-society, books, bookcase |
| [concerts-and-birthdays](concerts-and-birthdays.md) | concerts, birthdays |

## Findings that appear in several reports

### 1. Convex and most routes are effectively unauthenticated (critical)
- `requireAuth` in `convex/auth.ts` is a no-op, `auth.config.js` has no providers, and 385 of 413 Convex functions are public. `requireAuth(` has 171 call sites.
- The session cookie is unsigned `base64(user:ms)`; `SESSION_SECRET` is never used. Middleware only checks that the cookie exists, on 9 path prefixes. `/albums`, `/smart-playlists`, `/api/spotify/*` and most `/api` routes are outside the matcher.
- `spotify.getConnection` / `getAllConnections` return Spotify access and refresh tokens to any caller. Found in albums, music-funnel, rankings and playlist-tools.
- Mutations trust a client-supplied `userId` (every slice).
- Public destructive/backfill mutations and public Ticketmaster/scrape actions exist.
- Fix plan: Convex custom-JWT auth plus `convex-helpers` `authedQuery` / `authedMutation` / `authedAction`. See the Auth analysis section of the platform report.

### 2. Other security
- Stored XSS: `articles/print/page.tsx:343` renders unsanitized HTML.
- SSRF: `/api/extract-article`, `/api/scrape-genius` (host check is `.includes("genius.com")`), `launchActions.previewLink`; Launch accepts any URL scheme.
- Spotify OAuth flow has no `state` parameter; `POST /api/spotify/refresh-token` is unauthenticated.

### 3. Real bugs (not style)
- Birthday email failures recorded as sent (Resend returns `{data, error}`, not throw); birthday cron uses a different user id than the pages.
- `/music-funnel` loads forever when logged out.
- `articles.getStats` always returns 0.
- Image pipeline uploads non-OK responses to S3 as JPEG.
- `updateEventUserStatus` wipes `notes`; `recordAlbumListen` mishandles first/last listened.
- Playlister caches `undefined` suggestions; AI-returned track/playlist ids are not validated.
- `ranking-board.tsx` stale optimistic positions; `ConvexError` not used, so users see a generic "Server Error".

### 4. Unbounded reads and missing `returns`
- Unbounded `.collect()` on growing tables in nearly every slice, several reactive and shipping raw payloads to the browser (`getUserAlbums`, `getAvailableAlbums`, `searchArtists`, `getUiSummary`, folio `enrichDetails`).
- Full-table `.filter` scans: `forLaterAlbums.ts:1816`, `getActiveImagesByProduct`.
- 185 functions have no `returns` validator.
- About 50 indexes are never referenced; every `withIndex` call does match a real index.

### 5. Library and convention drift
- 13 of 14 shadcn primitives are Radix (Base UI only in `combobox`). 13 files import Radix.
- Forms: 10 of 11 use `useState`; none of the audited forms use TanStack Form + Zod, and shadcn `Field` is not installed.
- `date-fns` not installed; `next-themes` not mounted, so dark mode cannot activate; hardcoded light-only colors.
- Raw `<button>`, `<select>`, `<img>`, `<table>`, `window.confirm`; Dialogs where Drawers belong.
- `useEffect` misuse (state-copy effects, no justification comments): about 49 files.
- tRPC is dead scaffolding. `src/pages/api/cron/*` is Pages Router.
- Biome: `pnpm check` reports 190 errors repo-wide.
- Dead code: unused facet tables / search index, 11+ uncalled public functions, `src/lib/album-enrichment/*` duplicate, `scrapeAndStoreAlbum`, three dead concert components.

### 6. Tests
- Documented `node --test` fails on installed Node 22.14. `node --import tsx --test` (or `npx tsx --test`) works; 8 of 895 tests fail repo-wide.
- Vitest only includes `convex/launch-*.test.ts`. No `convex-test` coverage for most modules. Many `*-source.test.ts` files are regex-on-source and brittle.

## AGENTS.md corrections needed (consolidated from all nine reports)

These are wrong or aspirational today. Decide, per item, whether to change the code or the doc.

| AGENTS.md says | Reality |
|---|---|
| shadcn on Base UI | Radix nearly everywhere |
| Auth wrappers / `validateSessionToken` + `X-Access-Token` | Not how it works; `userId` passed as an arg, cookie unsigned |
| Logic in `convex/model/` | Directory doesn't exist; shared code is in `convex/_utils/` |
| `convex-helpers` custom functions | Not used |
| TanStack Form + `Field` | Only 1 file; `Field` not installed |
| date-fns, next-themes | Neither installed/mounted |
| `node --test path` | Fails on Node 22.14; use `node --import tsx --test` |
| Vitest for tests | Config only covers `convex/launch-*.test.ts` |
| Env via `~/env.js` only | Violations exist; env handling differs in places |
| Birthdays `YYYY-MM-DD` | Not stored that way |
| API routes only for external integrations | Data-shaped routes and Pages Router crons exist |
| Launch is a feature page | Static `public/launch.html` outside the Next app |

## Suggested order of work
1. Auth: sign the session cookie, widen the middleware matcher, stop returning Spotify tokens, add Convex auth wrappers, make backfill/migration/scrape functions internal. (Platform report, steps 1-3.)
2. Fix the security items in section 2 and the real bugs in section 3.
3. Bound the reactive reads and add indexes where `.filter` scans remain (section 4).
4. Make `AGENTS.md` truthful (table above), then migrate toward the Stack table in the platform report's order: Radix → Base UI, forms, theming, date-fns, `convex/model/`, test-runner consolidation.

## Open questions
- Is `sync-smart-playlists` scheduled anywhere outside this repo? (No entry in `vercel.json`, `convex/crons.ts`, or `infra/`.)
- Should the bookcase hex palette be an `AGENTS.md` exception to the "no hardcoded colors" rule?

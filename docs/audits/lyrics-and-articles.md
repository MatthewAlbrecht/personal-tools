# Audit: `lyrics` + `articles` slice vs AGENTS.md

Audited 2026-10-07. Read-only. `pnpm typecheck` (`tsc --noEmit`) is clean. The 32 slice node:test tests pass under `npx tsx --test` (see Tests section for how they are actually run).

## Scope (files reviewed)

- Pages/components: `src/app/lyrics/{layout,page}.tsx`, `lyrics/[slug]/{page,edit/page,zine/page}.tsx`, `lyrics/playlists/page.tsx`, `lyrics/_components/{album-lyrics-editor,album-lyrics-zine,credit-defaults-drawer,spotify-album-map-drawer,lyrics-tabs}.tsx`, `src/app/articles/{page,new/page,print/page}.tsx`.
- Convex: `convex/geniusAlbums.ts` (1851 lines), `convex/geniusCreditLabels.ts`, `convex/articles.ts`, plus the two `convex/spotify.ts` mutations the editor calls (`bulkUpsertDiscographyAlbums`, `ingestSpotifyAlbumTracksForLyrics`, read only for auth shape), `convex/schema.ts` (tables `geniusAlbums`, `geniusSongs`, `geniusLyricScrapes`, `geniusCreditLabels`, `articles`), `convex/_utils/genius*.ts`.
- API routes: `src/app/api/{scrape-genius,extract-article,migrate-lyrics}/route.ts`, `src/middleware.ts`, `scripts/migrate-lyrics-to-prod.js`.
- src/lib: `lib/hooks/{use-auth-token,use-debounced-state}.ts`; `src/lib/zine/*` and `components/zine/*` were only skimmed (shared zine code, out of scope).
- Tests: `convex/genius-spotify-mapping-search.test.ts`, `convex/_utils/genius*.test.ts`, `vitest.config.ts`.
- Not in the slice: `playlist-lyrics`, `public/lyrics`, `playlistLyrics.ts`, `migrate-playlist-lyrics`. They share tables and functions, so they are noted where relevant.
- No `"use node"` file exists in the slice. All scraping lives either in a Next route or in a default-runtime action (`fetch` needs no `"use node"`), so there are no split violations.

## Summary table

| Section | Status | #findings |
|---|---|---|
| Stack (Radix/Base UI, forms, dates, icons, env, API-route use) | Drift | 6 |
| UI rules (shadcn, raw tags, Drawer) | Drift | 8 |
| React effects | Drift | 4 |
| Forms (TanStack Form + Zod) | Non-conformant | 4 |
| Dark mode | Drift | 4 |
| Toasts | OK | 0 (minor: unhandled clipboard promise) |
| Env | OK | 0 (`migrate-lyrics` uses `~/env.js`; `scripts/` reads `process.env`, fine for scripts) |
| Auth | Non-conformant (depends on no-op `requireAuth`) | 5 |
| Convex | Mixed | 14 |
| Tests | Drift | 5 |
| Code style | Mostly OK | 4 |

## Errors & risks (ranked)

### High

1. **Stored XSS in article print view.** `src/app/articles/print/page.tsx:343` renders `dangerouslySetInnerHTML={{ __html: article.content }}`.
   - `content` is Readability output from an arbitrary URL or from user-pasted HTML (`extract-article/route.ts`). Readability does not sanitize and there is no sanitizer in package.json (no dompurify or sanitize-html).
   - Since `createArticle` is publicly callable, anyone with the Convex URL can also insert arbitrary HTML that renders in the owner's session.
   - Fix: sanitize on write in `extract-article` (add a sanitizer, which needs approval as a new dependency), or render in a sandboxed iframe.

2. **Unauthenticated SSRF and scraping proxies.**
   - `src/middleware.ts` matcher covers `/api/migrate-lyrics` only. `/api/extract-article` and `/api/scrape-genius` are open to the internet.
   - `extract-article/route.ts:52` does `fetch(url)` on any user URL. There is no scheme or host allowlist, no private-IP block, no timeout, no size cap, and redirects are followed. It will fetch `http://169.254.169.254/...` or an internal host and return the parsed body.
   - `scrape-genius/route.ts:176` and `convex/geniusAlbums.ts:937` validate with `.includes("genius.com")`. `https://evil.example/genius.com` and `http://127.0.0.1/?genius.com` both pass.
   - Track URLs scraped from the page are followed by `normalizeGeniusTrackUrl` (`convex/_utils/geniusParser.ts:338`), which accepts anything starting with `"http"`. A hostile page can steer the loop to arbitrary hosts (up to N serial fetches).
   - Fix: parse with `new URL`, require `https:` and hostname `genius.com` or `*.genius.com`, and enforce the same check on every followed track URL. Add a session check to both routes. Add `/api/extract-article` and `/api/scrape-genius` to the middleware matcher, or validate the cookie in the route. For extract-article, block private IPs, set a timeout and a response-size limit, and use `redirect: "manual"`.

3. **`/lyrics/**` (except `/lyrics/playlists`) and every lyrics/articles Convex function are effectively public.**
   - Middleware only protects `/lyrics/playlists`. `/lyrics`, `/lyrics/[slug]`, `/edit` and `/zine` pages render for anonymous visitors.
   - Dependence on the no-op `requireAuth`: every mutation in `geniusAlbums.ts` and `geniusCreditLabels.ts` (`deleteAlbum`, `deleteSong`, `updateZineCoverImage`, `refreshCreditLabels`, `generateZineCoverUploadUrl`, `upsertAlbumForSync`, `replaceSongsForSync`, ...) is callable by anyone who knows the deployment URL.
   - `generateZineCoverUploadUrl` gives anonymous file upload. `deleteAlbum` and `replaceSongsForSync` destroy data.
   - `articles.ts` skips `requireAuth` entirely. It uses the fixed `userId = "authenticated-user"`, which is not authorization. `createArticle` accepts up to 1MB blobs from anyone.
   - Out of this slice's control, but note this slice relies on it with no second layer. Ties into finding 2 and into `searchSpotifyAlbumsForMapping`, which trusts a client-supplied `userId` (see Convex section).

4. **`refreshCreditLabels` is an unbounded scan in one mutation.** `convex/geniusCreditLabels.ts:~118,~131` run `ctx.db.query("geniusSongs").collect()` and `ctx.db.query("geniusLyricScrapes").collect()` inside a single mutation.
   - Every song row carries full lyrics, about text and credits. This will hit the 16MB / 32k-doc read limit as the library grows, and the Credit defaults "Refresh labels" button then hard-fails.
   - Fix: paginate or batch via scheduled internal mutations (`.paginate` or `.take` plus `ctx.scheduler.runAfter`), persisting a cursor. Alternatively maintain labels incrementally at scrape time (`ensureCreditLabel...` already exists for the hide path).

5. **`listAlbumsForSync` (used by `/api/migrate-lyrics` and `scripts/migrate-lyrics-to-prod.js`) has the same problem.**
   - `convex/geniusAlbums.ts:1445-1451` does `.collect()` on all albums, then `.collect()` on all songs of each album, in one query returning every lyric in the library. It will exceed read and return-size limits.
   - It is also a public query (`requireAuth` no-op), so anyone can dump the full library.
   - Fix: paginate (`paginationOptsValidator`, one album plus songs per page) and have the route and script loop over pages.

6. **`/api/migrate-lyrics` silently drops data and hard-couples prod to dev.**
   - Sync validators omit these fields, which exist in schema and are used by the editors:
     - album: `zineCoverShowTitle`, `zineDrcLogoFrontCorner`, `zineDrcLogoBackCorner`, `zinePageRecommendations`, `zineIntroBold`, `albumArtUrl`
     - song: `zineCollapseWithPrevious`, `albumArtUrlOverride`, `zinePageRecommendations`
   - `upsertAlbumForSync` then patches existing prod albums with `undefined` for the keys it does write and does not touch the omitted ones, so prod drifts silently.
   - `spotifyAlbumConvexId` is forced to `undefined` (`:1666`), so the Spotify mapping is lost.
   - Storage-backed covers sync as a dev-deployment storage URL (`resolveAlbumCoverImageUrl`). Prod ends up pointing at dev storage, and `zineCoverImageStorageId` is cleared.
   - The route authorizes by cookie presence only (`route.ts:9`), not validity. It runs 2 mutations per album, serially, with no `maxDuration`.
   - Fix: derive the sync validator from the schema validators (`v.object` `.omit`/`.pick` per the guidelines), upload covers to prod storage, and use validated auth.

7. **`articles.getStats` is always `{ total: 0 }` (functional bug, visible on `/articles`).**
   - `convex/articles.ts:108-125` uses `ctx.auth.getUserIdentity()`. `convex/auth.config.js` has `providers: []` and `ConvexProvider` never calls `setAuth`, so identity is always `null`.
   - Meanwhile the other four functions use the fixed `"authenticated-user"` string. The "N articles saved" header therefore always reads "0 articles saved".
   - It also has no `args`/`returns` and uses an unbounded `.collect()` for counting, which the guidelines forbid.
   - Fix: use the same fixed owner id, or drop `getStats` and use `articles.length`. Best fix is a denormalized counter, or just do not show the stat.

### Medium

8. **`listArticles` and `getArticlesByIds` ship full `content` and `textContent` for every article.**
   - The list view (up to `limit` articles, client-chosen, no max) needs only metadata. `textContent` is never rendered anywhere in the slice, and the page's list needs only meta fields.
   - It is a reactive query, so every insert, delete or title change re-sends up to 100 full documents (each up to hundreds of KB, both HTML and text copies).
   - `getArticlesByIds` takes an unbounded `ids` array and does N `db.get`. The print page passes `?ids=` with an unvalidated string cast to `Id<"articles">[]`. A bad id makes the query throw and crashes the page.
   - Fix: return a trimmed projection (with `returns`) for the list, cap `limit` (e.g. `Math.min(limit, 100)`), cap `ids` length, and load full content only in the print view. Consider dropping `textContent` or moving it to a separate `articleBodies` table.

9. **Scrape orchestration is client-side, serial and non-atomic.**
   - `src/app/lyrics/page.tsx:~87-125` calls `/api/scrape-genius`, then calls `createAlbum` and N `createSong` mutations from the browser. Closing the tab mid-way leaves a partial album.
   - The route does N fetches with a 500 ms sleep each, in one request with no `maxDuration`. A 15-track album is a roughly 20-30 s request and will time out on shorter Vercel limits.
   - The route (`scrape-genius/route.ts`) and the action `scrapeAndStoreAlbum` (`geniusAlbums.ts:933-1110`) duplicate the same logic.
   - `scrapeAndStoreAlbum` is dead: nothing in `src`, `scripts` or `convex` calls it. It also uses `api.geniusAlbums.createAlbum/createSong` (public) instead of internal functions.
   - Also, `slugify` is re-implemented client-side in `lyrics/page.tsx:32-44` (identical copy of `convex/_utils/geniusParser.ts:432`), a drift risk.
   - Fix: pick one path. The Convex action is better for timeouts. Make it return `returns`, use `internalMutation` for the store steps (single batched mutation per N songs), and delete the route and the client loop. Import `slugify` instead of copying.

10. **Public queries return full albums.** `listPublicRecent` and `getPublicAlbumBySlug` (used by `src/app/public/lyrics`) return complete docs: all lyrics overrides, internal fields and spotify ids. Intentional for public pages, but the unbounded `limit` arg (no cap) and no `returns` mean any shape change leaks. Add `returns` projections.

11. **`searchSpotifyAlbumsForMapping` and `bulkUpsertDiscographyAlbums` take `userId` as a client arg.**
    - Violates the guidelines rule "never accept a userId for authorization" and exposes another user's album library via an arbitrary id.
    - Single-user app so low real impact, but the id comes from `useAuthToken` via `fetch("/api/auth/status")`.

### Low

12. `createSong` (`:241-247`) does `.collect()` on all of an album's songs, then `.find` by trackNumber. The only trackNumber index, `by_trackNumber`, is global (not `by_albumId_and_trackNumber`) and useless for this lookup. Add a compound index and use `.withIndex(...).unique()`.
13. `deleteAlbum` (`:905`) leaves `zineCoverImageStorageId` file orphaned (storage leak). `deleteSong` does not check existence and does not decrement `totalSongs`.
14. `autoMatchSpotifyAlbum` (`:757`) `.collect()` on candidates by `albumTitleKey` (commonly small, but unbounded). Use `.take(50)`.
15. `getAlbumBySlugWithSongs` (`:1140`) is reactive and ships all songs plus full lyrics to the editor. Every per-field autosave patch re-sends the whole album. Fine at 15 tracks, noticeable at 60+.
16. `extract-article`: `html!` non-null assertion; reading time of an empty string is 1 min; `finalUrl = url` ignores redirects; `console.log` noise (about 15 lines per request) with `error.stack` and `details: error.message` returned to the client.
17. `articles/print` uses `bg-white` and raw `#hex` print CSS in `<style dangerouslySetInnerHTML>`, so the on-screen print page is always white even in dark mode, and `text-muted-foreground` on white may be unreadable in dark theme.

## Convention drift by AGENTS.md section

### Stack table

- **Radix vs Base UI.** AGENTS.md says shadcn on Base UI, not Radix. Repo reality: `components.json` style `new-york`, `src/components/ui` has 13 Radix files vs 1 Base UI (26 total). `button.tsx` uses `radix-ui` `Slot` with `asChild`; `checkbox.tsx` imports `@radix-ui/react-checkbox`.
  - The slice uses `<Button asChild>` in 11 places (`lyrics/[slug]/page.tsx`, `album-lyrics-zine.tsx`, `articles/page.tsx`, `articles/new/page.tsx`, `articles/print/page.tsx`). That is correct for the repo's actual (Radix) button but wrong for Base UI, which uses `render`.
  - Not a slice defect: the AGENTS.md claim is wrong today. See AGENTS.md corrections.
- **Forms.** No slice form uses TanStack Form or Zod (see Forms).
- **Dates.** `date-fns` is not used anywhere in the slice. `articles/page.tsx:46-58`, `articles/print/page.tsx:14-26` use `new Date(...).toLocaleDateString` and round-trip `new Date(savedAt).toISOString()` through a string formatter. Date-only strings like `publishedDate` also render a day off in negative UTC offsets. Use `format` from date-fns.
- **tRPC / API-route use.** `scrape-genius` and `extract-article` are legit "external integration / scraping" API routes. `migrate-lyrics` is a data route (dev-to-prod sync) that is not an external integration. It is arguably legit as a dev-only admin op, but is not covered by the "scraping, webhooks, OAuth" carve-out. Also `use-auth-token` is `fetch("/api/auth/status")` in an effect.
- **Icons.** OK (`lucide-react` only).
- **Env.** OK. `migrate-lyrics` uses `~/env.js` (`NEXT_PUBLIC_CONVEX_PROD_URL` is declared). No `process.env` in `src/` for this slice.
- **Toasts.** sonner everywhere, no `alert()`. OK.

### UI rules

- Raw `<button>`: `album-lyrics-editor.tsx:509` ("Editor notes" toggle) and `spotify-album-map-drawer.tsx:~135` (`SpotifyAlbumPickerRow`). Use `Button variant="ghost"/"link"` or a shadcn `Collapsible`/`Item`.
- Raw `<textarea>`: `articles/new/page.tsx:143`, hand-copied Tailwind classes. `src/components/ui/textarea.tsx` exists. Use it.
- Raw `<label>`: `articles/page.tsx:162`. Use shadcn `Label`.
- Raw `<img>` (violates "Images use next/image"): `lyrics/[slug]/page.tsx:156` (`frontPageImageUrl` from user-entered URL; needs `remotePatterns` or `unoptimized`).
- Raw `<details>/<summary>` at `album-lyrics-editor.tsx:~612`. Use shadcn `Accordion`/`Collapsible`.
- Hand-rolled tab bar `lyrics/_components/lyrics-tabs.tsx` instead of shadcn `Tabs` (`src/components/ui/tabs.tsx` exists).
- Ad-hoc bordered cards: `credit-defaults-drawer.tsx:~176,~232` (`li rounded-lg border`), `articles/page.tsx:~178`, `[slug]/page.tsx:~225-232`. Minor; consider `Item`/`Card`.
- **Drawer over Dialog:** conforms. `CreditDefaultsDrawer` and `SpotifyAlbumMapDrawer` use shadcn `Drawer`. Delete actions have no `AlertDialog` confirm (`lyrics/page.tsx` `handleDelete`, `articles/page.tsx` `handleDelete`). Not required by AGENTS.md, but destructive and one click.
- `lyrics/[slug]/page.tsx` and `articles/print/page.tsx` are print-oriented. The inline `<style>` blob (about 150 lines) and `no-print`/`print-*` classes bypass Tailwind. A `print:` variant approach is already used on the lyrics page.

### React effects

- `album-lyrics-editor.tsx:775-777`: `useEffect(() => setHiddenCreditLabels(song.hiddenCreditLabels ?? []), [song.hiddenCreditLabels])`. Copying props into state via an effect. Derive or key (the component is inside a `.map`, so `key` on `<TrackRow key={song._id + hiddenKey}>` or optimistic overlay state). No outside system, so it violates the rule.
- `album-lyrics-editor.tsx:827-832`: effect that pushes `persist.status` up to the parent (`onStatusChange`). It lifts state with an effect. Better: the parent derives from a shared store, or `useZineEditorPersist` takes an `onStatusChange` callback, or statuses are lifted via event handlers. (The persist hook itself, `components/zine/editor/use-zine-editor-persist.ts`, uses 3 effects. Not audited.)
- `spotify-album-map-drawer.tsx:44-58`: resets `searchInput` when `open`/`album` change (state reset: use a `key` on the drawer body) plus focus via `setTimeout`. The focus part is legit (DOM, with the required comment missing). No effect carries the one-line "syncs with X" comment in the slice.
- `lib/hooks/use-debounced-state.ts` (timer: legit) and `lib/hooks/use-auth-token.ts` (fetches `/api/auth/status` in an effect plus a visibilitychange listener). The fetch-in-effect violates "never fetch in an effect"; the listener is legitimate.

### Forms (TanStack Form + Zod)

All violate. No `@tanstack/react-form` or `zod` import in the slice, even though both are installed.

- `lyrics/page.tsx:~210`: `useState` for `geniusUrl`, `<form onSubmit>`, validation by hand (`includes("genius.com")`), no `Field`. Should be a TanStack form with a Zod schema (`z.string().url().refine(host is genius.com)`); share the host check with the route and the action.
- `articles/new/page.tsx`: `url`/`html`/`mode` in `useState`, hand validation, raw `<form>`. A Zod discriminated union on `mode` fits.
- `credit-defaults-drawer.tsx:~160`: single-input add-ignored-label form with `useState`. AGENTS.md explicitly says single-input forms count.
- `album-lyrics-editor.tsx` uses the zine `useZineEditorPersist` autosave hook with plain `Input`s (`album-title`, `album-artist`, `front-page-image`, track fields). These are autosaving field editors rather than submit forms, so AGENTS.md is ambiguous here. See AGENTS.md corrections.
- API routes parse `await request.json()` as `any` with casts (`extract-article/route.ts:30`, `scrape-genius/route.ts:173`) rather than a Zod schema. The guidelines also say to narrow request JSON as `unknown`.

### Dark mode

- `articles/print/page.tsx:292` `bg-white`; inline CSS (`background: white`, `#000`, `#666`, `#e5e7eb`) in `<style>` for the on-screen view. Always light.
- `album-lyrics-editor.tsx:511,614` `text-teal-800` (poor contrast on dark; use a semantic token like `text-primary`).
- `lyrics/[slug]/page.tsx:214` `print:border-gray-300 print:bg-gray-50` (print-only, so acceptable, but flagged by the "no hardcoded colors" rule).
- Otherwise the slice uses semantic tokens (`bg-muted`, `text-muted-foreground`, `border`).

### Toasts

OK. `toast` from `sonner`, `<Toaster/>` is mounted in the root. Minor: `navigator.clipboard.writeText` promise is not awaited or caught in `lyrics/page.tsx:~151` and `[slug]/page.tsx:~44`, so "copied" toasts even when clipboard permission fails.

### Env

OK. `process.env` appears in the slice only in `scripts/migrate-lyrics-to-prod.js` (a script, outside `src/`). `convex/` files in the slice do not read env. (The guidelines mention typed env via `convex.config.ts` `env`; not used anywhere, not a violation.)

### Auth

- `requireAuth` is a no-op. This slice depends on it in about 50 call sites (`geniusAlbums.ts` about 30, `geniusCreditLabels.ts` 7, plus `spotify.ts`). It provides zero protection (see Error 3).
- `articles.ts` ignores even that. It hardcodes `userId = "authenticated-user"` (5 functions), and `getStats` uses `identity.subject`. Inconsistent identity model, so `getStats` is broken (Error 7).
- `X-Access-Token` header: AGENTS.md says it carries the session token validated by `validateSessionToken`. In the slice it carries the Spotify OAuth token to `/api/spotify/album/[id]/tracks` (`album-lyrics-editor.tsx:243`). The route has no session check.
- Middleware: `/lyrics` (and `/lyrics/[slug]*`) is not protected, only `/lyrics/playlists`. `/api/scrape-genius` and `/api/extract-article` are not protected. `/api/migrate-lyrics` only checks that a `session` cookie exists, not that it is valid.
- Auth wrappers: AGENTS.md says "use auth-wrapped queries/mutations built with `convex-helpers` custom functions". None exist in `convex/` (convex-helpers is used only for `stream`). The slice calls `requireAuth(ctx)` inline.

### Convex

(Checked with the `convex-expert` ruleset: object form, args and returns, withIndex, bounded reads, internal vs public, import table, "use node", v.id vs v.string, schema evolution, mutations cannot fetch.)

Conforming: object-form everywhere; imports from `./_generated/server` and `./_generated/api` are correct; no `"use node"` anywhere in the slice, so no query/mutation-in-node-file violation; no `fetch` in mutations; ids use `v.id`; schema fields added as `v.optional`; no `.filter()` on db queries (only JS array filters); all `geniusCreditLabels.ts` functions have both validators; ownership/ID checks present on writes (`ctx.db.get` then throw).

Violations:

- **Missing `returns` validators** (AGENTS.md: "every registered function has args and returns"):
  - `geniusAlbums.ts`, 11 of 36 functions: `listRecent`, `listPublicRecent`, `getAlbumBySlug`, `getPublicAlbumBySlug`, `getAlbumById`, `createAlbum`, `createSong`, `deleteAlbum`, `scrapeAndStoreAlbum`, `getSongsByAlbumId`, `deleteSong`.
  - `articles.ts`, all 5. `getStats` also has no `args`.
  - The schema-heavy return shapes (`getAlbumBySlug`) could be derived from `v.object(...)` with `.fields`.
- **Public vs internal:** `scrapeAndStoreAlbum` is a public `action` calling public mutations via `api.*` (`:1025`, `:1092`). Only needed internally, and the action itself is unused. `upsertAlbumForSync`, `replaceSongsForSync`, `listAlbumsForSync`, `listCreditLabelsForSync`, `upsertCreditLabelsForSync` are admin/migration endpoints exposed publicly (needed because the route calls them through `ConvexHttpClient` without a deploy key; making them internal needs a different transport such as `npx convex run`).
- **Unbounded reads** (guidelines + AGENTS.md "reads are always bounded"):
  - `.collect()` on `geniusSongs` (whole table) and `geniusLyricScrapes` (whole table): `geniusCreditLabels.ts` `refreshCreditLabels`.
  - `.collect()` on `geniusAlbums`, then per-album songs: `listAlbumsForSync` (`:1445-1451`, `:1519`).
  - `.collect()` on `geniusCreditLabels` (`listCreditLabels`, `listCreditLabelsForSync`). Credit labels are a small table, but the policy says bound it (`.take(500)`).
  - `getStats` `.collect().length`: counting rows with `.collect()` is explicitly forbidden.
  - Per-album `.collect()` of songs at `:245, :655, :916, :1122, :1159, :1729, :1834` is bounded by album size in practice, but undocumented.
  - Client-controlled `limit` with no cap: `listRecent`, `listPublicRecent` (`:113-142`), `listArticles`.
  - `getSiteWideHiddenCreditLabelKeys` and `getIgnoredCreditLabelKeys` `.collect()` on every album read (including the public one).
- **Index naming:** guidelines require `by_field1_and_field2`. `articles.by_userId_savedAt` should be `by_userId_and_savedAt`; `by_userId` is redundant with that prefix. `geniusSongs.by_trackNumber` is a global index on a per-album field, probably meant to be `by_albumId_and_trackNumber`. Renaming indexes is a schema change, so do it with a deploy and a backfill-safe order (add new, switch queries, remove old).
- **Document-ID API:** guidelines for 1.41+ show `ctx.db.get("table", id)`, `patch("table", id, ...)`, `delete("table", id)`. Slice uses the older untabled form everywhere (project is on convex ^1.46). Still works; low priority.
- **Userspace identity:** `searchSpotifyAlbumsForMapping` (`:682`) takes `userId` from the client. See Medium 11.
- **Data-model smell:** `articles.userId: v.string()` holds the constant `"authenticated-user"`. `content` plus `textContent` doubles storage per article (`textContent` unused in the UI). No `search` index on `textContent` even though the schema comment says "for search".
- **Mutation churn:** `replaceSongsForSync` deletes and re-inserts all songs (new `_id`s, so any stored song id in the client or other tables dangles; `Date.now()` evaluated per song).
- **Action design:** `scrapeAndStoreAlbum` makes one `runMutation` per song (guidelines say minimize action-to-mutation calls), but this is secondary to it being dead code.

### Tests

- `vitest.config.ts` includes only `convex/launch-*.test.ts`. Every slice test is `node:test`, so `pnpm exec vitest run` (the documented command) runs none of them.
- The documented `node --test path.ts` does not work on the installed Node 22.14: `ERR_UNKNOWN_FILE_EXTENSION`. With `--experimental-strip-types` it still fails (`ERR_MODULE_NOT_FOUND`, extensionless imports such as `./geniusParser`). They pass only with `npx tsx --test <files>` (32 of 32), and `tsx` is a devDependency but not mentioned in AGENTS.md. No `test` script exists in package.json.
- `convex/genius-spotify-mapping-search.test.ts` is a source-regex test: it reads `geniusAlbums.ts` as text and asserts regexes (`/search_albumLibraryItems/`, `doesNotMatch(/\.take\(500\)/)`). It checks code text, not behavior, and breaks on harmless refactors. Replace with a `convex-test` test.
- Uncovered: all of `articles.ts`; `refreshCreditLabels`; all sync functions; `scrapeAndStoreAlbum`; `extract-article` / `scrape-genius` route logic (the `extractLyricsFromHTML`/`extractAboutFromHTML` in `scrape-genius/route.ts` are private to the route, so untestable, and they duplicate `extractLyrics`/`extractAbout` in `convex/_utils/geniusParser.ts`); `getStats` (would have caught Error 7). AGENTS.md says: "Bugs: write a failing test first". None of the findings above had a regression test.
- Good: pure logic is in `convex/_utils/genius*.ts` with colocated tests (32 cases).

### Code style

- OK: tabs, kebab-case files, `type` aliases, classic `function` declarations for named functions, main component first, `~/*` and relative `convex/_generated` imports, `Skeleton` helpers after the main component (`AlbumListSkeleton`, `ArticleListSkeleton`, `AlbumLyricsEditorSkeleton`, `AlbumSkeleton`). Biome: the slice was not reformatted; `pnpm check` was not run.
- Exports without explicit return types: `LyricsSearchPage`, `AlbumLyricsPage`, `ArticlesPage`, `NewArticlePage`, `PrintPage`, `LyricsLayout`, `LyricsTabs`, `AlbumLyricsZine`, `PrivateAlbumLyricsZine`, `PublicAlbumLyricsZine`, `CreditDefaultsDrawer`, `SpotifyAlbumMapDrawer`, and the three routes' `POST` (`album-lyrics-editor.tsx` does annotate `ReactElement`).
- Template-literal `className` instead of `cn()`: `lyrics-tabs.tsx:23`, `lyrics/[slug]/page.tsx:88`.
- `any`: `await request.json()` bodies destructured as `any` (`scrape-genius/route.ts:173`, `extract-article/route.ts:30` cast), and `lyrics/page.tsx` `albumData = await response.json()` is `any`. `key={idx}` at `[slug]/page.tsx:216`.
- Dead/duplicate code: `scrapeAndStoreAlbum`, `getSongsByAlbumId`, `getAlbumById`, `deleteSong` (no callers in `src`/`scripts`), duplicate `slugify`, duplicate route-side lyrics/about extractors.
- `albumData === null || !albumData.album` check (`[slug]/page.tsx:60`) treats a non-null shape as nullable; harmless.
- Files over 900 lines (`convex/geniusAlbums.ts` 1851, `album-lyrics-editor.tsx` 956): doing album CRUD, zine settings (about 20 near-identical `updateZine*` mutations), Spotify mapping, scraping, and sync. Candidate for splitting into `convex/model/` plus per-concern modules per the "thin public functions, logic in `convex/model/`" rule (there is no `convex/model/` directory in the repo at all; logic lives in `convex/_utils/`).

## Suggested changes (ranked, with effort)

| # | Change | Effort |
|---|---|---|
| 1 | Add a session check and `new URL` host allowlist (`genius.com`, `*.genius.com`, https only) to `scrape-genius`; add the same host check on every followed track URL and in `scrapeAndStoreAlbum`. Add these routes to middleware or validate the cookie in-route | S |
| 2 | `extract-article`: validate session, block private/loopback targets, `redirect: "manual"` or re-check, timeout (`AbortSignal.timeout`), max body size | S-M |
| 3 | Sanitize article HTML before storing or rendering (needs approval for a dependency, e.g. `isomorphic-dompurify`, or `sanitize-html`) | M |
| 4 | Fix `articles.getStats` (use the same owner id or delete; add `args`/`returns`; add a test) | S |
| 5 | Replace `.collect()` full-table scans in `refreshCreditLabels` and `listAlbumsForSync` with paginated, batched work; update the migrate route and script to loop over pages | M |
| 6 | Make the sync validators complete (derive from schema validators), stop clearing `spotifyAlbumConvexId`, copy covers into prod storage, validate auth in `/api/migrate-lyrics` | M |
| 7 | Trim `listArticles` to a metadata projection with a max `limit`; cap `getArticlesByIds` ids; add `returns` | S-M |
| 8 | Add `returns` validators to the 11 `geniusAlbums.ts` functions and the 5 `articles.ts` functions | M |
| 9 | Pick one scrape path: delete the dead `scrapeAndStoreAlbum` or move the route logic into an internal action; remove the client-side `createSong` loop and the duplicated `slugify`/extractors | M |
| 10 | Real auth for Convex public functions (`ctx.auth` is unconfigured; wrap with a `convex-helpers` custom function that checks a shared secret/session token). Pre-existing, listed for dependency only | L |
| 11 | Convert the 3 slice forms to TanStack Form + Zod (`Field`), including the single-input credit-defaults form | M |
| 12 | Replace raw `<button>`, `<textarea>`, `<label>`, `<details>`, `<img>`, and the hand-rolled tabs with shadcn components / `next/image` | S-M |
| 13 | Remove effect-based state copying (`album-lyrics-editor.tsx:775`, `:827`, `spotify-album-map-drawer.tsx:44`) using `key` or derived state | S-M |
| 14 | Theme the print page and teal text with semantic tokens (keep `@media print` black-on-white via `print:` variants) | S |
| 15 | Replace `toLocaleDateString` with date-fns `format`/`parseISO` | S |
| 16 | Add indexes: `geniusSongs.by_albumId_and_trackNumber`; rename `articles.by_userId_savedAt`; drop `articles.by_userId` (schema change, do in staged deploys) | S-M |
| 17 | Cap `limit` args (`Math.min`) in `listRecent`, `listPublicRecent`, `listArticles` | S |
| 18 | Delete the album-cover storage file in `deleteAlbum`; delete songs in batches | S |
| 19 | Tests: add `convex-test` tests for `articles.ts` and credit-label refresh, replace the source-regex test, and make the test runner actually run slice tests (see AGENTS.md corrections) | M |
| 20 | Split `geniusAlbums.ts` into focused modules with logic in `convex/model/` | L |
| 21 | Add `AlertDialog` confirmation to delete-album and delete-article | S |

## AGENTS.md corrections

1. **Base UI claim is wrong for this repo today.** The Stack table and UI rules say "shadcn/ui on Base UI, not Radix". Reality: `components.json` is `new-york` (Radix flavor), `src/components/ui` is mostly Radix (13 files import radix, 1 imports `@base-ui`, `button.tsx` uses `radix-ui` `Slot`/`asChild`), and `package.json` lists many `@radix-ui/*` deps. Either change the doc to "Radix today, migrating to Base UI" or finish the migration (`migrate-radix-to-base`). Until then `asChild` is the correct API in the slice.
2. **Test commands do not work as written.** `pnpm exec vitest run` only includes `convex/launch-*.test.ts` (per `vitest.config.ts`), and `node --test path/to/file.test.ts` fails on Node 22.14 (needs `tsx`). Document `npx tsx --test <files>`, or add a `pnpm test` script that runs both runners, and fix `vitest.config.ts` includes so new Vitest tests under `convex/` and `src/lib/` run. Also "new tests use Vitest" conflicts with a config that excludes everything but launch tests.
3. **"Use auth-wrapped queries/mutations built with convex-helpers custom functions" does not exist.** No such wrapper is in `convex/`; `requireAuth` is a no-op and Convex auth has no providers. State the current truth (middleware-only protection, Convex functions are public), plus the planned target.
4. **"Single-user session auth ... pass the access token via `X-Access-Token`; validate with `validateSessionToken`".** Only `/api/migrate-lyrics` reads the cookie, and only for presence. The Spotify routes use the same header name for the Spotify OAuth token. Clarify the header's meaning or rename it.
5. **Middleware coverage is undocumented.** It protects only an enumerated list (`/books`, `/folio-society`, `/articles`, `/concerts`, `/birthdays`, `/playlist-lyrics`, `/lyrics/playlists`, two migrate routes). `/lyrics`, `/albums`, etc. and the scraping APIs are open. Add a rule: every new private route or API route must be added to the matcher.
6. **Forms rule should say how autosave editors count.** The zine editors (`useZineEditorPersist` with plain `Input`s, debounced autosave) are not submit forms. Say whether they must use TanStack Form, or exempt autosave field editors.
7. **"API routes are for external integrations only (Spotify OAuth, scraping, webhooks)"** versus `migrate-lyrics`, `migrate-playlist-lyrics`: dev-to-prod sync routes that call public Convex functions. Either list "admin sync" as an allowed use or move it to `scripts/` plus `npx convex run`.
8. **Layout section** says `convex/model/` holds reusable logic. The directory does not exist; logic is in `convex/_utils/` (e.g. `geniusParser`, `geniusCreditVisibility`) and is imported by `src/app/api/scrape-genius/route.ts` via relative paths. Document `convex/_utils/` as the shared-logic home, and that `src/` routes may import it with relative imports.
9. **Dates rule ("date-fns") vs stored data.** The slice stores `publishedDate` as a freeform string from `meta` tags (not `YYYY-MM-DD`). Say how to handle scraped/unknown-format dates.
10. **Add a rule on external fetches and HTML rendering** (the biggest gaps found): parse URLs with `new URL`, allowlist hosts, set timeouts and size caps, and never `dangerouslySetInnerHTML` unsanitized scraped content.
11. **Features list** should note that `/lyrics` includes `/lyrics/playlists` and `/public/lyrics`, and that `/articles` has `/new` and `/print`.

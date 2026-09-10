# Music IA Shell (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat header with a music-first sidebar/sheet navigation and a lean signed-in Home that answers “what should I play?” and “what did I listen to?” using bounded existing data — without building Play soon, unified ranking, or the shared album drawer yet.

**Architecture:** A single nav config drives desktop sidebar + mobile sheet. Root layout wraps authenticated pages in an app shell. Home becomes a client page with 3–4 small Convex queries (each `take`/`paginate`-bounded). Route aliases and label renames land now; For Later / Enrichment stay on their URLs but move in the nav tree. Later plans cover Albums unification (Phase 2), Play Next materialization (Phase 3), visual redesign, and Cmd+K.

**Tech Stack:** Next.js 15 App Router, Convex, React 19, Tailwind v4, shadcn/ui (Sheet, Button, Separator, Skeleton), Lucide, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`

**Spec:** `docs/superpowers/specs/2026-09-10-music-ia-navigation-design.md`

## Global Constraints

- Classic function declarations; `type` aliases; kebab-case filenames; inline component props
- Env via `~/env.js` only if new env vars are required (prefer none)
- No unbounded `.collect()` for Home modules
- No `Date.now()` inside Home/Play Next queries
- No Funnel repeats module on Home in this phase
- No Play soon schema / no `playNextSnapshots` in this phase
- No shared album detail drawer yet (rows may keep existing links)
- Public `/public/*` routes unchanged
- Do not commit unrelated dirty workspace files (zine, convex skills, etc.)

## Scope boundary

| In this plan | Later plans |
|---|---|
| Nav config + sidebar + mobile sheet | Shared album drawer |
| Lean Home modules (bounded) | Play soon fields |
| Login default `/` | Materialized Play Next ranking |
| Label renames + soft redirects | `/albums/up-next` absorbing For Later chrome |
| Point nav “Up Next” → `/for-later-albums` | Cmd+K |
| Funnel tab in URL | Visual redesign |
| Demote Tracks / Enrichment / Playlister / etc. to More | Funnel repeats on Home |

## File map

| File | Responsibility |
|---|---|
| `src/lib/navigation/app-nav.ts` | Signed-in sitemap: ids, labels, hrefs, groups, mobile/desktop flags |
| `src/lib/navigation/app-nav.test.ts` | Nav tree invariants (unique hrefs, required Music items, More demotions) |
| `src/components/app-shell/app-shell.tsx` | Desktop sidebar + mobile trigger/sheet + main content offset |
| `src/components/app-shell/app-sidebar.tsx` | Sidebar sections (Music / Other / More) |
| `src/components/app-shell/mobile-nav-sheet.tsx` | Hamburger Sheet mirroring nav config |
| `src/components/ui/sheet.tsx` | shadcn Sheet primitive (add via CLI) |
| `src/app/_components/site-header.tsx` | Slim top bar only (brand, mobile menu, account) — no link farm |
| `src/app/layout.tsx` | Wire AppShell around children |
| `src/app/page.tsx` | Signed-in music home vs signed-out public entry |
| `src/app/_components/home-music-dashboard.tsx` | Home modules UI |
| `convex/home.ts` | Bounded Home queries |
| `convex/home.test.ts` | Source/contract tests for Home query shapes |
| `src/app/login/login-form.tsx` | Default post-login → `/` |
| `src/app/albums/layout.tsx` | Tab labels: Recent / Rated / Library; drop Tracks from strip |
| `src/app/albums/recent/page.tsx` | New path (move/re-export history) |
| `src/app/albums/rated/page.tsx` | New path (move/re-export rankings) |
| `src/app/albums/library/page.tsx` | New path (move/re-export all) |
| `src/app/albums/history/page.tsx` | Redirect → `/albums/recent` |
| `src/app/albums/rankings/page.tsx` | Redirect → `/albums/rated` |
| `src/app/albums/all/page.tsx` | Redirect → `/albums/library` |
| `src/app/albums/page.tsx` | Redirect → `/albums/recent` |
| `src/app/lyrics/_components/lyrics-tabs.tsx` | Album sheets / Playlist sheets labels |
| `src/app/music-funnel/*` | URL-backed Timeline/Repeats tab |
| `src/app/concerts/_components/concert-tabs.tsx` | Upcoming / New only; Venues via header gear |

---

### Task 1: Nav config + tests

**Files:**
- Create: `src/lib/navigation/app-nav.ts`
- Create: `src/lib/navigation/app-nav.test.ts`

**Interfaces:**
- Produces: `AppNavGroup`, `AppNavItem`, `APP_NAV_GROUPS`, `getAppNavGroups()`, `isNavItemActive(pathname, href)`

- [ ] **Step 1: Write the failing test**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	APP_NAV_GROUPS,
	isNavItemActive,
} from "./app-nav";

test("music group includes Albums, Up Next, Funnel, Lyrics, Playlists, Shows", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	assert.ok(music);
	const labels = music.items.map((i) => i.label);
	assert.deepEqual(labels, [
		"Albums",
		"Up Next",
		"Funnel",
		"Lyrics",
		"Playlists",
		"Shows",
	]);
});

test("More demotes Tracks, Enrichment, Categorize tracks", () => {
	const more = APP_NAV_GROUPS.find((g) => g.id === "more");
	assert.ok(more);
	const labels = more.items.map((i) => i.label);
	assert.ok(labels.includes("Tracks"));
	assert.ok(labels.includes("Enrichment"));
	assert.ok(labels.includes("Categorize tracks"));
	assert.ok(!labels.includes("For Later"));
});

test("Up Next href points at for-later until Phase 2", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	const upNext = music?.items.find((i) => i.id === "up-next");
	assert.equal(upNext?.href, "/for-later-albums");
});

test("isNavItemActive matches nested album routes for Albums", () => {
	assert.equal(isNavItemActive("/albums/recent", "/albums"), true);
	assert.equal(isNavItemActive("/for-later-albums", "/albums"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/navigation/app-nav.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement nav config**

```typescript
export type AppNavItem = {
	id: string;
	label: string;
	href: string;
	/** Path prefixes that count as active for this item */
	matchPrefixes?: string[];
};

export type AppNavGroup = {
	id: "music" | "other" | "more";
	label: string;
	items: AppNavItem[];
	/** Collapsed by default on desktop */
	defaultCollapsed?: boolean;
};

export const APP_NAV_GROUPS: AppNavGroup[] = [
	{
		id: "music",
		label: "Music",
		items: [
			{
				id: "albums",
				label: "Albums",
				href: "/albums/recent",
				matchPrefixes: ["/albums"],
			},
			{
				id: "up-next",
				label: "Up Next",
				href: "/for-later-albums",
				matchPrefixes: ["/for-later-albums"],
			},
			{ id: "funnel", label: "Funnel", href: "/music-funnel" },
			{
				id: "lyrics",
				label: "Lyrics",
				href: "/lyrics",
				matchPrefixes: ["/lyrics", "/playlist-lyrics"],
			},
			{ id: "playlists", label: "Playlists", href: "/smart-playlists" },
			{
				id: "shows",
				label: "Shows",
				href: "/concerts/upcoming",
				matchPrefixes: ["/concerts"],
			},
		],
	},
	{
		id: "other",
		label: "Other",
		items: [
			{ id: "robs", label: "Rob's Top 50", href: "/robs-rankings" },
			{ id: "folio", label: "Folio Society", href: "/folio-society" },
			{ id: "birthdays", label: "Birthdays", href: "/birthdays" },
		],
	},
	{
		id: "more",
		label: "More",
		defaultCollapsed: true,
		items: [
			{ id: "tracks", label: "Tracks", href: "/albums/tracks" },
			{ id: "enrichment", label: "Enrichment", href: "/album-enrichment" },
			{
				id: "categorize",
				label: "Categorize tracks",
				href: "/spotify-playlister",
			},
			{ id: "rooleases", label: "Rooleases", href: "/rooleases" },
			{ id: "articles", label: "Articles", href: "/articles" },
			{ id: "books", label: "Books", href: "/books" },
		],
	},
];

export function getAppNavGroups(): AppNavGroup[] {
	return APP_NAV_GROUPS;
}

export function isNavItemActive(pathname: string, item: AppNavItem): boolean {
	const prefixes = item.matchPrefixes ?? [item.href];
	return prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}
```

Fix the test helper: `isNavItemActive(pathname, item)` — update test to pass the Albums item object, or export an overload. Prefer passing `AppNavItem`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec tsx --test src/lib/navigation/app-nav.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation/app-nav.ts src/lib/navigation/app-nav.test.ts
git commit -m "feat(nav): add signed-in app navigation config"
```

---

### Task 2: Add Sheet primitive

**Files:**
- Create: `src/components/ui/sheet.tsx` (via shadcn CLI)

- [ ] **Step 1: Add sheet**

Run: `pnpm dlx shadcn@latest add sheet -y`  
Expected: `src/components/ui/sheet.tsx` created; no interactive prompts.

- [ ] **Step 2: Verify import path**

Confirm exports include `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sheet.tsx package.json pnpm-lock.yaml
git commit -m "chore(ui): add shadcn sheet for mobile nav"
```

---

### Task 3: App shell (sidebar + mobile sheet)

**Files:**
- Create: `src/components/app-shell/app-sidebar.tsx`
- Create: `src/components/app-shell/mobile-nav-sheet.tsx`
- Create: `src/components/app-shell/app-shell.tsx`
- Modify: `src/app/_components/site-header.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `APP_NAV_GROUPS`, `isNavItemActive`
- Produces: `AppShell({ children })`

- [ ] **Step 1: Implement `app-sidebar.tsx`**

Client component. Map `APP_NAV_GROUPS`. Home link at top → `/`. Active styles via `usePathname` + `isNavItemActive`. “More” starts collapsed (`defaultCollapsed`) with a disclosure button. Use classic function declarations; Lucide icons optional and quiet (`h-4 w-4`).

- [ ] **Step 2: Implement `mobile-nav-sheet.tsx`**

Hamburger opens `Sheet` from the left; same groups/items; closes on navigate.

- [ ] **Step 3: Implement `app-shell.tsx`**

```tsx
"use client";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Desktop: sticky aside (w-56) + main
  // Mobile: no aside; header provides MobileNavSheet
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:block ...">{/* AppSidebar */}</aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

Skip shell on `/login` and `/public/*` if those render without wanting chrome — prefer: always show slim header; hide sidebar groups when `!isAuthenticated` (only brand + Sign in).

- [ ] **Step 4: Slim `site-header.tsx`**

Remove the horizontal link farm. Keep: brand → `/`, `MobileNavSheet` (md:hidden), account Sign in / Log out. Optional: muted “⌘K” placeholder button `disabled` with title “Coming soon” (no Command palette yet).

- [ ] **Step 5: Wire `layout.tsx`**

```tsx
<SiteHeader />
<AppShell>{children}</AppShell>
```

- [ ] **Step 6: Manual check**

Run: `pnpm dev`  
Signed-in: sidebar shows Music / Other / More; mobile sheet works; old header links gone.  
Signed-out: no Music dump; Sign in works.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-shell src/app/_components/site-header.tsx src/app/layout.tsx
git commit -m "feat(nav): add app shell sidebar and mobile sheet"
```

---

### Task 4: Login default + Albums route aliases

**Files:**
- Modify: `src/app/login/login-form.tsx`
- Create: `src/app/albums/recent/page.tsx` (move content from history)
- Create: `src/app/albums/rated/page.tsx` (move content from rankings)
- Create: `src/app/albums/library/page.tsx` (move content from all)
- Modify: `src/app/albums/history/page.tsx` → redirect
- Modify: `src/app/albums/rankings/page.tsx` → redirect
- Modify: `src/app/albums/all/page.tsx` → redirect
- Modify: `src/app/albums/page.tsx` → `/albums/recent`
- Modify: `src/app/albums/layout.tsx` — tabs Recent / Rated / Library; remove Tracks

- [ ] **Step 1: Fix login default**

In `login-form.tsx`, change:

```typescript
router.replace(next || "/");
```

- [ ] **Step 2: Move album view pages**

Copy `history/page.tsx` → `recent/page.tsx`, `rankings` → `rated`, `all` → `library`. Keep imports working under new paths (`../_components/...` still valid if same depth).

- [ ] **Step 3: Old paths redirect**

Each old page:

```typescript
import { redirect } from "next/navigation";

export default function AlbumsHistoryRedirect() {
	redirect("/albums/recent");
}
```

Same for rankings → `/albums/rated`, all → `/albums/library`. Update `/albums` index redirect to `/albums/recent`.

- [ ] **Step 4: Update albums layout tabs**

```typescript
const TABS = [
	{ href: "/albums/recent", label: "Recent" },
	{ href: "/albums/rated", label: "Rated" },
	{ href: "/albums/library", label: "Library" },
] as const;
```

Tracks remains reachable at `/albums/tracks` via More only — no tab. Detail routes under `/albums/details/...` should not highlight a tab (existing pathname equality is fine).

- [ ] **Step 5: Fix any hard-coded links**

Grep for `/albums/history`, `/albums/rankings`, `/albums/all` and update primary CTA links to new paths (redirects cover bookmarks).

- [ ] **Step 6: Smoke check**

Visit `/albums/history` → lands on Recent. Tabs show three items. More → Tracks still works.

- [ ] **Step 7: Commit**

```bash
git add src/app/login/login-form.tsx src/app/albums
git commit -m "feat(albums): rename routes to Recent/Rated/Library and fix login home"
```

---

### Task 5: Bounded Home queries

**Files:**
- Create: `convex/home.ts`
- Create: `convex/home.test.ts` (source-contract style like other convex `*.test.ts` files)

**Interfaces:**
- Produces:
  - `api.home.listRecentListens({ userId, limit })`
  - `api.home.listNeedsRating({ userId, limit })`
  - `api.home.listRecentlySavedForLater({ userId, limit })`
  - `api.home.listPlayNextPlaceholder({ userId, limit })` — temporary: active for-later by `forLaterLastSeenAt` desc (Phase 3 replaces)

- [ ] **Step 1: Write source contract tests**

```typescript
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./home.ts", import.meta.url), "utf8");

test("listRecentListens uses take, not unbounded collect", () => {
	assert.match(source, /listRecentListens/);
	assert.match(source, /\.take\(/);
	assert.doesNotMatch(
		source.slice(source.indexOf("listRecentListens"), source.indexOf("listNeedsRating")),
		/\.collect\(\)/,
	);
});

test("listRecentlySavedForLater uses forLaterLastSeenAt index", () => {
	assert.match(
		source,
		/by_userId_isActiveForLater_forLaterLastSeenAt/,
	);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec tsx --test convex/home.test.ts`

- [ ] **Step 3: Implement `convex/home.ts`**

Rules:
- Every public query: `args` + `returns` validators; auth check consistent with sibling music queries (`userId` arg pattern used by albums today is fine for Phase 1 — match existing `getUserAlbumListens` style).
- `listRecentListens`: index `userAlbumListens` `by_userId_listenedAt` order desc `.take(limit)` (default 8, max 20). Join album docs for name/artist/image.
- `listNeedsRating`: from recent listens (take up to 40), return albums with no rating for current year / any rating — pick the simpler existing rating table join used by HistoryView; cap result to `limit`. Document the heuristic in a one-line comment.
- `listRecentlySavedForLater`: `albumLibraryItems` with `by_userId_isActiveForLater_forLaterLastSeenAt` eq userId eq true, order desc, take limit.
- `listPlayNextPlaceholder`: same for-later index, take limit (12). Return fields needed for a compact row + href to `/for-later-albums`. Comment: `// Phase 3: replace with playNextSnapshots read`.

Do **not** call Funnel listAlbumRepeats.

- [ ] **Step 4: Run tests — PASS**

Run: `pnpm exec tsx --test convex/home.test.ts`

- [ ] **Step 5: Commit**

```bash
git add convex/home.ts convex/home.test.ts
git commit -m "feat(home): add bounded queries for music dashboard modules"
```

---

### Task 6: Lean music Home UI

**Files:**
- Create: `src/app/_components/home-music-dashboard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build `HomeMusicDashboard`**

Client component using `useAuth` / `useSpotifyAuth` userId + `useQuery` for the four home queries.

Layout (one composition, not a dashboard of equal cards):

1. **Play Next** (dominant): list from `listPlayNextPlaceholder`; button “Pick for me” opens existing For Later recommendation drawer (`useForLaterRecommendationDrawer`) — no new algorithm.
2. **Recently listened**: `listRecentListens` → links to `/albums/recent` and `/albums/details/[id]` where applicable.
3. **Needs rating**: `listNeedsRating` → deep link `/albums/recent` (filters later).
4. **Recently saved**: `listRecentlySavedForLater` → `/for-later-albums`.

Empty/loading: Skeleton. No Funnel module.

- [ ] **Step 2: Update `page.tsx`**

```tsx
// signed-in → <HomeMusicDashboard />
// signed-out → keep public Rob's Top 50 entry + Sign in prompt (slim)
```

Remove the old tool link grid for authenticated users.

- [ ] **Step 3: Manual check**

Signed-in `/` shows Play Next block first; modules load without hanging; Pick for me opens existing recommend UI.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/_components/home-music-dashboard.tsx
git commit -m "feat(home): replace tool grid with lean music dashboard"
```

---

### Task 7: Local label / tab polish

**Files:**
- Modify: `src/app/lyrics/_components/lyrics-tabs.tsx`
- Modify: `src/app/music-funnel/page.tsx` + header to sync tab with `?tab=timeline|repeats`
- Modify: `src/app/concerts/_components/concert-tabs.tsx`
- Modify: `src/app/concerts/_components/concerts-header.tsx` (Venues control)

- [ ] **Step 1: Lyrics tabs**

```typescript
const TABS = [
	{ href: "/lyrics", label: "Album sheets" },
	{ href: "/lyrics/playlists", label: "Playlist sheets" },
] as const;
```

- [ ] **Step 2: Funnel URL tab**

Read `tab` from `useSearchParams()`; default `timeline`. `onTabChange` writes `router.replace(/music-funnel?tab=repeats)`. Keep Timeline | Repeats labels.

- [ ] **Step 3: Concerts tabs**

Only Upcoming + New in `ConcertTabs`. Add a Venues button/link in `ConcertsHeader` (gear or text button → `/concerts/venues`).

- [ ] **Step 4: Smoke check + commit**

```bash
git add src/app/lyrics/_components/lyrics-tabs.tsx src/app/music-funnel src/app/concerts
git commit -m "feat(nav): polish Lyrics, Funnel, and Shows local navigation"
```

---

### Task 8: Phase 1 verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`  
Expected: clean for touched files (fix any errors introduced).

- [ ] **Step 2: Lint touched paths**

Run: `pnpm check`  
Fix issues in files from this plan only.

- [ ] **Step 3: Run unit tests from this plan**

Run: `pnpm exec tsx --test src/lib/navigation/app-nav.test.ts convex/home.test.ts`

- [ ] **Step 4: Manual checklist**

- [ ] Sidebar Music order matches spec
- [ ] More contains Tracks / Enrichment / Categorize tracks
- [ ] Mobile sheet works
- [ ] `/` signed-in is music home
- [ ] Login without `next` → `/`
- [ ] `/albums/history` redirects to Recent
- [ ] Albums tabs: Recent / Rated / Library (no Tracks)
- [ ] Up Next nav → For Later page
- [ ] No Funnel repeats on Home

- [ ] **Step 5: Final commit if verification fixes remain**

```bash
git commit -m "chore: polish music IA shell phase 1"
```

---

## Follow-on plans (do not implement here)

1. **Phase 2 — Albums unification:** shared detail drawer; Play soon on `albumLibraryItems`; `/albums/up-next` chrome absorbing For Later; redirect `/for-later-albums`.
2. **Phase 3 — Play Next materialization:** snapshot table or scored fields; Pick for me mutation; replace Home placeholder query.
3. **Phase 4 — Visual redesign** (frontend-design).
4. **Phase 5 — Cmd+K.**

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Sidebar + mobile sheet | 2–3 |
| Music / Other / More hierarchy | 1, 3 |
| Lean Home modules (no Funnel) | 5–6 |
| Login default `/` | 4 |
| Recent / Rated / Library renames | 4 |
| Tracks demoted | 1, 4 |
| Up Next nav (for-later href Phase 1) | 1 |
| Enrichment / Playlister in More | 1 |
| Lyrics sheet labels | 7 |
| Funnel URL tabs | 7 |
| Shows Venues demotion | 7 |
| Convex bounded Home reads | 5 |
| Play soon / snapshots | deferred Phase 2–3 |
| Cmd+K / visual redesign | deferred |

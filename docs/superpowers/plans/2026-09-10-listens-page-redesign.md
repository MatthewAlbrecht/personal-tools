# Listens Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Listens (`/albums/recent`) with week/month sections, a desktop filter rail + mobile Sheet, and true first-listen / listen-count enrichment from `userAlbums`.

**Architecture:** Fix and enrich `getUserAlbumListens` on the server (`.take` before joins; attach `listenCount` + `isFirstListen`). Pure client helpers filter → group → section stats. Rebuild `history-view` as timeline + shared filter controls (rail / Sheet) using shadcn, matching the cool slate studio shell.

**Tech Stack:** Next.js 15 App Router, Convex, React 19, Tailwind v4, shadcn/ui (`Sheet`, `Button`, `Checkbox`, `Select`, `Badge`, `Separator`), `node:test` via `pnpm exec tsx --test`, Biome

**Spec:** `docs/superpowers/specs/2026-09-10-listens-page-redesign.md`

## Global Constraints

- Classic function declarations; `type` aliases; kebab-case filenames; inline component props
- Env via `~/env.js` only if new env vars are required (prefer none)
- No `Date.now()` inside Convex queries
- No unbounded `.collect()` of `userAlbumListens` before limiting
- First listen = `listen.listenedAt === userAlbums.firstListenedAt` (not window ordinals)
- `Nx` badge = `userAlbums.listenCount`; First badge = `isFirstListen`
- Week = Monday–Sunday; default grouping = week
- Filters v1: Only unranked · Only first listens · Release year · Week|Month toggle
- No URL-synced filters, Play soon, shared drawer, or listening-stats module in this plan
- Match existing shell aesthetic (cool slate / Fraunces display / teal accents); prefer theme tokens
- Work in `.worktrees/music-ia-shell` on `feat/music-ia-shell` unless instructed otherwise

## File map

| File | Responsibility |
|---|---|
| `src/lib/album-listens-grouping.ts` | Week/month grouping, section stats, filter predicates |
| `src/lib/album-listens-grouping.test.ts` | Unit tests for grouping/stats/filters |
| `convex/spotify.ts` (`getUserAlbumListens`) | Bounded listen read + album/userAlbum enrichment |
| `convex/spotify.getUserAlbumListens-source.test.ts` | Source/contract tests for take-before-join + enrichment |
| `src/app/albums/_utils/types.ts` | `HistoryListen` enriched fields |
| `src/components/album-listen-count-badge.tsx` | First vs `Nx` from `isFirstListen` + `listenCount` |
| `src/app/albums/_components/album-card.tsx` | Pass enriched badge props (drop ordinal for Listens) |
| `src/app/albums/_components/listens-filters.tsx` | Shared filter controls (rail + Sheet content) |
| `src/app/albums/_components/history-view.tsx` | Layout: rail / mobile Filters / sections / rows |
| `src/app/albums/recent/page.tsx` | Wire enriched query; remove client ordinal map |

---

### Task 1: Grouping & filter helpers (TDD)

**Files:**
- Create: `src/lib/album-listens-grouping.ts`
- Create: `src/lib/album-listens-grouping.test.ts`

**Interfaces:**
- Consumes: listens with `{ listenedAt: number; album?: { releaseDate?: string } | null; isFirstListen?: boolean; albumId: string }`
- Produces:
  - `getWeekRangeKey(ms: number): { key: string; label: string }` — Monday 00:00 local through Sunday; label like `Sep 7–13` or cross-year form
  - `groupListensByWeek<T extends { listenedAt: number }>(items: T[]): Array<{ key: string; label: string; items: T[] }>` — newest week first
  - `groupListensByMonth<T extends { listenedAt: number }>(items: T[]): Array<{ key: string; label: string; items: T[] }>` — newest month first; label `September 2026`
  - `filterListens<T>(items: T[], opts): T[]` — unranked / first / year
  - `sectionStats(items: { isFirstListen: boolean }[]): { albumCount: number; newCount: number }`

- [ ] **Step 1: Write the failing tests**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	filterListens,
	getWeekRangeKey,
	groupListensByMonth,
	groupListensByWeek,
	sectionStats,
} from "./album-listens-grouping";

test("getWeekRangeKey uses Monday–Sunday for Sep 10 2026", () => {
	const thu = new Date(2026, 8, 10, 15, 0, 0).getTime(); // Sep 10 2026 Thursday
	const { label } = getWeekRangeKey(thu);
	assert.match(label, /Sep 7/);
	assert.match(label, /13/);
});

test("groupListensByWeek newest first and drops nothing", () => {
	const items = [
		{ id: "a", listenedAt: new Date(2026, 8, 10).getTime() },
		{ id: "b", listenedAt: new Date(2026, 8, 1).getTime() },
	];
	const groups = groupListensByWeek(items);
	assert.equal(groups.length, 2);
	assert.ok(groups[0]!.items.some((i) => i.id === "a"));
});

test("sectionStats counts albums and new", () => {
	assert.deepEqual(
		sectionStats([
			{ isFirstListen: true },
			{ isFirstListen: false },
			{ isFirstListen: true },
		]),
		{ albumCount: 3, newCount: 2 },
	);
});

test("filterListens only first listens", () => {
	const rows = [
		{ id: "1", isFirstListen: true, albumId: "a", listenedAt: 1 },
		{ id: "2", isFirstListen: false, albumId: "a", listenedAt: 2 },
	];
	const filtered = filterListens(rows, {
		onlyUnranked: false,
		onlyFirstListens: true,
		releaseYear: null,
		ratedAlbumIds: new Set(),
	});
	assert.deepEqual(
		filtered.map((r) => r.id),
		["1"],
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/album-listens-grouping.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement helpers**

Implement in `src/lib/album-listens-grouping.ts`:

- Week start: local Monday 00:00:00 for the calendar containing `listenedAt`
- Week end label day = start + 6 days
- Cross-year labels include years as in the spec
- Month grouping: stable key `YYYY-MM`, display via `toLocaleDateString("en-US", { month: "long", year: "numeric" })`
- `filterListens`: skip rated when `onlyUnranked`; require `isFirstListen` when `onlyFirstListens`; release year via existing `extractReleaseYear` from `~/lib/album-tiers`
- Do not mutate input arrays

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test src/lib/album-listens-grouping.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/album-listens-grouping.ts src/lib/album-listens-grouping.test.ts
git commit -m "$(cat <<'EOF'
feat(listens): add week/month grouping and filter helpers

EOF
)"
```

---

### Task 2: Bounded enriched `getUserAlbumListens`

**Files:**
- Modify: `convex/spotify.ts` (`getUserAlbumListens` ~3228–3252)
- Create: `convex/spotify.getUserAlbumListens-source.test.ts`

**Interfaces:**
- Consumes: `userAlbumListens`, `spotifyAlbums`, `userAlbums`
- Produces: array of listens with `album`, `listenCount: number`, `firstListenedAt?: number`, `isFirstListen: boolean`

- [ ] **Step 1: Write failing source tests**

```typescript
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./spotify.ts", import.meta.url), "utf8");

function getUserAlbumListensBody(): string {
	const start = source.indexOf("export const getUserAlbumListens");
	assert.ok(start >= 0);
	const end = source.indexOf("const spotifyAlbumSearchResultValidator", start);
	return source.slice(start, end);
}

test("getUserAlbumListens takes before joining albums", () => {
	const body = getUserAlbumListensBody();
	const takeAt = body.indexOf(".take(");
	const collectAt = body.indexOf(".collect(");
	assert.ok(takeAt >= 0, "expected .take(");
	assert.equal(collectAt, -1, "must not .collect() all listens");
	const getAlbumAt = body.indexOf("ctx.db.get(");
	assert.ok(getAlbumAt > takeAt, "album joins must happen after take");
});

test("getUserAlbumListens enriches listenCount and isFirstListen", () => {
	const body = getUserAlbumListensBody();
	assert.match(body, /listenCount/);
	assert.match(body, /isFirstListen/);
	assert.match(body, /firstListenedAt/);
	assert.match(body, /by_userId_albumId/);
});

test("getUserAlbumListens does not use Date.now", () => {
	assert.doesNotMatch(getUserAlbumListensBody(), /Date\.now\(/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test convex/spotify.getUserAlbumListens-source.test.ts`  
Expected: FAIL (still `.collect()` / missing enrichment)

- [ ] **Step 3: Implement query**

Replace handler logic with:

1. `limit = args.limit ?? 500`
2. `userAlbumListens` → `by_userId_listenedAt` eq userId → `order("desc")` → `.take(limit)`
3. Unique `albumId`s from that array
4. For each unique id: `ctx.db.get(albumId)`; `userAlbums` via `by_userId_albumId`
5. Map listens:

```typescript
const userAlbum = userAlbumById.get(listen.albumId);
const listenCount = userAlbum?.listenCount ?? 0;
const firstListenedAt = userAlbum?.firstListenedAt;
const isFirstListen =
	userAlbum !== undefined && listen.listenedAt === userAlbum.firstListenedAt;
return {
	...listen,
	album,
	listenCount,
	...(firstListenedAt !== undefined ? { firstListenedAt } : {}),
	isFirstListen,
};
```

Add `returns` validator if neighboring public queries in this file already use them; otherwise match local file style but prefer validators when easy.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test convex/spotify.getUserAlbumListens-source.test.ts`  
Expected: PASS

- [ ] **Step 5: Push Convex once**

Run: `npx convex dev --once`  
Expected: functions ready

- [ ] **Step 6: Commit**

```bash
git add convex/spotify.ts convex/spotify.getUserAlbumListens-source.test.ts convex/_generated/api.d.ts
git commit -m "$(cat <<'EOF'
fix(listens): bound listen query and enrich from userAlbums

EOF
)"
```

---

### Task 3: Types + badge semantics

**Files:**
- Modify: `src/app/albums/_utils/types.ts`
- Modify: `src/components/album-listen-count-badge.tsx`
- Modify: `src/app/albums/_components/album-card.tsx`

**Interfaces:**
- Consumes: enriched listen fields
- Produces: `HistoryListen` with `listenCount`, `isFirstListen`; card shows First and/or `Nx` correctly

- [ ] **Step 1: Update `HistoryListen`**

```typescript
export type HistoryListen = {
	_id: string;
	albumId: string;
	listenedAt: number;
	album: AlbumInfo | null;
	listenCount: number;
	isFirstListen: boolean;
	firstListenedAt?: number;
};
```

- [ ] **Step 2: Change badge API**

Replace ordinal-only badge with First from `isFirstListen` and `Nx` when `listenCount > 1` (can show both wrappers in an `inline-flex gap-1` container). Do not treat `listenCount === 1` alone as First.

- [ ] **Step 3: Update `AlbumCard` Listens usage path**

- Prefer props `listenCount` + `isFirstListen` over `listenOrdinal` for history rows
- Keep `listenOrdinal` optional only if other callers still need it; otherwise remove and fix call sites
- History should pass `listenCount={listen.listenCount}` and `isFirstListen={listen.isFirstListen}`

- [ ] **Step 4: Typecheck touched files**

Run: `pnpm typecheck`  
Expected: no errors from these prop changes (fix any broken callers)

- [ ] **Step 5: Commit**

```bash
git add src/app/albums/_utils/types.ts src/components/album-listen-count-badge.tsx src/app/albums/_components/album-card.tsx
git commit -m "$(cat <<'EOF'
feat(listens): drive First and Nx badges from userAlbums fields

EOF
)"
```

---

### Task 4: Shared filter controls (shadcn)

**Files:**
- Create: `src/app/albums/_components/listens-filters.tsx`

**Interfaces:**
- Consumes: filter state + setters + `availableYears: number[]` + `grouping: "week" | "month"`
- Produces: presentational filter block used by rail and Sheet

- [ ] **Step 1: Implement `ListensFilters`**

Classic function component using shadcn `Button` (Week|Month segmented), `Checkbox` + `Label`, and year `Select`. Export `ListensGrouping = "week" | "month"`.

- [ ] **Step 2: Helper for active non-default filters**

```typescript
export function listensFiltersAreActive(opts: {
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	yearFilter: string;
}): boolean {
	return (
		opts.onlyUnranked ||
		opts.onlyFirstListens ||
		opts.yearFilter !== "all"
	);
}
```

(Grouping week is default — does not count as active.)

- [ ] **Step 3: Commit**

```bash
git add src/app/albums/_components/listens-filters.tsx
git commit -m "$(cat <<'EOF'
feat(listens): add shared shadcn filter controls

EOF
)"
```

---

### Task 5: Redesign `history-view` layout

**Files:**
- Modify: `src/app/albums/_components/history-view.tsx`
- Modify: `src/app/albums/recent/page.tsx`

**Interfaces:**
- Consumes: flat enriched `HistoryListen[]`
- Produces: desktop rail + mobile Sheet + week/month sections with counts

- [ ] **Step 1: Simplify `recent/page.tsx`**

Remove client ordinal computation. Pass enriched listens array into `HistoryView`.

- [ ] **Step 2: Rewrite `HistoryView` structure**

State: `grouping` default `"week"`, `onlyUnranked`, `onlyFirstListens`, `yearFilter`, `filtersOpen` for Sheet.

Pipeline: `filterListens` → `groupListensByWeek` / `groupListensByMonth` → `sectionStats` per section.

Layout: sticky left rail (`lg+`) with `ListensFilters`; mobile Filters `Button` + `Badge` when active + left `Sheet`; section headers with display font + `N albums · M new`; dense `AlbumCard` rows; empty/loading states.

- [ ] **Step 3: Visual polish pass**

Section hierarchy per spec; no per-row cards; subtle motion only (Sheet + optional section rise); mobile tap targets OK.

- [ ] **Step 4: Manual check**

Run: `pnpm dev` with Convex; open `/albums/recent` as moose  
Verify: week default, month toggle, counts move with filters, First/Nx correct, rate drawer works, mobile Sheet

- [ ] **Step 5: Lint/typecheck**

Run: `pnpm typecheck && pnpm check`  
Expected: clean for touched files

- [ ] **Step 6: Commit**

```bash
git add src/app/albums/_components/history-view.tsx src/app/albums/recent/page.tsx src/app/albums/_components/listens-filters.tsx
git commit -m "$(cat <<'EOF'
feat(listens): redesign timeline with filter rail and week sections

EOF
)"
```

---

### Task 6: Cleanup & regression

**Files:**
- Modify: remove dead `listenOrdinals` usages if any remain
- Optionally stop using `groupByMonth` from `album-tiers` in Listens (keep export for other callers)

- [ ] **Step 1: Search for ordinal leftovers**

Run: `rg "listenOrdinals|listenOrdinal" src/app/albums`  
Expected: no Listens path dependencies; fix stragglers

- [ ] **Step 2: Re-run unit tests**

Run:

```bash
pnpm exec tsx --test src/lib/album-listens-grouping.test.ts convex/spotify.getUserAlbumListens-source.test.ts
```

Expected: PASS

- [ ] **Step 3: Final commit if cleanup needed**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore(listens): remove ordinal-based listen display leftovers

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Week default Mon–Sun + month toggle | 1, 5 |
| Section album + new counts (filtered) | 1, 5 |
| Desktop filter rail + mobile Sheet | 4, 5 |
| Filters: unranked / first / year | 4, 5 |
| True first listen + real listenCount | 2, 3, 5 |
| Bound query take-before-join | 2 |
| shadcn controls + cool slate visual | 4, 5 |
| Keep rating drawer / standalone IA | 5 |
| No URL sync / stats module / drawer | honored (non-goals) |

## Self-review notes

- No TBD placeholders in tasks  
- Types: `HistoryListen.listenCount` / `isFirstListen` consistent across Tasks 2–5  
- `AlbumListenCountBadge` uses `isFirstListen`, not `listenCount === 1` alone  
- Grouping helpers are local-time based (matches existing month grouping); document in helper comments  

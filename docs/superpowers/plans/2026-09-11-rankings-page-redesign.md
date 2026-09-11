# Rankings Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Rankings (`/albums/rated`) into a living year scoreboard (Top 50 + edge 65, decades, ceremonial hierarchy, Sunday WoW signals) plus an optional Elo Duel mode that never writes manual placements.

**Architecture:** Keep manual truth on `userAlbums.rating` + `position`. Compute live ordinals client/server by rating DESC, position ASC for a concrete release year. Add Sunday snapshot header+entry tables with per-user cron fan-out for WoW NEW/±. Add separate Elo duel tables and a Board|Duel mode toggle. Rebuild `rankings-view` UI to match Listens filter-rail patterns without removing keyboard reorder.

**Tech Stack:** Next.js 15 App Router, Convex, React 19, Tailwind v4, shadcn/ui (`Sheet`, `Button`, `Card`, `Badge`, `Separator`, `ToggleGroup`/`Tabs`), existing `album-tiers`, `node:test` via `pnpm exec tsx --test`, Biome

**Spec:** `docs/superpowers/specs/2026-09-11-rankings-page-redesign.md`

## Global Constraints

- Classic function declarations; `type` aliases; kebab-case filenames; inline component props
- Env via `~/env.js` only if new env vars are required (prefer none)
- No `Date.now()` inside Convex **queries**
- No unbounded multi-user snapshot writes in one mutation — cron schedules per-user capture
- Manual ordinal never stored on `userAlbums`
- Duel never writes `rating` / `position` in v1
- `year=all` disables reorder, WoW, and Duel
- Snapshot capture depth = Top 65 only
- Public Convex functions: `args` + `returns` validators; duel mutations verify ownership
- Match Listens shell aesthetic (cool slate / Fraunces / teal); prefer theme tokens
- Work on a feature branch / worktree unless instructed otherwise

## File map

| File | Responsibility |
|---|---|
| `src/lib/ranking-ordinals.ts` | Live sort + ordinal assignment + decade banding + Top 50/65 framing |
| `src/lib/ranking-ordinals.test.ts` | Unit tests for sort/frame/decades/tier boundaries |
| `src/lib/ranking-week.ts` | Shared `weekSundayUtcMs` helper (previous Sunday UTC midnight) |
| `src/lib/ranking-week.test.ts` | Week key tests |
| `src/lib/ranking-wow.ts` | NEW / ± delta from live ordinals vs snapshot entries |
| `src/lib/ranking-wow.test.ts` | WoW badge rules |
| `src/lib/duel-elo.ts` | Elo expected score + update + undo restore helpers |
| `src/lib/duel-elo.test.ts` | Elo math tests |
| `convex/schema.ts` | Snapshot + duel tables/indexes |
| `convex/rankingSnapshots.ts` | Internal capture + public read for latest/complete week |
| `convex/crons.ts` | Sunday orchestrator cron (create if missing) |
| `convex/albumDuels.ts` | Pairing query, pick mutation, undo mutation, duel ranking query |
| `src/app/albums/_components/rankings-filters.tsx` | Year / Frame / Mode rail + Sheet content |
| `src/app/albums/_components/ranking-board-row.tsx` | Stepped visual rows + NEW/± chips |
| `src/app/albums/_components/rankings-duel-arena.tsx` | Two-card duel UI + Skip/Undo |
| `src/app/albums/_components/rankings-view.tsx` | Compose Board/Duel, keyboard reorder, filters layout |
| `src/app/albums/rated/page.tsx` | Wire queries + year state |

---

### Task 1: Ordinal / framing helpers (TDD)

**Files:**
- Create: `src/lib/ranking-ordinals.ts`
- Create: `src/lib/ranking-ordinals.test.ts`

**Interfaces:**
- Consumes: `{ _id: string; rating: number | null; position: number | null; releaseYear: number | null }`
- Produces:
  - `compareManualRank(a, b): number` — rating DESC, position ASC
  - `assignOrdinals<T>(items: T[]): Array<T & { ordinal: number }>`
  - `frameManualBoard(items, opts: { fullYear: boolean }): { top50; edge51to65; rest }`
  - `decadeLabel(ordinal: number): string` — e.g. `1–10`, `51–60`, `61–65`
  - `bandForOrdinal(ordinal: number): "hero" | "podium" | "top5" | "top10" | "top25" | "top50" | "edge"`

- [ ] **Step 1: Write the failing tests**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	assignOrdinals,
	bandForOrdinal,
	compareManualRank,
	decadeLabel,
	frameManualBoard,
} from "./ranking-ordinals";

test("compareManualRank prefers higher rating then lower position", () => {
	const a = { rating: 15, position: 2 };
	const b = { rating: 15, position: 1 };
	const c = { rating: 14, position: 0 };
	assert.ok(compareManualRank(b, a) < 0);
	assert.ok(compareManualRank(a, c) < 0);
});

test("frameManualBoard splits 50 / 15 edge / rest", () => {
	const items = Array.from({ length: 80 }, (_, i) => ({
		_id: String(i),
		rating: 15 - Math.floor(i / 10),
		position: i,
		releaseYear: 2026,
	}));
	const ranked = assignOrdinals([...items].sort(compareManualRank));
	const framed = frameManualBoard(ranked, { fullYear: false });
	assert.equal(framed.top50.length, 50);
	assert.equal(framed.edge51to65.length, 15);
	assert.equal(framed.rest.length, 0);
	const full = frameManualBoard(ranked, { fullYear: true });
	assert.equal(full.rest.length, 15);
});

test("bandForOrdinal and decadeLabel", () => {
	assert.equal(bandForOrdinal(1), "hero");
	assert.equal(bandForOrdinal(3), "podium");
	assert.equal(bandForOrdinal(51), "edge");
	assert.equal(decadeLabel(1), "1–10");
	assert.equal(decadeLabel(65), "61–65");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/ranking-ordinals.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `ranking-ordinals.ts`**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ranking-ordinals.ts src/lib/ranking-ordinals.test.ts
git commit -m "$(cat <<'EOF'
feat(rankings): add manual ordinal framing helpers

EOF
)"
```

---

### Task 2: Week key + WoW helpers (TDD)

**Files:**
- Create: `src/lib/ranking-week.ts`
- Create: `src/lib/ranking-week.test.ts`
- Create: `src/lib/ranking-wow.ts`
- Create: `src/lib/ranking-wow.test.ts`

**Interfaces:**
- `previousSundayUtcMs(nowMs: number): number` — UTC midnight of the most recent Sunday **strictly before** end of the week containing `nowMs` (i.e. last completed Sunday for WoW)
- Document the chosen definition in a one-line comment matching the Convex cron
- `wowSignals({ currentOrdinal, priorOrdinal, priorInTop50 }): { kind: "new" | "delta" | null; delta?: number }`

- [ ] **Step 1: Write failing week + wow tests** (cover NEW vs ± priority, missing prior → null)

- [ ] **Step 2: Run fail → implement → pass**

- [ ] **Step 3: Commit**

```bash
git add src/lib/ranking-week.ts src/lib/ranking-week.test.ts src/lib/ranking-wow.ts src/lib/ranking-wow.test.ts
git commit -m "$(cat <<'EOF'
feat(rankings): add week key and WoW signal helpers

EOF
)"
```

---

### Task 3: Elo helpers (TDD)

**Files:**
- Create: `src/lib/duel-elo.ts`
- Create: `src/lib/duel-elo.test.ts`

**Interfaces:**
- `DEFAULT_ELO = 1500`
- `eloUpdate(a: number, b: number, winner: "a" | "b", k?: number): { a: number; b: number }`
- Pure functions only

- [ ] **Step 1–4:** Failing test → implement → pass → commit `feat(rankings): add Elo update helpers`

---

### Task 4: Schema — snapshots + duel

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Add tables/indexes exactly as spec:
  - `manualRankingSnapshots` + `by_user_year_week`
  - `manualRankingSnapshotEntries` + `by_snapshotId`, `by_user_year_week_ordinal`, `by_user_album_week`
  - `albumDuelScores` + `by_user`, `by_user_userAlbum`
  - `albumDuels` with required before/after scores + optional `undoneAt` + `by_user_createdAt`

- [ ] **Step 1: Add schema tables**

- [ ] **Step 2: Ensure `npx convex dev` / typecheck accepts schema** (local)

- [ ] **Step 3: Commit** `feat(rankings): add snapshot and duel schema`

---

### Task 5: Snapshot capture + cron + read query

**Files:**
- Create: `convex/rankingSnapshots.ts`
- Create: `convex/crons.ts` (if missing) or modify existing
- Create: `convex/rankingSnapshots.capture-source.test.ts` (source/contract style like listens tests, if that pattern fits)

**Interfaces:**
- `internal.rankingSnapshots.orchestrateSunday` — lists users, schedules `captureUserWeek`
- `internal.rankingSnapshots.captureUserWeek` — `{ userId, weekSundayUtcMs }` idempotent pending→complete Top 65
- `api.rankingSnapshots.getCompleteWeek` — args `{ userId, year, weekSundayUtcMs }`, returns header + entries or null; only `status === "complete"`
- Ownership: internal only for writers; public read checks `userId` matches app pattern + returns empty if mismatched if required by existing auth style

- [ ] **Step 1: Implement capture with join to `spotifyAlbums`, parse year, skip unparseable**

- [ ] **Step 2: Wire Sunday cron**

- [ ] **Step 3: Add seed internal mutation (optional one-shot)**

- [ ] **Step 4: Source/unit test for idempotent complete skip**

- [ ] **Step 5: Commit** `feat(rankings): Sunday ordinal snapshot capture`

---

### Task 6: Board UI redesign (no WoW yet)

**Files:**
- Create: `src/app/albums/_components/rankings-filters.tsx`
- Create: `src/app/albums/_components/ranking-board-row.tsx`
- Modify: `src/app/albums/_components/rankings-view.tsx`
- Modify: `src/app/albums/rated/page.tsx`

**Interfaces:**
- Filters: year, frame (`top` | `full`), mode (`board` | `duel`) — Duel/reorder disabled UI when year=`all`
- Layout: Listens-like cluster — list + sticky rail; Sheet below `xl`
- Preserve existing keyboard select + ↑↓ reorder + optimistic updates + ranker drawer hooks
- Use `frameManualBoard` + `bandForOrdinal` for stepped row chrome (#1 crown beat)
- Decades as section headers; tier runners as zero-height/hairline labels

- [ ] **Step 1: Build filters + board rows**

- [ ] **Step 2: Refactor rankings-view to compose Board frame**

- [ ] **Step 3: Manual QA checklist** — Top 50, edge box, Full toggle, keyboard reorder on a concrete year

- [ ] **Step 4: Commit** `feat(rankings): redesign Board scoreboard UI`

---

### Task 7: Wire WoW signals

**Files:**
- Modify: `src/app/albums/_components/rankings-view.tsx`
- Modify: `src/app/albums/_components/ranking-board-row.tsx`
- Modify: `src/app/albums/rated/page.tsx`

**Interfaces:**
- Client computes `weekSundayUtcMs = previousSundayUtcMs(Date.now())` and passes to `getCompleteWeek`
- Map prior ordinals by `userAlbumId`; apply `wowSignals` per row
- Hide entirely when year=`all` or snapshot null

- [ ] **Step 1: Wire query + chips**

- [ ] **Step 2: Empty-state hint when no snapshot**

- [ ] **Step 3: Commit** `feat(rankings): show NEW and spot deltas vs last Sunday`

---

### Task 8: Duel backend

**Files:**
- Create: `convex/albumDuels.ts`

**Interfaces:**
- `getPair` query — concrete year; returns two candidates or null; seeds Elo rows if missing
- `pick` mutation — `{ userId, year, aUserAlbumId, bUserAlbumId, winnerUserAlbumId }` ownership checks; writes duel row with required before/after; updates scores in one mutation
- `undoLast` mutation — latest non-undone for user; restore scores; set `undoneAt`
- `listDuelTop` query — top 50 by Elo for year (join year via albums)

- [ ] **Step 1: Implement with validators + ownership**

- [ ] **Step 2: Add source/unit tests for Elo pick/undo invariants where practical**

- [ ] **Step 3: Commit** `feat(rankings): Elo duel pick and undo`

---

### Task 9: Duel arena UI

**Files:**
- Create: `src/app/albums/_components/rankings-duel-arena.tsx`
- Modify: `src/app/albums/_components/rankings-view.tsx`
- Modify: `src/app/albums/_components/rankings-filters.tsx`

**Interfaces:**
- Mode toggle swaps Board list vs arena
- Cards = primary hit targets; Skip; Undo; keyboard 1/2 or arrows
- Disabled when year=`all` with short explanation
- Optional disclosure for Duel Top 50

- [ ] **Step 1: Build arena**

- [ ] **Step 2: Wire mutations + optimistic settle**

- [ ] **Step 3: Manual QA — pick, undo once, second undo no-ops**

- [ ] **Step 4: Commit** `feat(rankings): Duel mode arena UI`

---

### Task 10: Polish + verify

**Files:** as needed

- [ ] **Step 1:** Skeletons for Board/Duel loading (shadcn `Skeleton`)
- [ ] **Step 2:** `pnpm typecheck` / targeted tests green
- [ ] **Step 3:** Spec coverage pass (Top 50/65, decades, tiers, WoW, duel isolation, year=all)
- [ ] **Step 4:** Commit `chore(rankings): polish loading and verify redesign`

---

## Spec coverage check

| Spec area | Task(s) |
|---|---|
| Top 50 + edge 65 + Full | 1, 6 |
| Decades + tier runners + visual ladder + #1 favor | 1, 6 |
| Filter rail / Sheet / year=all gates | 6, 9 |
| Sunday snapshots + cron fan-out + Top 65 | 4, 5 |
| NEW / ± vs last Sunday | 2, 7 |
| Elo duel + Undo + isolation | 3, 8, 9 |
| Keyboard reorder preserved | 6 |

# Music Funnel New-Since-Visit Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify music-funnel repeats into one recent-first feed with clear multipliers, and Gmail-style “New” highlights (plus a louder missed banner) for repeats that became multi-source and timeline syncs since the soft-clear visit cursor.

**Architecture:** Derive `becameRepeatAt` in Convex from encounter timestamps (2nd distinct source’s earliest `firstSeenAt`). Expose a single `listRepeats` query (mixed types, sort by `latestSeenAt`, limit 60). Client soft-clear visit cursor via `sessionStorage` + `localStorage` (reuse `music-funnel-last-seen-${userId}`). Shared New chrome on repeat rows and timeline rows; banner uses the same `visitSince` and counts new rows from the unified feed.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, TypeScript, Biome, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-10-repeats-new-since-last-visit-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/_utils/musicFunnelRepeats.ts` | `computeBecameRepeatAt`, sort helpers for unified feed |
| Create | `convex/_utils/musicFunnelRepeats.test.ts` | Unit tests for became-repeat + sort |
| Modify | `convex/musicFunnel.ts` | Add `becameRepeatAt` to builders; add `listRepeats` query |
| Create | `src/lib/music-funnel-visit.ts` | Storage keys, resolve visitSince, isNew helpers, missed summary |
| Create | `src/lib/music-funnel-visit.test.ts` | Pure visit/missed helper tests |
| Create | `src/lib/hooks/use-music-funnel-visit-cursor.ts` | Soft-clear React hook |
| Create | `src/app/music-funnel/_components/music-funnel-new-chrome.tsx` | Shared New row wrapper + banner accent classes |
| Modify | `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx` | One feed, multiplier, New chrome |
| Modify | `src/app/music-funnel/_components/music-funnel-timeline.tsx` | New chrome on qualifying runs |
| Modify | `src/app/music-funnel/_components/music-funnel-missed-banner.tsx` | Louder UI, shared cursor, feed-aligned counts |
| Modify | `src/app/music-funnel/page.tsx` | Banner on both tabs; pass visit cursor / shared data as needed |

---

### Task 1: `computeBecameRepeatAt` (TDD)

**Files:**
- Create: `convex/_utils/musicFunnelRepeats.ts`
- Create: `convex/_utils/musicFunnelRepeats.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// convex/_utils/musicFunnelRepeats.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	computeBecameRepeatAt,
	sortUnifiedRepeatsByLatestSeenAt,
} from "./musicFunnelRepeats";

test("becameRepeatAt is the earliest time a second distinct source appeared", () => {
	const becameAt = computeBecameRepeatAt([
		{ sourceId: "a", firstSeenAt: 1000 },
		{ sourceId: "a", firstSeenAt: 1500 },
		{ sourceId: "b", firstSeenAt: 3000 },
		{ sourceId: "c", firstSeenAt: 4000 },
	]);
	assert.equal(becameAt, 3000);
});

test("becameRepeatAt uses each source's earliest encounter", () => {
	const becameAt = computeBecameRepeatAt([
		{ sourceId: "b", firstSeenAt: 5000 },
		{ sourceId: "a", firstSeenAt: 2000 },
		{ sourceId: "b", firstSeenAt: 2500 },
	]);
	assert.equal(becameAt, 2500);
});

test("sortUnifiedRepeatsByLatestSeenAt is descending by latestSeenAt", () => {
	const sorted = sortUnifiedRepeatsByLatestSeenAt([
		{ id: "old", latestSeenAt: 100 },
		{ id: "new", latestSeenAt: 300 },
		{ id: "mid", latestSeenAt: 200 },
	]);
	assert.deepEqual(
		sorted.map((row) => row.id),
		["new", "mid", "old"],
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test convex/_utils/musicFunnelRepeats.test.ts`  
Expected: FAIL (module / exports missing)

- [ ] **Step 3: Write minimal implementation**

```typescript
// convex/_utils/musicFunnelRepeats.ts
export function computeBecameRepeatAt(
	rows: Array<{ sourceId: string; firstSeenAt: number }>,
): number {
	const earliestBySource = new Map<string, number>();
	for (const row of rows) {
		const prev = earliestBySource.get(row.sourceId);
		if (prev === undefined || row.firstSeenAt < prev) {
			earliestBySource.set(row.sourceId, row.firstSeenAt);
		}
	}
	const times = [...earliestBySource.values()].sort((a, b) => a - b);
	const second = times[1];
	if (second === undefined) {
		throw new Error("computeBecameRepeatAt requires at least 2 distinct sources");
	}
	return second;
}

export function sortUnifiedRepeatsByLatestSeenAt<
	TRow extends { latestSeenAt: number },
>(rows: TRow[]): TRow[] {
	return [...rows].sort((a, b) => b.latestSeenAt - a.latestSeenAt);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test convex/_utils/musicFunnelRepeats.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/musicFunnelRepeats.ts convex/_utils/musicFunnelRepeats.test.ts
git commit -m "feat(music-funnel): add becameRepeatAt helper"
```

---

### Task 2: Visit / missed pure helpers (TDD)

**Files:**
- Create: `src/lib/music-funnel-visit.ts`
- Create: `src/lib/music-funnel-visit.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/music-funnel-visit.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	getLastSeenStorageKey,
	getVisitSinceSessionKey,
	isNewSince,
	resolveVisitSince,
	sourceRunHasActivity,
	summarizeMissed,
} from "./music-funnel-visit";

test("storage keys are user-scoped", () => {
	assert.equal(getLastSeenStorageKey("u1"), "music-funnel-last-seen-u1");
	assert.equal(
		getVisitSinceSessionKey("u1"),
		"music-funnel-visit-since-u1",
	);
});

test("resolveVisitSince prefers session, then local, then now", () => {
	assert.equal(
		resolveVisitSince({ sessionValue: "100", localValue: "200", now: 999 }),
		100,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: null, localValue: "200", now: 999 }),
		200,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: null, localValue: null, now: 999 }),
		999,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: "nope", localValue: "also", now: 999 }),
		999,
	);
});

test("isNewSince is strict greater-than", () => {
	assert.equal(isNewSince(101, 100), true);
	assert.equal(isNewSince(100, 100), false);
	assert.equal(isNewSince(99, 100), false);
});

test("sourceRunHasActivity matches spec", () => {
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		}),
		false,
	);
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 1,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		}),
		true,
	);
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 2,
			artistRepeatsFound: 0,
		}),
		true,
	);
});

test("summarizeMissed counts syncs and new repeats by type", () => {
	const summary = summarizeMissed({
		visitSince: 1000,
		sourceRuns: [
			{
				startedAt: 1500,
				newEncounters: 1,
				trackRepeatsFound: 0,
				albumRepeatsFound: 0,
				artistRepeatsFound: 0,
			},
			{
				startedAt: 500,
				newEncounters: 9,
				trackRepeatsFound: 9,
				albumRepeatsFound: 9,
				artistRepeatsFound: 9,
			},
			{
				startedAt: 1600,
				newEncounters: 0,
				trackRepeatsFound: 0,
				albumRepeatsFound: 0,
				artistRepeatsFound: 0,
			},
		],
		repeats: [
			{ type: "track", becameRepeatAt: 1100 },
			{ type: "track", becameRepeatAt: 900 },
			{ type: "album", becameRepeatAt: 1200 },
			{ type: "artist", becameRepeatAt: 1300 },
		],
	});
	assert.deepEqual(summary, {
		syncCount: 1,
		repeatTrackCount: 1,
		repeatAlbumCount: 1,
		repeatArtistCount: 1,
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/music-funnel-visit.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/music-funnel-visit.ts
export function getLastSeenStorageKey(userId: string): string {
	return `music-funnel-last-seen-${userId}`;
}

export function getVisitSinceSessionKey(userId: string): string {
	return `music-funnel-visit-since-${userId}`;
}

function parseTimestamp(value: string | null): number | null {
	if (value === null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export function resolveVisitSince({
	sessionValue,
	localValue,
	now,
}: {
	sessionValue: string | null;
	localValue: string | null;
	now: number;
}): number {
	return (
		parseTimestamp(sessionValue) ?? parseTimestamp(localValue) ?? now
	);
}

export function isNewSince(eventAt: number, visitSince: number): boolean {
	return eventAt > visitSince;
}

export function sourceRunHasActivity(run: {
	newEncounters: number;
	trackRepeatsFound: number;
	albumRepeatsFound: number;
	artistRepeatsFound: number;
}): boolean {
	return (
		run.newEncounters > 0 ||
		run.trackRepeatsFound > 0 ||
		run.albumRepeatsFound > 0 ||
		run.artistRepeatsFound > 0
	);
}

export function summarizeMissed({
	visitSince,
	sourceRuns,
	repeats,
}: {
	visitSince: number;
	sourceRuns: Array<{
		startedAt: number;
		newEncounters: number;
		trackRepeatsFound: number;
		albumRepeatsFound: number;
		artistRepeatsFound: number;
	}>;
	repeats: Array<{ type: "track" | "album" | "artist"; becameRepeatAt: number }>;
}): {
	syncCount: number;
	repeatTrackCount: number;
	repeatAlbumCount: number;
	repeatArtistCount: number;
} {
	const syncCount = sourceRuns.filter(
		(run) =>
			run.startedAt > visitSince && sourceRunHasActivity(run),
	).length;

	let repeatTrackCount = 0;
	let repeatAlbumCount = 0;
	let repeatArtistCount = 0;
	for (const row of repeats) {
		if (!isNewSince(row.becameRepeatAt, visitSince)) continue;
		if (row.type === "track") repeatTrackCount += 1;
		else if (row.type === "album") repeatAlbumCount += 1;
		else repeatArtistCount += 1;
	}

	return {
		syncCount,
		repeatTrackCount,
		repeatAlbumCount,
		repeatArtistCount,
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/music-funnel-visit.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/music-funnel-visit.ts src/lib/music-funnel-visit.test.ts
git commit -m "feat(music-funnel): add visit cursor helpers"
```

---

### Task 3: Convex `listRepeats` + `becameRepeatAt` on builders

**Files:**
- Modify: `convex/musicFunnel.ts`
- Modify: `convex/_utils/musicFunnelRepeats.ts` (import only; already created)

- [ ] **Step 1: Import helper and extend builders**

At top of `convex/musicFunnel.ts` (with other imports):

```typescript
import {
	computeBecameRepeatAt,
	sortUnifiedRepeatsByLatestSeenAt,
} from "./_utils/musicFunnelRepeats";
```

In `buildTrackRepeats`, after confirming `sourceIds.length >= 2`, add:

```typescript
becameRepeatAt: computeBecameRepeatAt(
	rows.map((row) => ({
		sourceId: row.sourceId,
		firstSeenAt: row.firstSeenAt,
	})),
),
```

Do the same in `buildAlbumRepeats` (map from encounter rows) and `buildArtistRepeats` (map from artist rows that already have `sourceId` + `firstSeenAt`).

- [ ] **Step 2: Update return validators for the three existing list queries**

Add `becameRepeatAt: v.number()` to `trackRepeatValidator`, `albumRepeatValidator`, and `artistRepeatValidator`.

- [ ] **Step 3: Add unified validator + `listRepeats` query**

```typescript
const unifiedRepeatValidator = v.union(
	v.object({
		type: v.literal("track"),
		spotifyTrackId: v.string(),
		trackName: v.string(),
		primaryArtistName: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
		addedToRepeatPlaylistAt: v.optional(v.number()),
	}),
	v.object({
		type: v.literal("album"),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		primaryArtistName: v.string(),
		albumImageUrl: v.optional(v.string()),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		contributingTrackCount: v.number(),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
	}),
	v.object({
		type: v.literal("artist"),
		spotifyArtistId: v.string(),
		name: v.string(),
		sourceCount: v.number(),
		sources: v.array(sourceLabelValidator),
		contributingTrackCount: v.number(),
		firstSeenAt: v.number(),
		latestSeenAt: v.number(),
		becameRepeatAt: v.number(),
	}),
);

export const listRepeats = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(unifiedRepeatValidator),
	handler: async (ctx, args) => {
		const limit = clampLimit(args.limit, 60, 100);
		const encounters = await loadEncounterRows(ctx, args.userId, 5000);
		const sourceLabels = await loadSourceLabelMap(ctx, args.userId);
		const repeatAddedAtByTrackId = await loadRepeatPlaylistAddedAtByTrackId(
			ctx,
			args.userId,
		);
		const tracks = buildTrackRepeats(
			encounters,
			sourceLabels,
			repeatAddedAtByTrackId,
		).map((row) => ({ type: "track" as const, ...row }));
		const albums = buildAlbumRepeats(encounters, sourceLabels).map((row) => ({
			type: "album" as const,
			...row,
		}));
		const artists = buildArtistRepeats(encounters, sourceLabels).map(
			(row) => ({ type: "artist" as const, ...row }),
		);
		return sortUnifiedRepeatsByLatestSeenAt([
			...tracks,
			...albums,
			...artists,
		]).slice(0, limit);
	},
});
```

- [ ] **Step 4: Typecheck / Convex codegen**

With `npx convex dev` already running (or start it), confirm functions compile. Then:

Run: `pnpm typecheck`  
Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git add convex/musicFunnel.ts
git commit -m "feat(music-funnel): add listRepeats with becameRepeatAt"
```

---

### Task 4: Soft-clear visit cursor hook

**Files:**
- Create: `src/lib/hooks/use-music-funnel-visit-cursor.ts`

- [ ] **Step 1: Implement the hook**

```typescript
"use client";

import { useEffect, useState } from "react";
import {
	getLastSeenStorageKey,
	getVisitSinceSessionKey,
	resolveVisitSince,
} from "~/lib/music-funnel-visit";

export function useMusicFunnelVisitCursor(userId: string): {
	visitSince: number | null;
} {
	const [visitSince, setVisitSince] = useState<number | null>(null);

	useEffect(() => {
		const sessionKey = getVisitSinceSessionKey(userId);
		const localKey = getLastSeenStorageKey(userId);
		const now = Date.now();

		let sessionValue = sessionStorage.getItem(sessionKey);
		const localValue = localStorage.getItem(localKey);
		const resolved = resolveVisitSince({ sessionValue, localValue, now });

		if (sessionValue === null) {
			sessionStorage.setItem(sessionKey, String(resolved));
			sessionValue = String(resolved);
		}

		setVisitSince(resolved);

		function persistLeave(): void {
			localStorage.setItem(localKey, String(Date.now()));
		}

		function handleVisibilityChange(): void {
			if (document.visibilityState === "hidden") {
				persistLeave();
			}
		}

		window.addEventListener("pagehide", persistLeave);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.removeEventListener("pagehide", persistLeave);
			document.removeEventListener(
				"visibilitychange",
				handleVisibilityChange,
			);
		};
	}, [userId]);

	return { visitSince };
}
```

Notes:
- Do **not** write `localStorage` on load.
- Refresh keeps `sessionStorage` → same `visitSince`.
- Leaving advances `localStorage` for the next visit.

- [ ] **Step 2: Commit**

```bash
git add src/lib/hooks/use-music-funnel-visit-cursor.ts
git commit -m "feat(music-funnel): add soft-clear visit cursor hook"
```

---

### Task 5: Shared New chrome

**Files:**
- Create: `src/app/music-funnel/_components/music-funnel-new-chrome.tsx`

- [ ] **Step 1: Implement chrome helpers**

Use existing app tokens; accent should read clearly against muted UI (amber left bar — not purple glow).

```typescript
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export const musicFunnelNewBannerClassName =
	"rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-3";

export function MusicFunnelNewChrome({
	isNew,
	className,
	children,
}: {
	isNew: boolean;
	className?: string;
	children: ReactNode;
}): ReactNode {
	return (
		<div
			className={cn(
				className,
				isNew &&
					"border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/10",
			)}
		>
			{isNew ? (
				<span className="mb-1 inline-block font-medium text-amber-700 text-xs dark:text-amber-400">
					New
				</span>
			) : null}
			{children}
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/music-funnel/_components/music-funnel-new-chrome.tsx
git commit -m "feat(music-funnel): add shared New highlight chrome"
```

---

### Task 6: Unified repeats list UI

**Files:**
- Modify: `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx`

- [ ] **Step 1: Rewrite to single `listRepeats` feed**

Replace the three `useQuery` calls with:

```typescript
const repeats = useQuery(api.musicFunnel.listRepeats, {
	userId,
	limit: 60,
});
```

Accept `visitSince: number | null` as a prop (from page).

One `RepeatCard` titled **Repeats** with description like “Cross-source tracks, albums, and artists — most recently active first.”

Map each row:
- `type === "track"` → title `trackName`, subtitle artists/album, type label `Track`
- `type === "album"` → title `albumName`, type `Album`
- `type === "artist"` → title `name`, type `Artist`

Row layout:
- Wrap content in `MusicFunnelNewChrome` with `isNew={visitSince !== null && isNewSince(row.becameRepeatAt, visitSince)}`
- Show **`{sourceCount}×`** prominently next to the title (e.g. `<span className="font-semibold tabular-nums">{sourceCount}×</span>`)
- Keep sources line + relative first/last seen (and track playlist-added when present)
- Type as a small muted label (`Track` / `Album` / `Artist`)

Remove the three separate cards.

- [ ] **Step 2: Commit**

```bash
git add src/app/music-funnel/_components/music-funnel-repeat-lists.tsx
git commit -m "feat(music-funnel): unify repeats into one recent-first feed"
```

---

### Task 7: Timeline New + louder banner on both tabs

**Files:**
- Modify: `src/app/music-funnel/_components/music-funnel-timeline.tsx`
- Modify: `src/app/music-funnel/_components/music-funnel-missed-banner.tsx`
- Modify: `src/app/music-funnel/page.tsx`

- [ ] **Step 1: Timeline**

Add props `visitSince: number | null`.

For each `sourceRun`, compute:

```typescript
const isNew =
	visitSince !== null &&
	sourceRun.startedAt > visitSince &&
	sourceRunHasActivity(sourceRun);
```

Wrap the row content (the flex block inside `<li>`) with `MusicFunnelNewChrome` (`isNew`, keep spacing classes). Import `sourceRunHasActivity` from `~/lib/music-funnel-visit`.

- [ ] **Step 2: Banner**

- Remove local `getLastSeenStorageKey` / localStorage init that stamped “now” on first load and advanced on Okay.
- Props: `userId`, `visitSince: number | null`, and either:
  - query `listRepeats` + `listRecentSourceRuns` inside the banner, or
  - receive `repeats` + `sourceRuns` from the page to avoid duplicate subscriptions Prefer **page-level queries once** and pass data down if easy; otherwise banner may query (Convex dedupes identical subscriptions).
- Use `summarizeMissed({ visitSince, sourceRuns, repeats })` when `visitSince` and data are ready.
- Apply `musicFunnelNewBannerClassName` instead of muted gray.
- Okay: local `dismissed` state only — **do not** write localStorage.
- Hide when `!hasActivity` (any of the four summary counts > 0).

- [ ] **Step 3: Page wiring**

```typescript
const { visitSince } = useMusicFunnelVisitCursor(userId);

// banner always (both tabs), not timeline-only
<MusicFunnelMissedBanner userId={userId} visitSince={visitSince} />

{activeTab === "timeline" ? (
  <MusicFunnelTimeline userId={userId} sources={sources} visitSince={visitSince} />
) : (
  <MusicFunnelRepeatLists userId={userId} visitSince={visitSince} />
)}
```

- [ ] **Step 4: Typecheck + lint touched files**

Run: `pnpm typecheck`  
Run: `pnpm check` (or `pnpm check:write` on touched paths if needed)  
Expected: clean for changed files

- [ ] **Step 5: Manual smoke (dev)**

1. Open `/music-funnel` — first visit: no New / no banner (or empty).
2. With data older than a prior leave timestamp in localStorage, reload in a fresh session: New on qualifying timeline + repeats; banner louder; counts match new repeat rows.
3. Refresh mid-visit: New remains.
4. Switch Timeline ↔ Repeats: banner still visible when relevant.
5. Leave tab / navigate away, return in new session: previous New cleared without Okay.

- [ ] **Step 6: Commit**

```bash
git add \
  src/app/music-funnel/_components/music-funnel-timeline.tsx \
  src/app/music-funnel/_components/music-funnel-missed-banner.tsx \
  src/app/music-funnel/page.tsx
git commit -m "feat(music-funnel): highlight new timeline syncs and louder missed banner"
```

---

### Task 8: Close the idea loop

**Files:**
- Modify: `docs/ideas/2026-07-10-repeats-highlight-new-since-last-visit.md`

- [ ] **Step 1: Mark idea done**

Set frontmatter `status: done` (or `shipped`) and add a one-line note pointing at the spec + plan.

- [ ] **Step 2: Commit**

```bash
git add docs/ideas/2026-07-10-repeats-highlight-new-since-last-visit.md
git commit -m "docs: mark repeats new-since-visit idea done"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Unified mixed repeats feed | 6 |
| Sort by `latestSeenAt` | 1 + 3 |
| Clear multiplier on row | 6 |
| New = became ≥2 sources after visitSince | 1 + 3 + 6 |
| Timeline New for active runs since visitSince | 7 |
| Soft-clear visit cursor | 2 + 4 |
| Louder banner, same cursor, feed-aligned counts | 2 + 7 |
| Banner on both tabs | 7 |
| Okay dismisses banner only | 7 |
| Shared New chrome | 5 |
| Limit 60 | 3 + 6 |
| Out of scope left out | — |

## Self-review notes

- No TBD placeholders; helpers and query shapes are fully specified.
- `becameRepeatAt` naming consistent across Convex, visit helpers, and UI.
- Storage key reuses existing `music-funnel-last-seen-${userId}`; session key is new and separate.
- Old `listTrackRepeats` / `listAlbumRepeats` / `listArtistRepeats` remain for now (still return `becameRepeatAt` after Task 3) but UI stops calling them — fine; delete later if unused.

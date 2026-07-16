# Music Funnel Sync Details + One-Off Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand timeline sync rows to show that run’s new encounters (repeats-playlist writes first, small art), hide zero-encounter runs, and support one-off playlist sources that sync once then stay out of bulk/cron while grouping under a shared curator Combobox.

**Architecture:** Add optional `kind` on `musicFunnelSources` (default `recurring`), single-source sync API path that deactivates one-offs on success, and a Convex query of encounters + repeat writes by `sourceRunId`. Pure sort helper keeps playlist-write membership as the tiebreaker. No parallel import tables; missed banner unchanged.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, TypeScript, Biome, existing `~/components/ui/combobox`, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-16-music-funnel-sync-details-and-one-offs-design.md`

## Global Constraints

- Missed banner / visit cursor: do not change
- Repeat-vs-other sort: `musicFunnelPlaylistWrites` with `kind: "repeat"` and matching `sourceRunId` wins if heuristics diverge
- Existing sources without `kind`: treat as `recurring`
- Timeline rows: only `newEncounters > 0`
- Multiple timeline expands may be open at once
- One-off: sync once on add; never cron/bulk; deactivate only after successful sync
- Curator grouping: `curatorName` only; Combobox search + create
- No promote-one-off-to-recurring in this plan
- Env via `~/env.js`; classic function declarations; `type` not `interface`; kebab-case files

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/music-funnel-source-run-details.ts` | Sort encounters: repeat-write tracks first |
| Create | `src/lib/music-funnel-source-run-details.test.ts` | Unit tests for sort |
| Modify | `convex/schema.ts` | `kind` on sources; `by_sourceRunId` on encounters (+ writes if needed) |
| Modify | `convex/musicFunnel.ts` | validators, upsert `kind`, `listSourceRunEncounters`, normalize kind |
| Modify | `src/lib/music-funnel-sync.ts` | Skip one-offs in bulk; `syncMusicFunnelSource`; deactivate one-off on success |
| Modify | `src/app/api/music-funnel/sync/route.ts` | Optional `sourceId` body |
| Modify | `src/app/music-funnel/_components/music-funnel-timeline.tsx` | Filter empty; multi-expand; detail panel |
| Create | `src/app/music-funnel/_components/music-funnel-source-run-details.tsx` | Lazy detail list UI |
| Modify | `src/app/music-funnel/_components/music-funnel-sources-card.tsx` | Kind toggle, curator Combobox, one-off create/retry |
| Create | `src/app/music-funnel/_components/music-funnel-curator-combobox.tsx` | Single-select Combobox + Create |

---

### Task 1: Sort helper (TDD)

**Files:**
- Create: `src/lib/music-funnel-source-run-details.ts`
- Create: `src/lib/music-funnel-source-run-details.test.ts`

**Interfaces:**
- Produces: `sortSourceRunEncounterDetails(encounters, repeatWriteTrackIds): T[]` where `T` has at least `spotifyTrackId`, `trackName`, `firstSeenAt`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/music-funnel-source-run-details.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { sortSourceRunEncounterDetails } from "./music-funnel-source-run-details";

test("repeat-write tracks sort before other new encounters", () => {
	const sorted = sortSourceRunEncounterDetails(
		[
			{
				spotifyTrackId: "a",
				trackName: "Alpha",
				firstSeenAt: 100,
			},
			{
				spotifyTrackId: "b",
				trackName: "Beta",
				firstSeenAt: 200,
			},
			{
				spotifyTrackId: "c",
				trackName: "Charlie",
				firstSeenAt: 50,
			},
		],
		new Set(["b", "c"]),
	);
	assert.deepEqual(
		sorted.map((row) => row.spotifyTrackId),
		["c", "b", "a"],
	);
});

test("within each group, sort by firstSeenAt ascending then trackName", () => {
	const sorted = sortSourceRunEncounterDetails(
		[
			{ spotifyTrackId: "z", trackName: "Zoo", firstSeenAt: 10 },
			{ spotifyTrackId: "y", trackName: "Yak", firstSeenAt: 10 },
		],
		new Set<string>(),
	);
	assert.deepEqual(
		sorted.map((row) => row.spotifyTrackId),
		["y", "z"],
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/music-funnel-source-run-details.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/music-funnel-source-run-details.ts
export function sortSourceRunEncounterDetails<
	T extends {
		spotifyTrackId: string;
		trackName: string;
		firstSeenAt: number;
	},
>(encounters: T[], repeatWriteTrackIds: ReadonlySet<string>): T[] {
	return [...encounters].sort((left, right) => {
		const leftRepeat = repeatWriteTrackIds.has(left.spotifyTrackId) ? 0 : 1;
		const rightRepeat = repeatWriteTrackIds.has(right.spotifyTrackId) ? 0 : 1;
		if (leftRepeat !== rightRepeat) return leftRepeat - rightRepeat;
		if (left.firstSeenAt !== right.firstSeenAt) {
			return left.firstSeenAt - right.firstSeenAt;
		}
		return left.trackName.localeCompare(right.trackName);
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/music-funnel-source-run-details.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/music-funnel-source-run-details.ts src/lib/music-funnel-source-run-details.test.ts
git commit -m "feat(music-funnel): sort source-run encounters with repeats first"
```

---

### Task 2: Schema — `kind` + `by_sourceRunId`

**Files:**
- Modify: `convex/schema.ts` (`musicFunnelSources`, `musicFunnelTrackEncounters`, optionally `musicFunnelPlaylistWrites`)

**Interfaces:**
- Produces: `musicFunnelSources.kind` optional union; encounter index `by_sourceRunId`

- [ ] **Step 1: Update schema**

In `musicFunnelSources` table fields, add after `isActive`:

```typescript
kind: v.optional(
	v.union(v.literal("recurring"), v.literal("one_off")),
),
```

On `musicFunnelTrackEncounters`, add index:

```typescript
.index("by_sourceRunId", ["sourceRunId"])
```

On `musicFunnelPlaylistWrites`, add:

```typescript
.index("by_sourceRunId", ["sourceRunId"])
```

(Writes already have optional `sourceRunId`; querying by index avoids scanning `by_runId`.)

Keep `kind` optional so existing docs remain readable without a blocking backfill. Application code always writes `kind` on insert/update and normalizes missing → `"recurring"`.

- [ ] **Step 2: Ensure Convex accepts schema**

With `npx convex dev` running (or run once): schema push should succeed.  
If you cannot run Convex, at least `pnpm typecheck` after Task 3 regenerates types.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(music-funnel): add source kind and sourceRunId indexes"
```

---

### Task 3: Convex — normalize `kind`, upsert, `listSourceRunEncounters`

**Files:**
- Modify: `convex/musicFunnel.ts`

**Interfaces:**
- Consumes: schema `kind`, `by_sourceRunId`
- Produces:
  - `sourceReturnValidator.kind: v.union(v.literal("recurring"), v.literal("one_off"))`
  - `upsertSource` arg `kind: v.optional(...)` defaulting to `"recurring"`
  - `listSourceRunEncounters({ userId, sourceRunId })` → `{ encounters, repeatWriteTrackIds: string[] }`

- [ ] **Step 1: Add helpers + extend validators**

Near top of `convex/musicFunnel.ts`:

```typescript
const sourceKindValidator = v.union(
	v.literal("recurring"),
	v.literal("one_off"),
);

function normalizeSourceKind(
	kind: "recurring" | "one_off" | undefined,
): "recurring" | "one_off" {
	return kind ?? "recurring";
}
```

Add `kind: sourceKindValidator` to `sourceReturnValidator`.

Add mapper used wherever a source doc is returned:

```typescript
function toSourceReturn(doc: Doc<"musicFunnelSources">) {
	return {
		...doc,
		kind: normalizeSourceKind(doc.kind),
	};
}
```

Update `listSources` to `.map(toSourceReturn)` (and any other source-returning queries).

- [ ] **Step 2: Update `upsertSource`**

Add arg `kind: v.optional(sourceKindValidator)`. When editing an existing source, if `args.kind` is omitted, keep existing `kind` (do not force recurring). On insert, default `"recurring"`. Always write `kind` on patch/insert.

- [ ] **Step 3: Add `listSourceRunEncounters`**

```typescript
export const listSourceRunEncounters = query({
	args: {
		userId: v.string(),
		sourceRunId: v.id("musicFunnelSourceRuns"),
	},
	returns: v.object({
		encounters: v.array(
			v.object({
				_id: v.id("musicFunnelTrackEncounters"),
				spotifyTrackId: v.string(),
				trackName: v.string(),
				primaryArtistName: v.string(),
				albumName: v.string(),
				albumImageUrl: v.optional(v.string()),
				firstSeenAt: v.number(),
			}),
		),
		repeatWriteTrackIds: v.array(v.string()),
	}),
	handler: async (ctx, args) => {
		const sourceRun = await ctx.db.get(args.sourceRunId);
		if (!sourceRun || sourceRun.userId !== args.userId) {
			return { encounters: [], repeatWriteTrackIds: [] };
		}

		const encounterDocs = await ctx.db
			.query("musicFunnelTrackEncounters")
			.withIndex("by_sourceRunId", (q) =>
				q.eq("sourceRunId", args.sourceRunId),
			)
			.collect();

		const writeDocs = await ctx.db
			.query("musicFunnelPlaylistWrites")
			.withIndex("by_sourceRunId", (q) =>
				q.eq("sourceRunId", args.sourceRunId),
			)
			.collect();

		const repeatWriteTrackIds = writeDocs
			.filter((row) => row.kind === "repeat")
			.map((row) => row.spotifyTrackId);

		return {
			encounters: encounterDocs.map((row) => ({
				_id: row._id,
				spotifyTrackId: row.spotifyTrackId,
				trackName: row.trackName,
				primaryArtistName: row.primaryArtistName,
				albumName: row.albumName,
				albumImageUrl: row.albumImageUrl,
				firstSeenAt: row.firstSeenAt,
			})),
			repeatWriteTrackIds,
		};
	},
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git add convex/musicFunnel.ts
git commit -m "feat(music-funnel): source kind upsert and listSourceRunEncounters"
```

---

### Task 4: Single-source sync + bulk one-off guard

**Files:**
- Modify: `src/lib/music-funnel-sync.ts`
- Modify: `src/app/api/music-funnel/sync/route.ts`

**Interfaces:**
- Consumes: sources with `kind`, `setSourceActive`
- Produces: `syncMusicFunnel` skips `one_off`; `syncMusicFunnelSource({ accessToken, userId, sourceId })`; API `sourceId?: string`

- [ ] **Step 1: Guard bulk sync**

In `syncMusicFunnel`, inside the sources loop, skip one-offs:

```typescript
for (const musicFunnelSource of sources) {
	const kind = musicFunnelSource.kind ?? "recurring";
	if (kind === "one_off") {
		continue;
	}
	// ... existing syncSourcePlaylist call
}
```

- [ ] **Step 2: Add `syncMusicFunnelSource`**

New export in `src/lib/music-funnel-sync.ts`. Same run lifecycle as `syncMusicFunnel`, but:

1. `listSources` without `activeOnly` (or get by id)
2. Sync only the matching `sourceId` via existing private `syncSourcePlaylist`
3. If `result.sourceSucceeded && (source.kind ?? "recurring") === "one_off"`, call `setSourceActive({ sourceId, isActive: false })`
4. Mirror `syncMusicFunnel` analytics + `finishRun` / catch behavior exactly (copy the catch block; do not leave a stub)

Return type: `MusicFunnelSyncResult`.

- [ ] **Step 3: Update API route**

```typescript
import { syncMusicFunnel, syncMusicFunnelSource } from "~/lib/music-funnel-sync";
import type { Id } from "../../../../../convex/_generated/dataModel";

// body: { userId?: string; sourceId?: string }

const result = body.sourceId
	? await syncMusicFunnelSource({
			accessToken,
			userId: body.userId,
			sourceId: body.sourceId as Id<"musicFunnelSources">,
		})
	: await syncMusicFunnel({
			accessToken,
			userId: body.userId,
			source: "manual",
		});
```

Keep existing connection refresh and status response handling.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS for these files

- [ ] **Step 5: Commit**

```bash
git add src/lib/music-funnel-sync.ts src/app/api/music-funnel/sync/route.ts
git commit -m "feat(music-funnel): single-source sync and skip one-offs in bulk"
```

---

### Task 5: Timeline filter + expandable details UI

**Files:**
- Create: `src/app/music-funnel/_components/music-funnel-source-run-details.tsx`
- Modify: `src/app/music-funnel/_components/music-funnel-timeline.tsx`

**Interfaces:**
- Consumes: `api.musicFunnel.listSourceRunEncounters`, `sortSourceRunEncounterDetails`
- Produces: expandable timeline rows; multi-open set of sourceRun ids

- [ ] **Step 1: Create details component**

`MusicFunnelSourceRunDetails({ userId, sourceRunId })`:

- `useQuery(api.musicFunnel.listSourceRunEncounters, { userId, sourceRunId })`
- Loading: “Loading tracks…”
- Sort with `sortSourceRunEncounterDetails(details.encounters, new Set(details.repeatWriteTrackIds))`
- Each row: 28×28 album art (or muted placeholder), track name, primary artist; “Repeat” badge when in `repeatWriteTrackIds`
- Empty: “No new tracks.” (should be rare because parent filters `newEncounters > 0`)

- [ ] **Step 2: Update timeline**

1. `useState` for expanded ids (`Set<string>` with clone-on-toggle).
2. Filter: `(sourceRuns ?? []).filter((run) => run.newEncounters > 0)`.
3. Row click / chevron toggles expand (`ChevronDown` / `ChevronRight` from `lucide-react`). Multiple open at once.
4. When expanded, render `<MusicFunnelSourceRunDetails … />`.
5. Empty copy: if `sourceRuns.length === 0` keep “No syncs yet…”; if all filtered out, “No syncs with new tracks yet.”

- [ ] **Step 3: Manual smoke (dev)**

1. Timeline — rows with `0 new tracks` gone.
2. Expand a row — list loads; repeat writes on top with badge; small art.
3. Two rows open at once — both stay open.

- [ ] **Step 4: Commit**

```bash
git add \
  src/app/music-funnel/_components/music-funnel-source-run-details.tsx \
  src/app/music-funnel/_components/music-funnel-timeline.tsx
git commit -m "feat(music-funnel): expandable timeline sync track details"
```

---

### Task 6: Curator Combobox

**Files:**
- Create: `src/app/music-funnel/_components/music-funnel-curator-combobox.tsx`
- Read: `src/components/ui/combobox.tsx` (wire real single-select exports; do not leave a stub)

**Interfaces:**
- Consumes: `~/components/ui/combobox`
- Produces: `MusicFunnelCuratorCombobox({ curators, value, onValueChange })`

- [ ] **Step 1: Implement Combobox wrapper with Create**

Use single-select (`multiple={false}`), `value={value ? [value] : []}`, map `onValueChange` to first item.

**Create option:** keep local `filter` state synced from the Combobox input. Build:

```typescript
const CREATE_PREFIX = "__create__:";
const unique = Array.from(new Set(curators.filter(Boolean)));
const trimmed = filter.trim();
const canCreate =
	trimmed.length > 0 &&
	!unique.some((name) => name.toLowerCase() === trimmed.toLowerCase());
const items = [
	...unique,
	...(canCreate ? [`${CREATE_PREFIX}${trimmed}`] : []),
];
```

`getItemLabel`: create items → `Create “${name}”`; otherwise the name.  
`onValueChange`: strip `CREATE_PREFIX` when present.

Open `combobox.tsx` and use the actual single-select trigger/input components so filter stays in sync. Match patterns from `recipe-form.tsx` where helpful, but this control is single-value not chips-multi.

- [ ] **Step 2: Commit**

```bash
git add src/app/music-funnel/_components/music-funnel-curator-combobox.tsx
git commit -m "feat(music-funnel): curator combobox with create option"
```

---

### Task 7: Sources card — kind, Combobox, one-off create/retry

**Files:**
- Modify: `src/app/music-funnel/_components/music-funnel-sources-card.tsx`

**Interfaces:**
- Consumes: `MusicFunnelCuratorCombobox`, sync API with `sourceId`, `upsertSource` + `kind`

- [ ] **Step 1: Extend form state**

Add `kind: "recurring" | "one_off"` to form (default `"recurring"`).  
`startEdit`: `kind: source.kind ?? "recurring"`.  
`curatorOptions` from distinct `sources.map((s) => s.curatorName)`.

- [ ] **Step 2: Form + list UI**

- Replace curator `<Input>` with `MusicFunnelCuratorCombobox`.
- Recurring / One-off control on create (and edit when appropriate).
- List badges: “One-off”; completed one-off (`!isActive`) shows “Completed” — do **not** use the recurring Deactivate/Activate control to re-enter bulk sync (promote out of scope). Hide Activate for one-offs.
- Active one-off (failed/incomplete): “Retry sync” button calling single-source sync.
- Optional: sort list by `curatorName` then `displayName`.

- [ ] **Step 3: Save + one-off sync**

On create with `kind === "one_off"`:

1. `upsertSource` with `isActive: true`, `kind: "one_off"`
2. `POST /api/music-funnel/sync` with `{ userId, sourceId }`
3. Success toast; failure toast (source remains for Retry)

Helper:

```typescript
async function syncSourceById(sourceId: Id<"musicFunnelSources">): Promise<void> {
	const response = await fetch("/api/music-funnel/sync", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ userId, sourceId }),
	});
	const result = (await response.json()) as {
		errors?: string[];
		message?: string;
		error?: string;
	};
	if (!response.ok) {
		throw new Error(
			result.errors?.[0] ?? result.message ?? result.error ?? "Sync failed",
		);
	}
}
```

- [ ] **Step 4: Manual smoke**

1. Recurring + curator Combobox create/select; bulk Sync works.
2. One-off syncs once, completes inactive; bulk/cron skip it.
3. Failed one-off stays retryable.
4. Two one-offs same curator share the name.

- [ ] **Step 5: Lint + typecheck + unit test**

```bash
pnpm check
pnpm typecheck
npx tsx --test src/lib/music-funnel-source-run-details.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/music-funnel/_components/music-funnel-sources-card.tsx
git commit -m "feat(music-funnel): one-off sources with curator combobox"
```

---

### Task 8: Mark ideas done (docs only)

**Files:**
- Modify: `docs/ideas/2026-07-10-expandable-timeline-sync-details.md`
- Modify: `docs/ideas/2026-07-10-one-off-playlist-sync-with-related-grouping.md`
- Optionally: `docs/ideas/2026-07-10-what-you-missed-reveals-sync-details.md` if still `open` — mark done noting banner shipped earlier and track detail is this plan

- [ ] **Step 1: Set `status: done` and link spec/plan** (mirror `docs/ideas/2026-07-10-repeats-highlight-new-since-last-visit.md`)

- [ ] **Step 2: Commit**

```bash
git add docs/ideas/2026-07-10-expandable-timeline-sync-details.md \
  docs/ideas/2026-07-10-one-off-playlist-sync-with-related-grouping.md
git commit -m "docs: mark music-funnel sync-detail and one-off ideas done"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Expand timeline → new encounters, repeat writes first, small art | 1, 3, 5 |
| Multi-open expands | 5 |
| Hide `newEncounters === 0` rows | 5 |
| `kind` recurring/one_off; existing → recurring | 2, 3 |
| One-off sync once; skip bulk/cron; deactivate on success | 4, 7 |
| Retry on failure | 7 |
| Curator Combobox search + create | 6, 7 |
| Missed banner unchanged | (no task) |
| Indexes for sourceRunId | 2 |
| Ideas marked done | 8 |

## Self-review notes

- Combobox task requires reading real exports from `combobox.tsx` — finish wiring in Task 6, no stub UI.
- `syncMusicFunnelSource` must fully mirror `syncMusicFunnel` finish/catch paths.
- Sort uses playlist-write ids only (A wins).
- Cron calls `syncMusicFunnel` — one-off skip covers cron.

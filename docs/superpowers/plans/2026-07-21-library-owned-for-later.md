# Library-Owned For Later Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move For Later state, browsing, and smart-playlist sourcing onto `albumLibraryItems` while retaining one-way legacy writes for rollback.

**Architecture:** `albumLibraryItems` owns a bounded nested `forLater` state and a materialized `isActiveForLater` index key. Spotify observation and explicit dismiss/restore events update this state through one pure transition helper; missing Spotify albums are intentionally ignored. The migration widens schema, dual-writes, backfills and verifies, then cuts reads and UI IDs over to library rows without dropping `forLaterAlbumItems`.

**Tech Stack:** Convex 1.42.3, TypeScript, `convex-helpers/server/stream`, React 19, Next.js 15, Node test runner through `tsx`

## Global Constraints

- For Later is append-only ingestion: albums missing from later Spotify syncs remain in the app.
- Remove the unused source-removal mutation/helper; never add absence reconciliation.
- `albumLibraryItems` is the sole browse/filter projection after cutover.
- Canonical For Later state is `forLater?: { firstSeenAt; lastSeenAt; playlistAddedAt?; dismissedAt? }`.
- `isActiveForLater` is derived atomically as `forLater !== undefined && forLater.dismissedAt === undefined`; clients never supply it.
- During migration, keep `appearsInForLater === isActiveForLater` for compatibility.
- Existing `markedAsSingle` rows migrate as dismissed; future single handling uses global `albumType`.
- Keep one-way writes to `forLaterAlbumItems` through the rollback window; never synchronize bidirectionally.
- Do not drop the legacy table, indexes, or facet tables in this plan.
- Do not add occasion filtering in this plan.
- Preserve filter-before-paginate behavior, `maximumRowsRead`, `pageStatus`, and `splitCursor`.
- Use cursor-based bounded backfills and explicit return validators.
- Follow repository style: classic named functions, type aliases, inline component props, tab indentation, no `any`.

---

## File Structure

- Create `convex/_utils/library-for-later-state.ts`: pure state transitions and legacy migration conversion.
- Create `convex/_utils/library-for-later-state.test.ts`: behavioral state and migration tests.
- Modify `convex/schema.ts`: optional migration fields and active index; later recommendation compatibility fields.
- Modify `convex/_utils/albumLibraryProjection.ts`: preserve canonical library-owned state during unrelated rebuilds.
- Modify `convex/forLaterAlbums.ts`: dual writes, backfill/verification, library browse/read APIs, album-keyed actions.
- Modify `convex/_utils/forLaterProjectionPredicate.ts`: retain only legacy compatibility; add a library-row predicate in a focused new helper.
- Create `convex/_utils/library-for-later-predicate.ts` and test: For Later filter semantics over library rows.
- Modify `convex/smartPlaylists.ts`: source and timestamps from library state.
- Modify `src/app/for-later-albums/_utils/types.ts` and For Later components/hooks: replace legacy item IDs with album/library IDs.
- Modify `src/app/api/for-later-albums/find-rym-links/route.ts`: accept album IDs and resolve the temporary legacy row server-side.
- Create `scripts/backfill-library-for-later.mjs` and add a package script.
- Add source-contract tests alongside each cutover.

---

### Task 1: Define library-owned For Later state

**Files:**
- Create: `convex/_utils/library-for-later-state.ts`
- Create: `convex/_utils/library-for-later-state.test.ts`
- Modify: `convex/schema.ts:539-632`

**Interfaces:**
- Produces `LibraryForLaterState`, `LibraryForLaterEvent`, `deriveIsActiveForLater`, `applyLibraryForLaterEvent`, and `legacyRowsToLibraryForLater`
- Later tasks must use these functions instead of computing membership inline

- [ ] **Step 1: Write failing state-transition tests**

Create `convex/_utils/library-for-later-state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	applyLibraryForLaterEvent,
	deriveIsActiveForLater,
	legacyRowsToLibraryForLater,
} from "./library-for-later-state";

test("first observation creates active append-only state", () => {
	assert.deepEqual(
		applyLibraryForLaterEvent(undefined, {
			type: "observed",
			seenAt: 100,
			playlistAddedAt: 90,
		}),
		{
			forLater: {
				firstSeenAt: 100,
				lastSeenAt: 100,
				playlistAddedAt: 90,
			},
			isActiveForLater: true,
		},
	);
});

test("reobservation updates last seen without restoring dismissal", () => {
	const existing = {
		firstSeenAt: 100,
		lastSeenAt: 110,
		playlistAddedAt: 90,
		dismissedAt: 105,
	};
	assert.deepEqual(
		applyLibraryForLaterEvent(existing, {
			type: "observed",
			seenAt: 120,
		}),
		{
			forLater: { ...existing, lastSeenAt: 120 },
			isActiveForLater: false,
		},
	);
});

test("dismiss and restore only change dismissal", () => {
	const active = { firstSeenAt: 100, lastSeenAt: 100 };
	const dismissed = applyLibraryForLaterEvent(active, {
		type: "dismissed",
		dismissedAt: 110,
	});
	assert.equal(dismissed.isActiveForLater, false);
	assert.equal(dismissed.forLater.dismissedAt, 110);

	const restored = applyLibraryForLaterEvent(dismissed.forLater, {
		type: "restored",
	});
	assert.deepEqual(restored, {
		forLater: active,
		isActiveForLater: true,
	});
});

test("derived activity only depends on existence and dismissal", () => {
	assert.equal(deriveIsActiveForLater(undefined), false);
	assert.equal(
		deriveIsActiveForLater({ firstSeenAt: 1, lastSeenAt: 2 }),
		true,
	);
	assert.equal(
		deriveIsActiveForLater({
			firstSeenAt: 1,
			lastSeenAt: 2,
			dismissedAt: 3,
		}),
		false,
	);
});

test("legacy marked-as-single migrates as dismissed", () => {
	const patch = legacyRowsToLibraryForLater([
		{
			firstSeenAt: 10,
			lastSeenAt: 20,
			playlistAddedAt: 5,
			removedFromForLater: false,
			markedAsSingle: true,
			updatedAt: 25,
			creationTime: 1,
		},
	]);
	assert.equal(patch.forLater.dismissedAt, 25);
	assert.equal(patch.isActiveForLater, false);
});

test("legacy duplicate reconciliation uses newest observation deterministically", () => {
	const patch = legacyRowsToLibraryForLater([
		{
			firstSeenAt: 20,
			lastSeenAt: 30,
			removedFromForLater: false,
			markedAsSingle: false,
			updatedAt: 31,
			creationTime: 2,
		},
		{
			firstSeenAt: 10,
			lastSeenAt: 40,
			playlistAddedAt: 8,
			removedFromForLater: true,
			markedAsSingle: false,
			updatedAt: 41,
			creationTime: 1,
		},
	]);
	assert.deepEqual(patch, {
		forLater: {
			firstSeenAt: 10,
			lastSeenAt: 40,
			playlistAddedAt: 8,
			dismissedAt: 41,
		},
		isActiveForLater: false,
	});
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec tsx --test convex/_utils/library-for-later-state.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure state helper**

Create `convex/_utils/library-for-later-state.ts`:

```ts
export type LibraryForLaterState = {
	firstSeenAt: number;
	lastSeenAt: number;
	playlistAddedAt?: number;
	dismissedAt?: number;
};

export type LibraryForLaterPatch = {
	forLater: LibraryForLaterState;
	isActiveForLater: boolean;
};

export type LibraryForLaterEvent =
	| { type: "observed"; seenAt: number; playlistAddedAt?: number }
	| { type: "dismissed"; dismissedAt: number }
	| { type: "restored" };

export type LegacyForLaterState = {
	firstSeenAt: number;
	lastSeenAt: number;
	playlistAddedAt?: number;
	removedFromForLater?: boolean;
	markedAsSingle?: boolean;
	updatedAt: number;
	creationTime: number;
};

export function deriveIsActiveForLater(
	forLater: LibraryForLaterState | undefined,
): boolean {
	return forLater !== undefined && forLater.dismissedAt === undefined;
}

export function applyLibraryForLaterEvent(
	existing: LibraryForLaterState | undefined,
	event: LibraryForLaterEvent,
): LibraryForLaterPatch {
	if (event.type === "observed") {
		const forLater: LibraryForLaterState = existing
			? {
					...existing,
					lastSeenAt: Math.max(existing.lastSeenAt, event.seenAt),
					playlistAddedAt:
						event.playlistAddedAt ?? existing.playlistAddedAt,
				}
			: {
					firstSeenAt: event.seenAt,
					lastSeenAt: event.seenAt,
					playlistAddedAt: event.playlistAddedAt,
				};
		return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
	}

	if (!existing) {
		throw new Error("Cannot change dismissal before an album enters For Later");
	}

	const forLater =
		event.type === "dismissed"
			? { ...existing, dismissedAt: event.dismissedAt }
			: { ...existing, dismissedAt: undefined };
	return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
}

export function legacyRowsToLibraryForLater(
	rows: LegacyForLaterState[],
): LibraryForLaterPatch {
	if (rows.length === 0) {
		throw new Error("At least one legacy For Later row is required");
	}
	const ordered = [...rows].sort(
		(a, b) =>
			b.lastSeenAt - a.lastSeenAt ||
			b.updatedAt - a.updatedAt ||
			a.creationTime - b.creationTime,
	);
	const firstSeenAt = Math.min(...rows.map((row) => row.firstSeenAt));
	const playlistAddedAt = rows
		.flatMap((row) =>
			row.playlistAddedAt === undefined ? [] : [row.playlistAddedAt],
		)
		.sort((a, b) => a - b)[0];
	const canonical = ordered[0]!;
	const shouldDismiss =
		rows.some((row) => row.removedFromForLater === true) ||
		rows.some((row) => row.markedAsSingle === true);
	const dismissedAt = shouldDismiss
		? Math.max(
				...rows
					.filter(
						(row) =>
							row.removedFromForLater === true ||
							row.markedAsSingle === true,
					)
					.map((row) => row.updatedAt),
			)
		: undefined;
	const forLater: LibraryForLaterState = {
		firstSeenAt,
		lastSeenAt: canonical.lastSeenAt,
		playlistAddedAt,
		dismissedAt,
	};
	return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
}
```

- [ ] **Step 4: Add optional schema fields and index**

In `albumLibraryItems`:

```ts
forLater: v.optional(
	v.object({
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		playlistAddedAt: v.optional(v.number()),
		dismissedAt: v.optional(v.number()),
	}),
),
isActiveForLater: v.optional(v.boolean()),
```

Add:

```ts
.index("by_userId_isActiveForLater_createdAt", [
	"userId",
	"isActiveForLater",
	"createdAt",
])
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm exec tsx --test convex/_utils/library-for-later-state.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/_utils/library-for-later-state.ts \
  convex/_utils/library-for-later-state.test.ts convex/schema.ts
git commit -m "feat(library): model For Later state on library rows"
```

---

### Task 2: Centralize dual writes and protect projection ownership

**Files:**
- Modify: `convex/_utils/albumLibraryProjection.ts`
- Modify: `convex/forLaterAlbums.ts`
- Delete: `convex/_utils/forLaterAlbums.ts` only if `findRemovedSpotifyAlbumIds` has no remaining callers; otherwise remove that export in place
- Create: `convex/forLaterAlbums.library-state-source.test.ts`

**Interfaces:**
- Consumes Task 1 state transitions
- Produces `patchLibraryForLaterState(ctx, { userId, albumId, event }): Promise<void>`
- Keeps legacy writes one-way for rollback

- [ ] **Step 1: Add failing source contracts**

Create `convex/forLaterAlbums.library-state-source.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

test("observation and dismissal paths patch library-owned state", () => {
	for (const exportName of [
		"upsertForLaterAlbumItem",
		"setForLaterAlbumMarkedAsSingle",
		"setForLaterAlbumRemovedFromForLater",
	]) {
		const start = source.indexOf(`export const ${exportName}`);
		const end = source.indexOf("\nexport const ", start + 1);
		const body = source.slice(start, end === -1 ? source.length : end);
		assert.match(body, /patchLibraryForLaterState/);
	}
});

test("source-removal mutation is deleted", () => {
	assert.doesNotMatch(source, /export const markForLaterAlbumsRemoved/);
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm exec tsx --test convex/forLaterAlbums.library-state-source.test.ts
```

Expected: FAIL because the new patch helper is absent and removal mutation exists.

- [ ] **Step 3: Implement atomic library-state patching**

In `convex/forLaterAlbums.ts`, add:

```ts
async function patchLibraryForLaterState(
	ctx: MutationCtx,
	args: {
		userId: string;
		albumId: Id<"spotifyAlbums">;
		event: LibraryForLaterEvent;
	},
): Promise<void> {
	await upsertAlbumLibraryProjection(ctx, {
		userId: args.userId,
		albumId: args.albumId,
	});
	const row = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();
	if (!row) {
		throw new Error("Album library row could not be created");
	}
	const patch = applyLibraryForLaterEvent(row.forLater, args.event);
	await ctx.db.patch(row._id, {
		...patch,
		appearsInForLater: patch.isActiveForLater,
	});
}
```

Call it after the existing legacy write:

```ts
await patchLibraryForLaterState(ctx, {
	userId: args.userId,
	albumId: args.albumId,
	event: {
		type: "observed",
		seenAt: args.seenAt,
		playlistAddedAt: args.playlistAddedAt,
	},
});
```

Dismiss:

```ts
event: { type: "dismissed", dismissedAt: now }
```

Restore:

```ts
event: { type: "restored" }
```

Map `setForLaterAlbumMarkedAsSingle(true)` to dismissed during the rollback window; `false` restores. Future UI removal occurs in Task 5.

- [ ] **Step 4: Prevent unrelated projection rebuilds from clobbering state**

In `upsertAlbumLibraryProjection`, preserve existing canonical fields when patching:

```ts
if (existing) {
	await ctx.db.patch(existing._id, {
		...projection,
		forLater: existing.forLater,
		isActiveForLater: existing.isActiveForLater,
		appearsInForLater:
			existing.isActiveForLater ?? projection.appearsInForLater,
	});
	return;
}
```

When inserting before observation/backfill, omit `forLater` and set both compatibility booleans false.

Remove the legacy membership lookup from `buildAlbumLibraryProjectionForAlbum` after every observation path uses `patchLibraryForLaterState`; the full projection builder must no longer own For Later state.

- [ ] **Step 5: Delete unused source-removal behavior**

Delete `markForLaterAlbumsRemoved` and unused `findRemovedSpotifyAlbumIds`. Confirm `src/lib/for-later-albums-sync.ts` continues to record `albumsMarkedRemoved: 0`.

- [ ] **Step 6: Run focused tests**

```bash
pnpm exec tsx --test \
  convex/_utils/library-for-later-state.test.ts \
  convex/forLaterAlbums.library-state-source.test.ts \
  convex/forLaterAlbums.library-membership-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/_utils/albumLibraryProjection.ts \
  convex/_utils/forLaterAlbums.ts \
  convex/forLaterAlbums.ts \
  convex/forLaterAlbums.library-state-source.test.ts
git commit -m "feat(for-later): dual-write library-owned state"
```

---

### Task 3: Backfill and verify library state

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Create: `scripts/backfill-library-for-later.mjs`
- Modify: `package.json`
- Create: `convex/forLaterAlbums.library-backfill-source.test.ts`

**Interfaces:**
- Produces `backfillLibraryForLaterBatch({ userId, cursor?, limit? })`
- Produces `verifyLibraryForLaterMigration({ userId })`

- [ ] **Step 1: Write failing backfill source tests**

Assert the batch:

- paginates legacy rows by user;
- groups every row for the same `albumId`;
- calls `legacyRowsToLibraryForLater`;
- find-or-creates a library row;
- writes `forLater`, `isActiveForLater`, and `appearsInForLater`;
- returns `processed`, `isDone`, and `continueCursor`.

Also assert verification returns:

```ts
{
	legacyActive: number;
	libraryActive: number;
	missingLibraryState: number;
	mismatchedActivity: number;
}
```

- [ ] **Step 2: Verify RED**

```bash
pnpm exec tsx --test convex/forLaterAlbums.library-backfill-source.test.ts
```

Expected: FAIL because exports are absent.

- [ ] **Step 3: Implement bounded backfill**

Use a limit default of 25 and maximum 50. Paginate `forLaterAlbumItems.by_userId`, but before writing each album, query all rows by `(userId, albumId)` so duplicate reconciliation is complete even across page boundaries.

For each unique album ID in the page:

```ts
const patch = legacyRowsToLibraryForLater(
	legacyRows.map((row) => ({
		firstSeenAt: row.firstSeenAt,
		lastSeenAt: row.lastSeenAt,
		playlistAddedAt: row.playlistAddedAt,
		removedFromForLater: row.removedFromForLater,
		markedAsSingle: row.markedAsSingle,
		updatedAt: row.updatedAt,
		creationTime: row._creationTime,
	})),
);
await upsertAlbumLibraryProjection(ctx, { userId, albumId });
await ctx.db.patch(libraryRow._id, {
	...patch,
	appearsInForLater: patch.isActiveForLater,
});
```

Deduplicate album IDs within each batch.

- [ ] **Step 4: Implement verification query**

Legacy compatibility activity for verification is:

```ts
row.isActive === true &&
row.markedAsSingle !== true &&
row.removedFromForLater !== true
```

Count migrated library rows and compare their stored boolean with `deriveIsActiveForLater(row.forLater)`. Report mismatches; do not mutate in verification.

- [ ] **Step 5: Add the looping script**

Create `scripts/backfill-library-for-later.mjs` using `ConvexHttpClient`, `CONVEX_URL`, and the existing script conventions. Loop the cursor until `isDone`, then call verification and exit nonzero if counts or activity differ.

Add:

```json
"backfill:library-for-later": "node scripts/backfill-library-for-later.mjs"
```

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm exec tsx --test \
  convex/_utils/library-for-later-state.test.ts \
  convex/forLaterAlbums.library-backfill-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/forLaterAlbums.ts \
  convex/forLaterAlbums.library-backfill-source.test.ts \
  scripts/backfill-library-for-later.mjs package.json
git commit -m "feat(library): backfill canonical For Later state"
```

---

### Task 4: Cut the For Later list over to library rows

**Files:**
- Create: `convex/_utils/library-for-later-predicate.ts`
- Create: `convex/_utils/library-for-later-predicate.test.ts`
- Modify: `convex/forLaterAlbums.ts`
- Modify: `convex/schema.ts` to add `totalDurationMs: v.optional(v.number())` to library rows
- Modify: `convex/_utils/albumLibraryProjection.ts`
- Modify: `convex/forLaterAlbums.pagination-source.test.ts`

**Interfaces:**
- Produces `libraryRowMatchesForLaterFilters(row, filters): boolean`
- `listForLaterAlbumRows` keeps its public pagination result shape

- [ ] **Step 1: Write predicate tests**

Cover search, inclusive years, duration, listened, RYM status, genres including ancestors already projected, descriptors, combined Any/All, and dismissal. Assert that `isActiveForLater !== true` always fails.

- [ ] **Step 2: Verify RED**

```bash
pnpm exec tsx --test convex/_utils/library-for-later-predicate.test.ts
```

- [ ] **Step 3: Add duration to library projection**

Add optional `totalDurationMs` to the schema and populate it from `spotifyAlbums.totalDurationMs` in `buildAlbumLibraryProjectionForAlbum`.

- [ ] **Step 4: Implement the library predicate**

Reuse:

```ts
normalizeForLaterFilters
releaseYearMatchesForLaterFilter
durationMsMatchesForLaterFilter
taxonomyKeysPassAgainstSet
```

Build genre keys from `primaryGenres` and `secondaryGenres`; descriptors from `descriptors`. Use `row.searchText`, `row.releaseYear`, `row.totalDurationMs`, `row.filterHasListened`, `row.rymStatus`, and `row.rymNotOnSite`.

- [ ] **Step 5: Rewrite `loadForLaterAlbumRows`**

Start from:

```ts
stream(ctx.db, schema)
	.query("albumLibraryItems")
	.withIndex("by_userId_isActiveForLater_createdAt", (q) =>
		q.eq("userId", args.userId).eq("isActiveForLater", true),
	)
	.order("desc")
	.filterWith(async (row) =>
		libraryRowMatchesForLaterFilters(row, normalizeForLaterFilters(args.filters)),
	)
```

Map library rows to the existing display row shape without reading `forLaterAlbumItems`. Preserve split metadata.

Use `forLater.lastSeenAt`, `playlistAddedAt`, and `firstSeenAt` for sort fields.

- [ ] **Step 6: Strengthen source contract**

Update `forLaterAlbums.pagination-source.test.ts` to require:

- `albumLibraryItems`;
- `by_userId_isActiveForLater_createdAt`;
- `libraryRowMatchesForLaterFilters`;
- no `forLaterAlbumItems` inside `loadForLaterAlbumRows`;
- filter before paginate;
- split metadata propagation.

- [ ] **Step 7: Run tests**

```bash
pnpm exec tsx --test \
  convex/_utils/library-for-later-predicate.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts \
  convex/_utils/albumLibraryProjection.ts \
  convex/_utils/library-for-later-predicate.ts \
  convex/_utils/library-for-later-predicate.test.ts \
  convex/forLaterAlbums.ts \
  convex/forLaterAlbums.pagination-source.test.ts
git commit -m "refactor(for-later): browse canonical library rows"
```

---

### Task 5: Move For Later actions and UI identity to albums

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Modify: `src/app/for-later-albums/_utils/types.ts`
- Modify: `src/app/for-later-albums/_components/for-later-row.tsx`
- Modify: `src/app/for-later-albums/_components/for-later-rym-associate-drawer.tsx`
- Modify: relevant For Later hooks under `src/app/for-later-albums/_utils/`
- Modify: `src/app/for-later-albums/page.tsx`
- Modify: `src/app/api/for-later-albums/find-rym-links/route.ts`

**Interfaces:**
- Public actions accept `{ userId, albumId }`
- Legacy rows are resolved server-side only for temporary rollback writes

- [ ] **Step 1: Add source tests requiring album-keyed actions**

For dismiss/restore, RYM not-on-site, RYM association, discovery queue, and find-RYM-links, assert public args use `albumId` / `albumIds` and do not expose `forLaterAlbumItems` IDs.

- [ ] **Step 2: Verify RED**

Run the new source test and expect failures on `itemId` / `albumItemIds`.

- [ ] **Step 3: Add a temporary legacy resolver**

```ts
async function requireLegacyForLaterItemByAlbum(
	ctx: QueryCtx | MutationCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<Doc<"forLaterAlbumItems">> {
	const item = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();
	if (!item) throw new Error("For Later album not found");
	return item;
}
```

Public APIs use album identity; the resolver mirrors legacy writes internally.

- [ ] **Step 4: Replace row identity**

Change the display contract from:

```ts
albumItemId: Id<"forLaterAlbumItems">
```

to:

```ts
libraryItemId: Id<"albumLibraryItems">
albumId: Id<"spotifyAlbums">
```

Update optimistic overlays to key by `albumId`.

- [ ] **Step 5: Remove the marked-as-single UI action**

The migration backfill preserved existing hidden rows as dismissals. Future single behavior uses `albumType`; remove the For Later-specific mutation control from the row UI. Keep the legacy mutation only if rollback code still calls it internally.

- [ ] **Step 6: Update RYM routes and drawers**

Pass album IDs. Resolve the temporary legacy row on the server where legacy discovery state is still stored.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
pnpm exec tsx --test \
  convex/forLaterAlbums.library-state-source.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Stage only the listed Convex, API route, and For Later UI files:

```bash
git commit -m "refactor(for-later): key actions by canonical album"
```

---

### Task 6: Cut supporting reads and smart playlists over

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Modify: `convex/smartPlaylists.ts`
- Modify: `convex/schema.ts` for new recommendation album IDs while preserving legacy field compatibility
- Modify: relevant recommendation tests
- Modify: `convex/smartPlaylists.for-later-genre-source.test.ts`

**Interfaces:**
- Summary/options/counts/recommendations source library rows
- New recommendation saves use `albumIds: Id<"spotifyAlbums">[]`
- Existing `albumItemIds` remains optional for historical records

- [ ] **Step 1: Write failing source and behavioral contracts**

Require summary, duration options, and recommendation candidates to query active library rows. Require smart playlists to use `isActiveForLater` and `row.forLater` timestamps with no legacy join.

- [ ] **Step 2: Verify RED**

Run focused recommendation and smart-playlist tests; expect source-contract failures.

- [ ] **Step 3: Migrate supporting reads**

Use `albumLibraryItems.by_userId_isActiveForLater_createdAt` for current source candidates. Reuse `libraryRowMatchesForLaterFilters` for recommendation filters. Option/count queries union or count projected values from active library rows.

- [ ] **Step 4: Preserve recommendation history**

Widen recommendation schema:

```ts
albumIds: v.optional(v.array(v.id("spotifyAlbums"))),
albumItemIds: v.optional(v.array(v.id("forLaterAlbumItems"))),
```

New writes populate `albumIds`. Reads prefer `albumIds`, falling back to resolving historical `albumItemIds`.

- [ ] **Step 5: Cut smart playlists over**

Use:

```ts
.withIndex("by_userId_isActiveForLater_createdAt", (q) =>
	q.eq("userId", args.userId).eq("isActiveForLater", true),
)
```

For added-window filtering and sorting:

```ts
const sortAt =
	item.forLater?.playlistAddedAt ??
	item.forLater?.firstSeenAt ??
	item.createdAt;
```

Remove the active legacy-item timestamp map.

- [ ] **Step 6: Run focused suites**

```bash
pnpm exec tsx --test \
  convex/_utils/library-for-later-predicate.test.ts \
  convex/smartPlaylists.for-later-genre-source.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/forLaterAlbums.ts convex/smartPlaylists.ts \
  convex/smartPlaylists.for-later-genre-source.test.ts
git commit -m "refactor(for-later): cut supporting reads to library"
```

---

### Task 7: Validate migration and prepare production cutover

**Files:**
- Modify if generated and attributable: `convex/_generated/api.d.ts`
- Verify all files changed by Tasks 1–6

**Interfaces:**
- No new product interface
- Produces verified dual-write/backfill/read-cutover release

- [ ] **Step 1: Run Convex development validation**

```bash
npx convex dev --once
```

Expected: schema, validators, indexes, and generated types succeed against development.

- [ ] **Step 2: Run focused tests**

```bash
pnpm exec tsx --test \
  convex/_utils/library-for-later-state.test.ts \
  convex/_utils/library-for-later-predicate.test.ts \
  convex/forLaterAlbums.library-state-source.test.ts \
  convex/forLaterAlbums.library-backfill-source.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/smartPlaylists.for-later-genre-source.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository checks**

```bash
pnpm typecheck
pnpm check
```

Expected: typecheck passes. For Biome, distinguish pre-existing repository diagnostics from introduced diagnostics and fix every introduced issue.

- [ ] **Step 4: Run development backfill and verification**

```bash
CONVEX_URL="$NEXT_PUBLIC_CONVEX_URL" pnpm backfill:library-for-later
```

Expected: script reaches `isDone`, then reports:

```text
missingLibraryState=0
mismatchedActivity=0
legacyActive=<n>
libraryActive=<n>
```

The active counts match because marked-as-single rows were migrated as dismissed.

- [ ] **Step 5: Manual development smoke**

Verify:

1. For Later list count and visible albums match before cutover.
2. Dismiss hides an album; restore shows it.
3. Syncing an already dismissed album does not restore it.
4. An album removed from Spotify remains in the app.
5. Year, genre, descriptor, duration, listened, RYM, and search filters retain matching-item pagination.
6. Recommendations and duration counts match visible library scope.
7. Smart-playlist For Later preview preserves added-window ordering.

- [ ] **Step 6: Review generated files and commit attributable changes**

Do not stage the pre-existing mixed `convex/_generated/api.d.ts` blindly. Isolate only generated changes caused by this plan.

```bash
git commit -m "chore(convex): refresh library For Later types"
```

- [ ] **Step 7: Production rollout order**

After review:

1. Deploy widened schema and dual writes.
2. Run production backfill.
3. Require verification parity.
4. Deploy read cutover.
5. Keep legacy writes during rollback observation.

Do not make fields required or drop legacy storage in this plan.

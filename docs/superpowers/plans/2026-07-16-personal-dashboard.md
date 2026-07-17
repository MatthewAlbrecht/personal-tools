# Personal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace authenticated `/` with a personal dashboard: activity timeline, recent albums with rating, compact previews, recommend button, and collection stats with sparklines.

**Architecture:** Append-only `activityEvents` written from feature success paths via `publishActivityEvent` (never fails the source). Dashboard reads paginated events plus a server visit cursor for “new” badges. Supporting modules reuse existing Convex queries. Daily `dashboardStatSnapshots` power sparkline trends; totals are live counts.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`, existing For Later recommendation drawer + album rating drawer

**Spec:** `docs/superpowers/specs/2026-07-16-personal-dashboard-design.md`

## Global Constraints

- No historical timeline backfill — empty launch is fine
- Store `feature` keys on events, never `href` URLs; client maps feature → route
- Timeline click deep-links only (no expand/drawer for events)
- Activity publish failures must not fail source syncs/creates (try/catch + `console.error`)
- No separate “Action these things” section
- Recommend opens existing For Later recommendation flow — no new algorithm
- Classic function declarations; `type` aliases; kebab-case filenames
- Env via `~/env.js` only if new env vars are required (prefer none)

### Metric definitions (pinned)

| Key | Meaning |
|-----|---------|
| `albumsSaved` | Count of `albumLibraryItems` for `userId` |
| `forLater` | Count of `forLaterAlbumItems` where `userId` and `isActive === true` |
| `folioBooks` | Count of `folioSocietyReleases` where `isActive === true` (global) |
| `funnelTracks` | Count of `musicFunnelPlaylistWrites` where `userId` and `kind === "main"` |
| `repeatTracks` | Count of `musicFunnelPlaylistWrites` where `userId` and `kind === "repeat"` |
| `smartPlaylists` | Count of `smartPlaylists` for `userId` |

### Event types + features (pinned)

| `type` | `feature` | Publish site |
|--------|-----------|--------------|
| `for_later_sync` | `for_later` | `saveForLaterSyncRun` when `status === "success"` |
| `listening_sync` | `albums` | `saveSyncRun` when `status === "success"` |
| `folio_scrape` | `folio` | End of `syncReleases` when success (per Spotify connection userId) |
| `music_funnel_sync` | `music_funnel` | `finishRun` when status is `success` or `partial` |
| `smart_playlist_created` | `smart_playlists` | `insertRecipe` after insert |
| `rym_matches` | `rym` | After `matchRymScrapeToSpotifyAlbums` when `linkedAlbums > 0` (upsert scrape path; not noisy backfill unless linkedAlbums > 0) |

### Feature → route map (pinned)

| `feature` | Route |
|-----------|-------|
| `for_later` | `/for-later-albums` |
| `albums` | `/albums/history` |
| `folio` | `/folio-society` |
| `music_funnel` | `/music-funnel` |
| `smart_playlists` | `/smart-playlists` |
| `rym` | `/albums/all` |

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | `activityEvents`, `dashboardVisits`, `dashboardStatSnapshots` |
| Create | `convex/_utils/activityEvents.ts` | Types, validators helpers, `publishActivityEvent` |
| Create | `convex/_utils/activityEvents.test.ts` | Pure helper / type tests |
| Create | `convex/dashboard.ts` | Timeline query, visit mutation, stats query, snapshot ensure |
| Create | `convex/dashboard.publish-source.test.ts` | Source guards that publish sites call helper |
| Modify | `convex/forLaterAlbums.ts` | Publish on successful sync save |
| Modify | `convex/spotify.ts` | Publish on successful listen sync; optional recent-albums helper query |
| Modify | `convex/musicFunnel.ts` | Publish on `finishRun` |
| Modify | `convex/smartPlaylists.ts` | Publish on `insertRecipe` |
| Modify | `convex/rateYourMusicScrapes.ts` | Publish when scrape match links albums |
| Modify | `convex/folioSocietyReleases.ts` | Publish Folio scrape event(s) |
| Create | `src/app/_utils/dashboard-feature-routes.ts` | Feature → href map |
| Create | `src/app/_utils/dashboard-feature-routes.test.ts` | Map unit tests |
| Create | `src/app/_components/personal-dashboard.tsx` | Authenticated dashboard shell |
| Create | `src/app/_components/dashboard-timeline.tsx` | Timeline list + new badges |
| Create | `src/app/_components/dashboard-recent-albums.tsx` | Recent albums + rating |
| Create | `src/app/_components/dashboard-stat-cards.tsx` | Totals + sparklines |
| Create | `src/app/_components/dashboard-compact-modules.tsx` | Recommend / For Later / tracks / Folio |
| Modify | `src/app/page.tsx` | Authed → dashboard; unauthed → existing landing |
| Modify | `docs/ideas/2026-07-10-personal-dashboard-with-cross-feature-modules.md` | `status: planned` |

---

### Task 1: Schema + publish helper

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/_utils/activityEvents.ts`
- Create: `convex/_utils/activityEvents.test.ts`

**Interfaces:**
- Consumes: `MutationCtx`, `Id` from generated types
- Produces:
  - `ActivityFeature`, `ActivityEventType` type aliases
  - `publishActivityEvent(ctx, args): Promise<Id<"activityEvents"> | null>`
  - Schema tables listed below

- [ ] **Step 1: Write the failing unit test**

```typescript
// convex/_utils/activityEvents.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	ACTIVITY_FEATURES,
	ACTIVITY_EVENT_TYPES,
	buildActivityEventDoc,
} from "./activityEvents";

test("buildActivityEventDoc maps for_later_sync to for_later feature", () => {
	const doc = buildActivityEventDoc({
		userId: "user1",
		type: "for_later_sync",
		occurredAt: 1000,
		title: "For Later sync",
		counts: { added: 7, removed: 1 },
	});
	assert.equal(doc.feature, "for_later");
	assert.equal(doc.type, "for_later_sync");
	assert.deepEqual(doc.counts, { added: 7, removed: 1 });
});

test("activity feature and type catalogs are non-empty", () => {
	assert.ok(ACTIVITY_FEATURES.length >= 6);
	assert.ok(ACTIVITY_EVENT_TYPES.length >= 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test convex/_utils/activityEvents.test.ts`  
Expected: FAIL — module missing

- [ ] **Step 3: Add schema tables**

In `convex/schema.ts`, add:

```typescript
activityEvents: defineTable({
	userId: v.string(),
	type: v.union(
		v.literal("for_later_sync"),
		v.literal("listening_sync"),
		v.literal("folio_scrape"),
		v.literal("music_funnel_sync"),
		v.literal("smart_playlist_created"),
		v.literal("rym_matches"),
	),
	feature: v.union(
		v.literal("for_later"),
		v.literal("albums"),
		v.literal("folio"),
		v.literal("music_funnel"),
		v.literal("smart_playlists"),
		v.literal("rym"),
	),
	occurredAt: v.number(),
	title: v.string(),
	summary: v.optional(v.string()),
	counts: v.optional(v.record(v.string(), v.number())),
	metadata: v.optional(v.any()),
}).index("by_userId_occurredAt", ["userId", "occurredAt"]),

dashboardVisits: defineTable({
	userId: v.string(),
	lastVisitedAt: v.number(),
	updatedAt: v.number(),
}).index("by_userId", ["userId"]),

dashboardStatSnapshots: defineTable({
	userId: v.string(),
	dateKey: v.string(), // "YYYY-MM-DD" UTC
	albumsSaved: v.number(),
	forLater: v.number(),
	folioBooks: v.number(),
	funnelTracks: v.number(),
	repeatTracks: v.number(),
	smartPlaylists: v.number(),
	capturedAt: v.number(),
})
	.index("by_userId_dateKey", ["userId", "dateKey"])
	.index("by_userId_capturedAt", ["userId", "capturedAt"]),
```

- [ ] **Step 4: Implement `convex/_utils/activityEvents.ts`**

```typescript
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ACTIVITY_FEATURES = [
	"for_later",
	"albums",
	"folio",
	"music_funnel",
	"smart_playlists",
	"rym",
] as const;

export type ActivityFeature = (typeof ACTIVITY_FEATURES)[number];

export const ACTIVITY_EVENT_TYPES = [
	"for_later_sync",
	"listening_sync",
	"folio_scrape",
	"music_funnel_sync",
	"smart_playlist_created",
	"rym_matches",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

const FEATURE_BY_TYPE: Record<ActivityEventType, ActivityFeature> = {
	for_later_sync: "for_later",
	listening_sync: "albums",
	folio_scrape: "folio",
	music_funnel_sync: "music_funnel",
	smart_playlist_created: "smart_playlists",
	rym_matches: "rym",
};

export function buildActivityEventDoc(args: {
	userId: string;
	type: ActivityEventType;
	occurredAt: number;
	title: string;
	summary?: string;
	counts?: Record<string, number>;
	metadata?: unknown;
}): {
	userId: string;
	type: ActivityEventType;
	feature: ActivityFeature;
	occurredAt: number;
	title: string;
	summary?: string;
	counts?: Record<string, number>;
	metadata?: unknown;
} {
	return {
		userId: args.userId,
		type: args.type,
		feature: FEATURE_BY_TYPE[args.type],
		occurredAt: args.occurredAt,
		title: args.title,
		...(args.summary !== undefined ? { summary: args.summary } : {}),
		...(args.counts !== undefined ? { counts: args.counts } : {}),
		...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
	};
}

export async function publishActivityEvent(
	ctx: MutationCtx,
	args: {
		userId: string;
		type: ActivityEventType;
		occurredAt: number;
		title: string;
		summary?: string;
		counts?: Record<string, number>;
		metadata?: unknown;
	},
): Promise<Id<"activityEvents"> | null> {
	try {
		return await ctx.db.insert(
			"activityEvents",
			buildActivityEventDoc(args) as never,
		);
	} catch (error) {
		console.error("Failed to publish activity event", {
			type: args.type,
			userId: args.userId,
			error,
		});
		return null;
	}
}
```

(Cast/`as never` only if schema typing needs it after insert shape is exact — prefer matching schema validators without `any` metadata if Biome allows `v.optional(v.any())` already used in schema.)

- [ ] **Step 5: Run tests**

Run: `pnpm exec tsx --test convex/_utils/activityEvents.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/_utils/activityEvents.ts convex/_utils/activityEvents.test.ts
git commit -m "feat: add activityEvents schema and publish helper"
```

---

### Task 2: Wire publishers into feature success paths

**Files:**
- Modify: `convex/forLaterAlbums.ts` (`saveForLaterSyncRun`)
- Modify: `convex/spotify.ts` (`saveSyncRun`)
- Modify: `convex/musicFunnel.ts` (`finishRun`)
- Modify: `convex/smartPlaylists.ts` (`insertRecipe`)
- Modify: `convex/rateYourMusicScrapes.ts` (scrape upsert path after match)
- Modify: `convex/folioSocietyReleases.ts` (`syncReleases` success path)
- Create: `convex/dashboard.publish-source.test.ts`

**Interfaces:**
- Consumes: `publishActivityEvent` from `convex/_utils/activityEvents.ts`
- Produces: events written on success paths listed in Global Constraints

- [ ] **Step 1: Write failing source tests**

```typescript
// convex/dashboard.publish-source.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function assertPublishes(sourcePath: string, marker: string): void {
	const source = readFileSync(sourcePath, "utf8");
	assert.match(source, /publishActivityEvent/);
	assert.match(source, new RegExp(marker));
}

test("for later sync publishes activity", () => {
	assertPublishes("convex/forLaterAlbums.ts", "for_later_sync");
});

test("listening sync publishes activity", () => {
	assertPublishes("convex/spotify.ts", "listening_sync");
});

test("music funnel finishRun publishes activity", () => {
	assertPublishes("convex/musicFunnel.ts", "music_funnel_sync");
});

test("smart playlist create publishes activity", () => {
	assertPublishes("convex/smartPlaylists.ts", "smart_playlist_created");
});

test("rym scrape match publishes activity", () => {
	assertPublishes("convex/rateYourMusicScrapes.ts", "rym_matches");
});

test("folio sync publishes activity", () => {
	assertPublishes("convex/folioSocietyReleases.ts", "folio_scrape");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec tsx --test convex/dashboard.publish-source.test.ts`  
Expected: FAIL

- [ ] **Step 3: Wire For Later**

In `saveForLaterSyncRun` after insert, when `args.status === "success"`:

```typescript
await publishActivityEvent(ctx, {
	userId: args.userId,
	type: "for_later_sync",
	occurredAt: args.completedAt,
	title: "For Later sync",
	summary: `${args.newAlbumsAdded} added, ${args.albumsMarkedRemoved} removed`,
	counts: {
		added: args.newAlbumsAdded,
		removed: args.albumsMarkedRemoved,
		seen: args.existingAlbumsSeen,
		rymMatches: args.rymMatchesCreated,
	},
});
```

- [ ] **Step 4: Wire Spotify listen sync**

In `saveSyncRun` after insert, when `args.status === "success"`:

```typescript
await publishActivityEvent(ctx, {
	userId: args.userId,
	type: "listening_sync",
	occurredAt: args.completedAt,
	title: "Listening sync",
	summary: `${args.albumListensRecorded} album listens, ${args.newTracksAdded} new tracks`,
	counts: {
		albumListens: args.albumListensRecorded,
		newTracks: args.newTracksAdded,
		newAlbums: args.newAlbumsDiscovered,
	},
});
```

- [ ] **Step 5: Wire Music Funnel `finishRun`**

Load the run for `userId` before patch. After patch, if `args.status === "success" || args.status === "partial"`:

```typescript
await publishActivityEvent(ctx, {
	userId: run.userId,
	type: "music_funnel_sync",
	occurredAt: args.completedAt,
	title: "Music Funnel sync",
	summary: `${args.newTracksAddedToMain} new, ${args.repeatTracksAdded} repeats`,
	counts: {
		newEncounters: args.newEncounters,
		newMain: args.newTracksAddedToMain,
		repeats: args.repeatTracksAdded,
	},
	metadata: { runId: args.runId, status: args.status },
});
```

- [ ] **Step 6: Wire smart playlist create**

In `insertRecipe` after insert:

```typescript
await publishActivityEvent(ctx, {
	userId: args.userId,
	type: "smart_playlist_created",
	occurredAt: now,
	title: "Smart playlist created",
	summary: args.name.trim(),
	metadata: { recipeId: id, name: args.name.trim() },
});
```

- [ ] **Step 7: Wire RYM scrape match**

Where `upsert`/`create` scrape calls `matchRymScrapeToSpotifyAlbums`, capture summary. If `summary.linkedAlbums > 0`, publish for each `spotifyConnections` userId (personal app; Folio/RYM are global):

```typescript
const connections = await ctx.db.query("spotifyConnections").collect();
for (const connection of connections) {
	await publishActivityEvent(ctx, {
		userId: connection.userId,
		type: "rym_matches",
		occurredAt: now,
		title: "RYM matches",
		summary: `Linked ${summary.linkedAlbums} album${summary.linkedAlbums === 1 ? "" : "s"}`,
		counts: { linkedAlbums: summary.linkedAlbums },
		metadata: { scrapeId },
	});
}
```

Do **not** publish from the backfill mutation unless `linkedAlbums > 0` for that scrape (same guard). Prefer publishing only from the primary scrape write path to avoid backfill spam; backfill may skip publish entirely if source test only requires the scrape upsert file to contain `rym_matches`.

- [ ] **Step 8: Wire Folio**

After successful `syncReleases` result is built, if `result.newReleasesCount > 0` (or always on success with counts), call an internal mutation `publishFolioScrapeActivity` that:

1. Loads all `spotifyConnections`
2. Publishes `folio_scrape` for each `userId` with `counts: { newReleases: result.newReleasesCount, synced: result.syncedCount }`

Actions cannot insert directly if preferred pattern is mutation — use `ctx.runMutation(internal.dashboard.publishFolioScrapeActivity, { ... })` defined in Task 3, ** temporarily inline via `api` mutation in `folioSocietyReleases.ts`. Prefer adding the internal mutation in Task 3 first if order conflicts; otherwise add a thin `internalMutation` in `folioSocietyReleases.ts` for this task.

- [ ] **Step 9: Re-run source tests + typecheck**

Run:
```bash
pnpm exec tsx --test convex/dashboard.publish-source.test.ts
pnpm typecheck
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add convex/forLaterAlbums.ts convex/spotify.ts convex/musicFunnel.ts \
  convex/smartPlaylists.ts convex/rateYourMusicScrapes.ts \
  convex/folioSocietyReleases.ts convex/dashboard.publish-source.test.ts \
  convex/dashboard.ts
git commit -m "feat: publish activity events from feature success paths"
```

---

### Task 3: Dashboard Convex API (timeline, visit, stats)

**Files:**
- Create: `convex/dashboard.ts`
- Create: `convex/_utils/dashboardStats.ts` (pure dateKey + sparkline series helpers)
- Create: `convex/_utils/dashboardStats.test.ts`

**Interfaces:**
- Produces:
  - `listActivityEvents` paginated query
  - `getDashboardVisitCursor` query → `{ previousVisitedAt: number | null }`
  - `recordDashboardVisit` mutation
  - `getDashboardStats` query → totals + sparkline points
  - `ensureTodayStatSnapshot` mutation (called from client on load or from get path via scheduler — prefer explicit client call after mount)
  - `publishFolioScrapeActivity` internalMutation (if not done in Task 2)

- [ ] **Step 1: Failing tests for date helpers**

```typescript
// convex/_utils/dashboardStats.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { utcDateKey, buildSparklineSeries } from "./dashboardStats";

test("utcDateKey formats YYYY-MM-DD", () => {
	assert.equal(utcDateKey(Date.UTC(2026, 6, 16)), "2026-07-16");
});

test("buildSparklineSeries fills missing days with last known or zero", () => {
	const series = buildSparklineSeries({
		endDateKey: "2026-07-16",
		days: 3,
		snapshots: [
			{ dateKey: "2026-07-14", value: 10 },
			{ dateKey: "2026-07-16", value: 12 },
		],
	});
	assert.deepEqual(
		series.map((p) => p.value),
		[10, 10, 12],
	);
});
```

- [ ] **Step 2: Implement helpers + dashboard API**

`utcDateKey(ms)`, `buildSparklineSeries`, and `computeLiveDashboardTotals(ctx, userId)` that counts per metric definitions.

`listActivityEvents`:

```typescript
export const listActivityEvents = query({
	args: {
		userId: v.string(),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("activityEvents")
			.withIndex("by_userId_occurredAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
});
```

Visit APIs:

```typescript
export const getDashboardVisitCursor = query({
	args: { userId: v.string() },
	returns: v.object({ previousVisitedAt: v.union(v.number(), v.null()) }),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("dashboardVisits")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.unique();
		return { previousVisitedAt: row?.lastVisitedAt ?? null };
	},
});

export const recordDashboardVisit = mutation({
	args: { userId: v.string(), visitedAt: v.number() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("dashboardVisits")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				lastVisitedAt: args.visitedAt,
				updatedAt: args.visitedAt,
			});
		} else {
			await ctx.db.insert("dashboardVisits", {
				userId: args.userId,
				lastVisitedAt: args.visitedAt,
				updatedAt: args.visitedAt,
			});
		}
		return null;
	},
});
```

Stats: `ensureTodayStatSnapshot` writes/patches today’s row from live totals. `getDashboardStats` returns `{ totals, series90: { albumsSaved: [...], ... } }` using last 90 snapshots (carry-forward).

Also add thin query wrappers if needed:

```typescript
export const listRecentUserAlbums = query({
	args: { userId: v.string(), limit: v.optional(v.number()) },
	// reuse getUserAlbums pattern: by_userId_lastListenedAt desc, take limit (default 8)
});
```

Or call existing `api.spotify.getUserAlbums` from the client with a client-side slice — prefer existing to avoid duplication unless return shape is huge.

- [ ] **Step 3: Run tests**

Run: `pnpm exec tsx --test convex/_utils/dashboardStats.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/dashboard.ts convex/_utils/dashboardStats.ts convex/_utils/dashboardStats.test.ts
git commit -m "feat: add dashboard timeline visit and stats APIs"
```

---

### Task 4: Feature routes + authenticated `/` shell

**Files:**
- Create: `src/app/_utils/dashboard-feature-routes.ts`
- Create: `src/app/_utils/dashboard-feature-routes.test.ts`
- Create: `src/app/_components/personal-dashboard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `getDashboardFeatureHref(feature: ActivityFeature): string`
- Produces: `PersonalDashboard` client component

- [ ] **Step 1: Failing route map test**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardFeatureHref } from "./dashboard-feature-routes";

test("maps features to routes", () => {
	assert.equal(getDashboardFeatureHref("for_later"), "/for-later-albums");
	assert.equal(getDashboardFeatureHref("albums"), "/albums/history");
	assert.equal(getDashboardFeatureHref("folio"), "/folio-society");
	assert.equal(getDashboardFeatureHref("music_funnel"), "/music-funnel");
	assert.equal(getDashboardFeatureHref("smart_playlists"), "/smart-playlists");
	assert.equal(getDashboardFeatureHref("rym"), "/albums/all");
});
```

- [ ] **Step 2: Implement map + `PersonalDashboard` shell**

`personal-dashboard.tsx`:
- `useSpotifyAuth()` for `userId`
- If loading → spinner; if no userId → `LoginPrompt`
- Layout sections in order: timeline, recent albums, compact modules, stats
- On mount when `userId` ready: read visit cursor + timeline; then `recordDashboardVisit({ userId, visitedAt: Date.now() })` once (guard with `useRef`)
- Call `ensureTodayStatSnapshot` once on mount

- [ ] **Step 3: Update `page.tsx`**

Keep unauthenticated landing as today. When `session` cookie present, render `<PersonalDashboard />` (client boundary) instead of the link grid. Public Rob’s Top 50 link can remain in the unauth landing only, or a small link in the dashboard header — prefer not cluttering the dashboard; site header already has nav.

Example pattern:

```tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { PersonalDashboard } from "./_components/personal-dashboard";

export default async function Home() {
	const cookieStore = await cookies();
	const isAuthed = cookieStore.get("session")?.value != null;
	if (isAuthed) {
		return <PersonalDashboard />;
	}
	// existing unauth landing JSX
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm exec tsx --test src/app/_utils/dashboard-feature-routes.test.ts
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/app/_utils/dashboard-feature-routes.ts \
  src/app/_utils/dashboard-feature-routes.test.ts \
  src/app/_components/personal-dashboard.tsx \
  src/app/page.tsx
git commit -m "feat: render personal dashboard on authenticated home"
```

---

### Task 5: Timeline UI

**Files:**
- Create: `src/app/_components/dashboard-timeline.tsx`
- Modify: `src/app/_components/personal-dashboard.tsx`

**Interfaces:**
- Consumes: `api.dashboard.listActivityEvents`, `getDashboardVisitCursor`, `getDashboardFeatureHref`
- Produces: timeline rows with optional “New” badge when `occurredAt > previousVisitedAt`

- [ ] **Step 1: Implement `DashboardTimeline`**

- `usePaginatedQuery(api.dashboard.listActivityEvents, { userId }, { initialNumItems: 20 })`
- Each row: title, summary, counts chips, relative time, Link to `getDashboardFeatureHref(event.feature)`
- Badge “New” if `previousVisitedAt !== null && event.occurredAt > previousVisitedAt` OR if `previousVisitedAt === null` treat none as new on first-ever visit (avoid marking entire empty→first history as new forever — first visit: no badges; subsequent visits: badges vs previous cursor)
- Empty copy: “Activity will appear here as syncs and updates happen.”
- Load more button when `status === "CanLoadMore"`

- [ ] **Step 2: Manual smoke**

1. Open `/` authed — empty timeline OK  
2. Run a For Later sync — event appears after refresh/reactive update  
3. Reopen `/` — that event no longer “New”

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/dashboard-timeline.tsx src/app/_components/personal-dashboard.tsx
git commit -m "feat: add dashboard activity timeline with new badges"
```

---

### Task 6: Recent albums + rating

**Files:**
- Create: `src/app/_components/dashboard-recent-albums.tsx`
- Modify: `src/app/_components/personal-dashboard.tsx`

**Interfaces:**
- Consumes: `api.spotify.getUserAlbums` (slice client-side to 8) or `listRecentUserAlbums`; `useAlbumRatingDrawer`; `AlbumRatingDrawer`
- Produces: recent album rows with rate affordance; link to `/albums/history`

- [ ] **Step 1: Implement component**

Reuse patterns from History/`AlbumCard` lightly — cover art, name, artist, last listened, rating badge, click-to-rate. Wire `AlbumRatingDrawer` at dashboard shell level (same as For Later page).

- [ ] **Step 2: Smoke: rate an album from `/` without leaving**

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/dashboard-recent-albums.tsx src/app/_components/personal-dashboard.tsx
git commit -m "feat: show recent albums with rating on dashboard"
```

---

### Task 7: Compact modules (recommend, For Later, tracks, Folio)

**Files:**
- Create: `src/app/_components/dashboard-compact-modules.tsx`
- Modify: `src/app/_components/personal-dashboard.tsx`
- Possibly reuse: `ForLaterRecommendationDrawer`, `useForLaterRecommendationDrawer`

**Interfaces:**
- Consumes:
  - For Later: `listForLaterAlbumRows` with default filters + `initialNumItems: 5`, or `getForLaterAlbumItems` + hydrate — prefer smallest existing query that returns name/artist/image
  - Tracks: `api.spotify.getRecentlyPlayedTracks` with `limit: 5`
  - Folio: `api.folioSocietyReleases.getReleases` sorted by newest `firstSeenAt` / existing get API with limit 5
- Recommend button → `openRecommendationDrawer()` + mount `ForLaterRecommendationDrawer`

- [ ] **Step 1: Implement compact grid**

Four compact sections with headings + “View all” links (`/for-later-albums`, `/albums/tracks`, `/folio-society`). Recommend is a button, not a list.

- [ ] **Step 2: Smoke recommend modal opens from `/`**

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/dashboard-compact-modules.tsx src/app/_components/personal-dashboard.tsx
git commit -m "feat: add dashboard recommend and preview modules"
```

---

### Task 8: Stat cards + sparklines

**Files:**
- Create: `src/app/_components/dashboard-stat-cards.tsx`
- Create: `src/app/_components/dashboard-sparkline.tsx` (tiny SVG polyline)
- Modify: `src/app/_components/personal-dashboard.tsx`

**Interfaces:**
- Consumes: `api.dashboard.getDashboardStats`, `ensureTodayStatSnapshot`
- Produces: six cards — label, total, optional delta (last point − point 7 days ago), sparkline for 90d series (render last 30 points if denser UX needed; data is 90d)

- [ ] **Step 1: Implement sparkline SVG**

```tsx
export function DashboardSparkline({
	values,
}: {
	values: number[];
}): React.JSX.Element {
	// normalize to viewBox 0 0 100 24; stroke currentColor; no axes
}
```

- [ ] **Step 2: Implement cards from stats query**

Labels: Albums saved, For Later, Folio books, Funnel tracks, Repeat tracks, Smart playlists.

- [ ] **Step 3: Smoke — totals match approximate known counts; sparkline flat until multiple snapshot days exist**

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/dashboard-stat-cards.tsx \
  src/app/_components/dashboard-sparkline.tsx \
  src/app/_components/personal-dashboard.tsx
git commit -m "feat: add dashboard collection stats with sparklines"
```

---

### Task 9: Mark idea planned + final checks

**Files:**
- Modify: `docs/ideas/2026-07-10-personal-dashboard-with-cross-feature-modules.md`

- [ ] **Step 1: Update idea**

```yaml
status: planned
```

Notes bullet:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-16-personal-dashboard-design.md`, plan: `docs/superpowers/plans/2026-07-16-personal-dashboard.md`
```

- [ ] **Step 2: Run full checks**

```bash
pnpm typecheck
pnpm check
pnpm exec tsx --test convex/_utils/activityEvents.test.ts convex/_utils/dashboardStats.test.ts src/app/_utils/dashboard-feature-routes.test.ts convex/dashboard.publish-source.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit docs**

```bash
git add docs/ideas/2026-07-10-personal-dashboard-with-cross-feature-modules.md \
  docs/superpowers/specs/2026-07-16-personal-dashboard-design.md \
  docs/superpowers/plans/2026-07-16-personal-dashboard.md
git commit -m "docs: plan personal dashboard"
```

---

## Self-Review

| Spec requirement | Task |
|------------------|------|
| Authed `/` dashboard / unauth landing | Task 4 |
| `activityEvents` + feature keys (no href) | Tasks 1–2 |
| Publish from all six event types | Task 2 |
| Publish never fails source | Task 1 (`try/catch`) |
| Visit cursor + new badges on open | Tasks 3, 5 |
| Timeline deep-link by feature | Tasks 4–5 |
| Recent albums + rating | Task 6 |
| Recommend → existing For Later flow | Task 7 |
| For Later / tracks / Folio previews | Task 7 |
| Stats totals + 7/30/90 sparklines | Tasks 3, 8 |
| No backfill | Global Constraints |
| Idea → planned | Task 9 |

No placeholders remain. Types align: `ActivityFeature` / `ActivityEventType` / FEATURE_BY_TYPE / client route map.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-16-personal-dashboard.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement in this session with checkpoints  

Which approach?

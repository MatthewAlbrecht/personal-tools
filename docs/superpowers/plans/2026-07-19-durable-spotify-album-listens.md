# Durable Spotify Album Listen Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every Spotify play, detect coherent ≥70%/4h album listens across sync boundaries, poll hourly, and repair historical misses only via a hash-gated preview/apply CLI.

**Architecture:** Idempotent `spotifyPlayEvents` ledger stores each `(userId, trackId, playedAt)`. Sync upserts the latest 50 plays, then runs a redesigned detector over a 24h album lookback. Repair rebuilds candidates from `spotifySyncLogs` with dry-run default and explicit `--apply` + preview hash.

**Tech Stack:** TypeScript, Convex, Next.js sync routes, `node:test` via `npx tsx --test`, Biome, `tsx` CLI scripts

**Spec:** `docs/superpowers/specs/2026-07-19-durable-spotify-album-listens-design.md`

## Global Constraints

- Listen rule unchanged: unique coverage ≥ 70%, ordered pairs ≥ 70%, span ≤ 4 hours
- Attempt split: `(disc, track)` goes backward and landing `trackNumber ≤ ceil(0.3 × albumTrackCount)` on disc 1 (e.g. 12-track: `#8→#1` splits; `#11→#5` does not)
- Within an attempt, pick strongest contiguous window (coverage → order → shorter span); do not reject the whole attempt blindly
- Detection lookback: 24 hours from newest play in the current snapshot, for albums touched by that snapshot
- Repair default is dry-run; apply requires `--apply` + matching `--preview-hash` + (`--all` or candidate IDs)
- Repair never mutates/deletes existing `userAlbumListens`; never auto-runs from deploy/sync
- Do not add Spotify cron to `vercel.json`; change external `moose` schedule 3h → hourly (ops)
- `userId` is `v.string()` (AUTH username), classic function declarations, `type` aliases, kebab-case files
- Leave unrelated dirty-tree files alone (`convex/smartPlaylists.ts`, birthday form, album-details, for-later docs/tests)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/album-detection.ts` | Disc-aware attempts + coherent window selection |
| Create | `src/lib/album-detection.test.ts` | Detector regressions including YEARNALISM |
| Modify | `src/lib/spotify.ts` | Add `disc_number` on track / album track types |
| Modify | `convex/schema.ts` | Add `spotifyPlayEvents`; extend `spotifySyncRuns` diagnostics |
| Create | `convex/spotifyPlayEvents.ts` | Idempotent upsert + lookback query |
| Modify | `convex/spotify.ts` | `listenedAt = latestPlayedAt`; sync-log listing for repair |
| Modify | `src/lib/spotify-sync.ts` | Ingest ledger, detect from lookback, fix source label, diagnostics |
| Create | `src/lib/spotify-listen-repair.ts` | Pure candidate generation + preview hash |
| Create | `src/lib/spotify-listen-repair.test.ts` | Repair candidate / hash tests |
| Create | `convex/spotifyListenRepair.ts` | Paginated log read + apply inserts |
| Create | `scripts/repair-spotify-album-listens.ts` | Preview/apply CLI |
| Modify | `package.json` | `repair:spotify-album-listens` script |

---

### Task 1: Coherent album-listen detector (TDD)

**Files:**
- Modify: `src/lib/album-detection.ts`
- Create: `src/lib/album-detection.test.ts`
- Modify: `src/lib/spotify.ts` (add `disc_number?: number` to `SpotifyTrack` and album track items; treat missing as `1`)

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `type PlayEvent = { trackId: string; trackNumber: number; discNumber: number; playedAt: number; albumId: string }`
  - `type ListenSession = { albumId: string; trackIds: string[]; earliestPlayedAt: number; latestPlayedAt: number }`
  - `function detectAlbumListenSessions(plays: PlayEvent[], totalTracks: number): ListenSession[]`
  - `function detectAllAlbumListens(plays: PlayEvent[], albumTotalTracks: Map<string, number>): ListenSession[]`
  - `function groupPlaysByAlbum(plays: PlayEvent[]): Map<string, PlayEvent[]>`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/album-detection.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	type PlayEvent,
	detectAlbumListenSessions,
} from "./album-detection";

const HOUR = 60 * 60 * 1000;

function play(
	trackNumber: number,
	playedAt: number,
	opts?: Partial<PlayEvent>,
): PlayEvent {
	return {
		trackId: `t${trackNumber}`,
		trackNumber,
		discNumber: 1,
		playedAt,
		albumId: "album-yearnalism",
		...opts,
	};
}

test("YEARNALISM: stale #10/#8 do not poison clean morning #1-#12", () => {
	// Times mirror the production miss (UTC ms placeholders are fine; relative gaps matter)
	const evening = Date.parse("2026-07-18T21:27:00.000Z");
	const midday = Date.parse("2026-07-19T13:02:00.000Z");
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const plays: PlayEvent[] = [
		play(10, evening, { trackId: "t10-old" }),
		play(8, midday, { trackId: "t8-old" }),
		...Array.from({ length: 12 }, (_, i) =>
			play(i + 1, morningStart + i * 3 * 60_000),
		),
	];

	const sessions = detectAlbumListenSessions(plays, 12);
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0]?.trackIds.length, 12);
	assert.equal(sessions[0]?.earliestPlayedAt, morningStart);
	assert.equal(
		sessions[0]?.latestPlayedAt,
		morningStart + 11 * 3 * 60_000,
	);
});

test("splits consecutive full re-listens", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays = [
		...Array.from({ length: 10 }, (_, i) => play(i + 1, t0 + i * 60_000)),
		...Array.from({ length: 10 }, (_, i) =>
			play(i + 1, t0 + 30 * 60_000 + i * 60_000),
		),
	];
	const sessions = detectAlbumListenSessions(plays, 10);
	assert.equal(sessions.length, 2);
});

test("rejects shuffle below 70% ascending", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const order = [1, 5, 2, 8, 3, 9, 4, 10, 6, 7];
	const plays = order.map((n, i) => play(n, t0 + i * 60_000));
	assert.equal(detectAlbumListenSessions(plays, 10).length, 0);
});

test("rejects sessions longer than 4 hours", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays = Array.from({ length: 10 }, (_, i) =>
		play(i + 1, t0 + i * (HOUR / 2)),
	);
	assert.ok(plays.at(-1)!.playedAt - plays[0]!.playedAt > 4 * HOUR);
	assert.equal(detectAlbumListenSessions(plays, 10).length, 0);
});

test("accepts exactly 70% coverage on 10-track album", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays = Array.from({ length: 7 }, (_, i) =>
		play(i + 1, t0 + i * 60_000),
	);
	assert.equal(detectAlbumListenSessions(plays, 10).length, 1);
});

test("rejects just under 70% coverage on 10-track album", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays = Array.from({ length: 6 }, (_, i) =>
		play(i + 1, t0 + i * 60_000),
	);
	assert.equal(detectAlbumListenSessions(plays, 10).length, 0);
});

test("partial attempt then full listen still records the full window", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays = [
		play(1, t0),
		play(2, t0 + 60_000),
		play(3, t0 + 120_000),
		...Array.from({ length: 10 }, (_, i) =>
			play(i + 1, t0 + 10 * 60_000 + i * 60_000),
		),
	];
	const sessions = detectAlbumListenSessions(plays, 10);
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0]?.trackIds.length, 10);
});

test("multi-disc ascending does not false-split on disc boundary", () => {
	const t0 = Date.parse("2026-07-19T10:00:00.000Z");
	const plays: PlayEvent[] = [
		...Array.from({ length: 5 }, (_, i) =>
			play(i + 1, t0 + i * 60_000, { discNumber: 1, trackId: `d1t${i + 1}` }),
		),
		...Array.from({ length: 5 }, (_, i) =>
			play(i + 1, t0 + (5 + i) * 60_000, {
				discNumber: 2,
				trackId: `d2t${i + 1}`,
			}),
		),
	];
	// totalTracks = 10 unique tracks across discs
	const sessions = detectAlbumListenSessions(plays, 10);
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0]?.trackIds.length, 10);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/album-detection.test.ts`

Expected: FAIL on YEARNALISM (current detector merges stale plays → 4h fail) and/or missing `discNumber`.

- [ ] **Step 3: Implement detector**

Update `PlayEvent` to require `discNumber`. Replace restart/split + validate-whole-session with:

1. Sort by `playedAt`, then `(discNumber, trackNumber)`.
2. Split attempts when `(discNumber, trackNumber)` goes lexicographically backward **and** landing track is disc 1 with `trackNumber <= Math.ceil(0.3 * totalTracks)`.
3. For each attempt, search contiguous windows `[i..j]`; keep windows that pass coverage ≥ 0.7, ascending (disc-aware: same disc `trackNumber` non-decreasing, or disc increases) ≥ 0.7, span ≤ 4h.
4. Score winners: higher unique coverage, then higher ascending ratio, then shorter span.
5. Emit non-overlapping winners chronologically (greedy by start time after selecting best per attempt is fine if attempts already split re-listens).

Keep exports `detectAlbumListenSessions`, `detectAllAlbumListens`, `groupPlaysByAlbum`. Remove obsolete `RESTART_FROM_TRACK` / `RESTART_AFTER_TRACK_PERCENT` constants.

Disc-aware ascending helper:

```typescript
function isAscendingPair(prev: PlayEvent, curr: PlayEvent): boolean {
	if (curr.discNumber !== prev.discNumber) {
		return curr.discNumber > prev.discNumber;
	}
	return curr.trackNumber >= prev.trackNumber;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/album-detection.test.ts`

Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/album-detection.ts src/lib/album-detection.test.ts src/lib/spotify.ts
git commit -m "$(cat <<'EOF'
fix: detect coherent album listen windows

Stop stale plays in the same Spotify batch from poisoning a valid
straight-through listen; split attempts on early restarts and pick
the best 70%/4h window.
EOF
)"
```

---

### Task 2: Play-event ledger schema + Convex API

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/spotifyPlayEvents.ts`
- Modify: `convex/spotify.ts` (`recordAlbumListen` `listenedAt`; optional sync-run fields)

**Interfaces:**
- Consumes: nothing
- Produces:
  - Table `spotifyPlayEvents` with indexes `by_userId_playedAt`, `by_userId_albumId_playedAt`, `by_userId_eventKey`
  - `function buildPlayEventKey(userId: string, spotifyTrackId: string, playedAt: number): string`
  - `upsertPlayEvents` mutation → `{ inserted: number; duplicates: number }`
  - `listPlayEventsForAlbumsSince` query → play event docs for `userId` + `spotifyAlbumIds` with `playedAt >= sinceMs`
  - `recordAlbumListen` sets `listenedAt: args.latestPlayedAt` (not `Date.now()`)
  - `spotifySyncRuns` optional fields: `playEventsInserted`, `playEventsDuplicates`, `listenCandidates`, `listensDeduped`, `historyGapWarning` (boolean)

- [ ] **Step 1: Add schema**

In `convex/schema.ts` add:

```typescript
spotifyPlayEvents: defineTable({
	userId: v.string(),
	spotifyTrackId: v.string(),
	spotifyAlbumId: v.string(),
	trackNumber: v.number(),
	discNumber: v.number(),
	playedAt: v.number(),
	eventKey: v.string(),
	ingestedAt: v.number(),
	syncRunId: v.optional(v.id("spotifySyncRuns")),
})
	.index("by_userId_playedAt", ["userId", "playedAt"])
	.index("by_userId_albumId_playedAt", [
		"userId",
		"spotifyAlbumId",
		"playedAt",
	])
	.index("by_userId_eventKey", ["userId", "eventKey"]),
```

Extend `spotifySyncRuns` with the optional diagnostic fields listed above (all optional so old rows remain valid).

- [ ] **Step 2: Implement `convex/spotifyPlayEvents.ts`**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export function buildPlayEventKey(
	userId: string,
	spotifyTrackId: string,
	playedAt: number,
): string {
	return `${userId}:${spotifyTrackId}:${playedAt}`;
}

export const upsertPlayEvents = mutation({
	args: {
		userId: v.string(),
		syncRunId: v.optional(v.id("spotifySyncRuns")),
		events: v.array(
			v.object({
				spotifyTrackId: v.string(),
				spotifyAlbumId: v.string(),
				trackNumber: v.number(),
				discNumber: v.number(),
				playedAt: v.number(),
			}),
		),
	},
	returns: v.object({
		inserted: v.number(),
		duplicates: v.number(),
	}),
	handler: async (ctx, args) => {
		let inserted = 0;
		let duplicates = 0;
		const now = Date.now();
		for (const event of args.events) {
			const eventKey = buildPlayEventKey(
				args.userId,
				event.spotifyTrackId,
				event.playedAt,
			);
			const existing = await ctx.db
				.query("spotifyPlayEvents")
				.withIndex("by_userId_eventKey", (q) =>
					q.eq("userId", args.userId).eq("eventKey", eventKey),
				)
				.first();
			if (existing) {
				duplicates++;
				continue;
			}
			await ctx.db.insert("spotifyPlayEvents", {
				userId: args.userId,
				...event,
				eventKey,
				ingestedAt: now,
				syncRunId: args.syncRunId,
			});
			inserted++;
		}
		return { inserted, duplicates };
	},
});

export const listPlayEventsForAlbumsSince = query({
	args: {
		userId: v.string(),
		spotifyAlbumIds: v.array(v.string()),
		sinceMs: v.number(),
	},
	returns: v.array(
		v.object({
			spotifyTrackId: v.string(),
			spotifyAlbumId: v.string(),
			trackNumber: v.number(),
			discNumber: v.number(),
			playedAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const albumSet = new Set(args.spotifyAlbumIds);
		const out: Array<{
			spotifyTrackId: string;
			spotifyAlbumId: string;
			trackNumber: number;
			discNumber: number;
			playedAt: number;
		}> = [];
		for (const spotifyAlbumId of albumSet) {
			const rows = await ctx.db
				.query("spotifyPlayEvents")
				.withIndex("by_userId_albumId_playedAt", (q) =>
					q
						.eq("userId", args.userId)
						.eq("spotifyAlbumId", spotifyAlbumId)
						.gte("playedAt", args.sinceMs),
				)
				.collect();
			for (const row of rows) {
				out.push({
					spotifyTrackId: row.spotifyTrackId,
					spotifyAlbumId: row.spotifyAlbumId,
					trackNumber: row.trackNumber,
					discNumber: row.discNumber,
					playedAt: row.playedAt,
				});
			}
		}
		return out;
	},
});
```

- [ ] **Step 3: Fix `recordAlbumListen` timestamp**

In `convex/spotify.ts` `recordAlbumListen`, set:

```typescript
listenedAt: args.latestPlayedAt,
```

and use `args.latestPlayedAt` for `userAlbums.lastListenedAt` / `firstListenedAt` on insert/patch (keep overlap dedup logic unchanged).

- [ ] **Step 4: Typecheck schema/API surface**

Run: `pnpm typecheck`

Expected: PASS (or only pre-existing unrelated errors). Ensure `npx convex codegen` / `convex dev` has regenerated types if needed locally.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/spotifyPlayEvents.ts convex/spotify.ts
git commit -m "$(cat <<'EOF'
feat: add idempotent Spotify play-event ledger

Store each observed play by user/track/playedAt and record album
listens using the session end time.
EOF
)"
```

---

### Task 3: Wire sync to ledger + lookback detection

**Files:**
- Modify: `src/lib/spotify-sync.ts`
- Modify: `convex/spotify.ts` (`saveSyncRun` args to accept new optional diagnostics)

**Interfaces:**
- Consumes: `upsertPlayEvents`, `listPlayEventsForAlbumsSince`, `detectAlbumListenSessions`
- Produces: sync that ingests events, detects from 24h lookback, accurate `source`, gap warning

- [ ] **Step 1: Extend `SyncStats`**

```typescript
export type SyncStats = {
	// ...existing fields...
	playEventsInserted: number;
	playEventsDuplicates: number;
	listenCandidates: number;
	listensDeduped: number;
	historyGapWarning: boolean;
};
```

Initialize all new counters to `0` / `false`.

- [ ] **Step 2: After fetching `recentlyPlayed`, upsert play events**

Map items with `discNumber: item.track.disc_number ?? 1`. Call `api.spotifyPlayEvents.upsertPlayEvents`. Store counts on `stats`.

Watermark / gap warning:

```typescript
const playedAts = recentlyPlayed.map((i) => Date.parse(i.played_at));
const newest = Math.max(...playedAts);
const oldestInBatch = Math.min(...playedAts);
// Load prior watermark from last successful sync run if available; else skip warning.
// historyGapWarning = recentlyPlayed.length === 50 && no overlap with previously stored events for this user in [oldestInBatch, newest]
```

Concrete rule matching the spec: if `recentlyPlayed.length === 50`, query whether **any** of the batch `eventKey`s already existed (`duplicates === 0` and inserted === 50 on a full batch after the ledger is warm). Simpler durable rule:

- Persist `lastRecentlyPlayedNewestAt` on sync run or derive from ledger: if batch size is 50 and **zero** of the batch keys existed (`duplicates === 0`) **and** the user already had any `spotifyPlayEvents`, set `historyGapWarning = true`.

- [ ] **Step 3: Replace in-memory-only detection**

In `detectAlbumListens`:

1. Still ensure albums exist / fetch metadata (keep existing first pass).
2. Compute `sinceMs = newestPlayedAtInBatch - 24 * HOUR`.
3. `listPlayEventsForAlbumsSince` for album IDs in the batch.
4. Map to `PlayEvent` (`trackId: spotifyTrackId`, etc.).
5. Run `detectAlbumListenSessions` per album.
6. Set `stats.listenCandidates` to total sessions before record.
7. Call `recordAlbumListen` with:

```typescript
source: source === "cron" ? "cron_sync" : "manual_sync",
```

Pass `source` from `syncSpotifyHistory` into `detectAlbumListens` (today it hardcodes `"manual_sync"` — fix that).

8. Increment `listensDeduped` when `result.recorded === false`.

- [ ] **Step 4: Persist new fields on `saveSyncRun`**

Update `saveSyncRun` args validators to optional/required matching `SyncStats` additions; pass them through from sync.

- [ ] **Step 5: Manual sanity check**

Run: `npx tsx --test src/lib/album-detection.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify-sync.ts convex/spotify.ts
git commit -m "$(cat <<'EOF'
feat: detect album listens from rolling play ledger

Ingest recently-played into spotifyPlayEvents and evaluate a 24h
lookback so sessions can cross sync boundaries.
EOF
)"
```

---

### Task 4: Historical repair pure library (TDD)

**Files:**
- Create: `src/lib/spotify-listen-repair.ts`
- Create: `src/lib/spotify-listen-repair.test.ts`

**Interfaces:**
- Consumes: `detectAlbumListenSessions`, `PlayEvent`
- Produces:
  - `type RepairCandidate = { id: string; userId: string; spotifyAlbumId: string; albumName?: string; trackIds: string[]; earliestPlayedAt: number; latestPlayedAt: number; coverage: number; ascendingRatio: number; evidenceLogIds: string[] }`
  - `type ExistingListenInterval = { spotifyAlbumId: string; earliestPlayedAt: number; latestPlayedAt: number }`
  - `function parseRecentlyPlayedRaw(rawResponse: string): PlayEvent[]` (default `discNumber` 1)
  - `function buildRepairCandidates(input: { userId: string; logs: Array<{ id: string; rawResponse: string }>; albumTotalTracks: Map<string, number>; existingListens: ExistingListenInterval[] }): RepairCandidate[]`
  - `function computePreviewHash(candidates: RepairCandidate[]): string`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/spotify-listen-repair.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRepairCandidates,
	computePreviewHash,
} from "./spotify-listen-repair";

test("dedupes the same play across multiple sync logs", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const raw = JSON.stringify(items);
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [
			{ id: "log1", rawResponse: raw },
			{ id: "log2", rawResponse: raw },
		],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [],
	});
	assert.equal(candidates.length, 1);
	assert.equal(candidates[0]?.trackIds.length, 12);
	assert.deepEqual(candidates[0]?.evidenceLogIds.sort(), ["log1", "log2"]);
});

test("excludes candidates overlapping existing listens", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [{ id: "log1", rawResponse: JSON.stringify(items) }],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [
			{
				spotifyAlbumId: "alb",
				earliestPlayedAt: morningStart,
				latestPlayedAt: morningStart + 11 * 180_000,
			},
		],
	});
	assert.equal(candidates.length, 0);
});

test("preview hash is stable for same candidate set", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [{ id: "log1", rawResponse: JSON.stringify(items) }],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [],
	});
	assert.equal(computePreviewHash(candidates), computePreviewHash(candidates));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test src/lib/spotify-listen-repair.test.ts`

- [ ] **Step 3: Implement library**

- Parse each log’s `rawResponse` as `RecentlyPlayedItem[]` (tolerate missing `disc_number`).
- Dedupe plays by `${trackId}:${playedAt}` across logs; union evidence log ids per play.
- Group by album → `detectAlbumListenSessions`.
- Drop sessions overlapping any `existingListens` for that `spotifyAlbumId` (same interval overlap predicate as `recordAlbumListen`).
- Candidate `id`: stable hash of `userId|spotifyAlbumId|earliest|latest|sortedTrackIds`.
- `computePreviewHash`: SHA-256 hex of canonical JSON of sorted candidates by `id` (include id, album, times, trackIds).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx tsx --test src/lib/spotify-listen-repair.test.ts src/lib/album-detection.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify-listen-repair.ts src/lib/spotify-listen-repair.test.ts
git commit -m "$(cat <<'EOF'
feat: add preview hash repair candidate builder

Rebuild listen candidates from raw sync logs with overlap exclusion
and a deterministic preview hash.
EOF
)"
```

---

### Task 5: Repair Convex helpers + CLI

**Files:**
- Create: `convex/spotifyListenRepair.ts`
- Create: `scripts/repair-spotify-album-listens.ts`
- Modify: `package.json`
- Modify: `convex/spotify.ts` only if a public album-id→db-id helper is missing (prefer adding small helpers in `spotifyListenRepair.ts`)

**Interfaces:**
- Consumes: `buildRepairCandidates`, `computePreviewHash`, `recordAlbumListen` logic (internal insert path)
- Produces:
  - `internalQuery listSyncLogsPage` / `listExistingListensForUser` / `resolveAlbumDbIds`
  - `internalMutation applyRepairCandidates` — insert only non-overlapping listens with `source: "historical_repair"`
  - CLI: preview default; apply with gates

- [ ] **Step 1: Convex repair module**

Implement paginated readers that return:

- sync logs: `{ id, rawResponse, createdAt }[]` for a `userId`
- existing listens joined to Spotify album ids (query `userAlbumListens` + `spotifyAlbums.spotifyAlbumId`)
- map of `spotifyAlbumId → { dbId, totalTracks, name }` for ids referenced in logs

`applyRepairCandidates` args:

```typescript
{
  userId: v.string(),
  previewHash: v.string(),
  candidates: v.array(v.object({
    id: v.string(),
    spotifyAlbumId: v.string(),
    trackIds: v.array(v.string()),
    earliestPlayedAt: v.number(),
    latestPlayedAt: v.number(),
  })),
}
```

Handler: resolve album DB ids; for each candidate, reuse the same overlap check + insert as `recordAlbumListen` (extract shared helper or call internal mutation). Set `listenedAt = latestPlayedAt`, `source: "historical_repair"`. Return `{ applied: number; skipped: number }`.

- [ ] **Step 2: CLI script**

```typescript
// scripts/repair-spotify-album-listens.ts
// Usage:
//   pnpm repair:spotify-album-listens -- --user moose
//   pnpm repair:spotify-album-listens -- --user moose --prod
//   pnpm repair:spotify-album-listens -- --user moose --prod --apply --preview-hash <hash> --all
//   pnpm repair:spotify-album-listens -- --user moose --prod --apply --preview-hash <hash> --id <candidateId>
```

Behavior:

1. Parse flags: `--user` (required), `--prod`, `--apply`, `--preview-hash`, `--all`, repeatable `--id`.
2. Load all sync logs + existing listens + album metadata via `pnpm exec convex run` (same pattern as `scripts/backfill-for-later-filter-projection.mjs`) or `ConvexHttpClient` if env is already available — prefer `convex run` for prod/dev parity.
3. `buildRepairCandidates` → print table of id / album / window / coverage / ascending / evidence.
4. Print `previewHash=...`.
5. If not `--apply`, exit 0.
6. If `--apply`: require `--preview-hash` matching recomputed hash; require `--all` or at least one `--id`; filter set; abort on drift; call apply mutation; print applied/skipped.

- [ ] **Step 3: package.json**

```json
"repair:spotify-album-listens": "tsx scripts/repair-spotify-album-listens.ts"
```

- [ ] **Step 4: Dry-run locally against dev (smoke)**

Run: `pnpm repair:spotify-album-listens -- --user moose`

Expected: prints candidates (maybe empty on empty dev) and a preview hash; no writes.

- [ ] **Step 5: Commit**

```bash
git add convex/spotifyListenRepair.ts scripts/repair-spotify-album-listens.ts package.json convex/spotify.ts
git commit -m "$(cat <<'EOF'
feat: add preview-first Spotify listen repair CLI

Default dry-run reports candidates and a hash; apply requires an
explicit matching hash plus selected IDs or --all.
EOF
)"
```

---

### Task 6: Verification + rollout checklist

**Files:** none required (ops + commands)

- [ ] **Step 1: Run full focused tests + lint/types**

```bash
npx tsx --test src/lib/album-detection.test.ts src/lib/spotify-listen-repair.test.ts
pnpm typecheck
pnpm check
```

Expected: all PASS / clean for touched files.

- [ ] **Step 2: Production repair preview (read-only)**

```bash
pnpm repair:spotify-album-listens -- --user moose --prod
```

Expected: YEARNALISM / Baby Rose morning window appears as a candidate with ~12 tracks and morning timestamps; print hash. **Do not apply.**

- [ ] **Step 3: Ops — hourly moose cron**

Change external scheduler for moose Spotify sync from every 3 hours to hourly. Do not add `vercel.json` Spotify cron. Verify next several `spotifySyncRuns` for moose are ~1h apart and watch `historyGapWarning`.

- [ ] **Step 4: Apply only after human approval**

When approved:

```bash
pnpm repair:spotify-album-listens -- --user moose --prod --apply --preview-hash <hash> --id <yearnalismCandidateId>
```

Or `--all` if the full preview set is accepted.

- [ ] **Step 5: Final commit only if checklist doc / idea status needs updating**

If an ideas file exists for this work, mark status done and link the spec/plan; otherwise skip.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Coherent 70%/4h detector + YEARNALISM regression | Task 1 |
| Disc-aware ordering / split rule | Task 1 |
| `spotifyPlayEvents` ledger + indexes | Task 2 |
| Idempotent upsert | Task 2 |
| `listenedAt = session end` | Task 2 |
| Sync ingest + 24h lookback detection | Task 3 |
| Cron/manual source labels + gap warning diagnostics | Task 3 |
| Preview-first repair + hash gate | Tasks 4–5 |
| No auto-apply / no existing-row mutation | Tasks 4–5 |
| Hourly moose schedule, no vercel Spotify cron | Task 6 |
| Prod YEARNALISM preview before apply | Task 6 |

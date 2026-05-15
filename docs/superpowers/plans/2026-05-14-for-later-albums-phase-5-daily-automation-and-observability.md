# For Later Albums Phase 5: Daily Automation and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily cron sync for the For Later Albums playlist, refresh Spotify tokens automatically, record every cron outcome in `forLaterSyncRuns`, and surface the latest failure in the UI. AI RYM discovery stays **manual only** (Phase 3 route / Phase 4 UI); cron must not enqueue or trigger discovery.

**Architecture:** Keep the cron entrypoint in `src/pages/api/cron` to match existing scheduled routes, and reuse the same `CRON_SECRET`, `SPOTIFY_SYNC_USER_ID`, `ConvexHttpClient`, and `refreshAccessToken` patterns used by the existing Spotify cron jobs. The cron route only handles authorization, user resolution, token refresh, and response shaping; playlist ingestion remains in `src/lib/for-later-albums-sync.ts`, while Convex stores sync-run observability and exposes the latest run to the UI.

**Tech Stack:** Next.js Pages API routes, Vercel Cron, Convex queries/mutations via `ConvexHttpClient` and `fetchQuery`, Spotify OAuth refresh helpers, `node:test` for pure helper tests, TypeScript, Biome.

**Commit Policy:** Do not create git commits unless the user explicitly requests them.

---

## File Structure

- Create `src/lib/for-later-albums-cron.ts`: pure helpers for cron authorization, query/body user resolution, and error message normalization.
- Create `src/lib/for-later-albums-cron.test.ts`: `node:test` coverage for the pure cron helpers.
- Verify `src/lib/for-later-albums-sync.ts`: cron and manual sync both persist `rymDiscoveryQueued: 0` and never call `queueRymDiscoveryForItem` (manual discovery policy).
- Modify `convex/forLaterAlbums.ts`: add `getForLaterSyncStatus` query for the UI and ensure `saveForLaterSyncRun` accepts both `success` and `failed` cron runs (including `rymDiscoveryQueued`, always `0` from sync).
- Create `src/pages/api/cron/sync-for-later-albums.ts`: Vercel cron endpoint secured with `CRON_SECRET`, using `SPOTIFY_SYNC_USER_ID` by default, refreshing Spotify access tokens before sync.
- Modify `vercel.json`: add a daily schedule for `/api/cron/sync-for-later-albums` without removing existing crons.
- Create `src/app/for-later-albums/_components/sync-status-banner.tsx`: server component that displays the latest cron/manual sync status and highlights failures.
- Modify `src/app/for-later-albums/page.tsx`: render `SyncStatusBanner` above the existing Phase 4 controls/list.
- Reference only `src/env.js`: no schema edit is expected because `CRON_SECRET`, `SPOTIFY_SYNC_USER_ID`, and `FOR_LATER_SPOTIFY_PLAYLIST_ID` are already declared there.

---

## Assumptions From Phases 1-4

- `convex/schema.ts` already contains `forLaterAlbumItems` and `forLaterSyncRuns` as specified in the PRD.
- `convex/forLaterAlbums.ts` already exports `saveForLaterSyncRun` and the item mutations needed by the sync utility.
- `src/lib/for-later-albums-sync.ts` already exports `syncForLaterAlbums` and leaves AI discovery to Phase 3 manual triggers only.
- Optional Phase 3 mutation `queueRymDiscoveryForItem` may exist for explicit UI retries; Phase 5 cron must not call it.
- `src/app/for-later-albums/page.tsx` already exists from Phase 4 and renders the list UI.

---

## Task 1: Cron Helper Tests And Module

**Files:**

- Create: `src/lib/for-later-albums-cron.test.ts`
- Create: `src/lib/for-later-albums-cron.ts`
- **Step 1: Write failing cron helper tests**

Create `src/lib/for-later-albums-cron.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	getQueryParam,
	isAuthorizedCronRequest,
	resolveCronUserId,
	toErrorMessage,
} from "./for-later-albums-cron";

test("isAuthorizedCronRequest accepts exact bearer token", () => {
	assert.equal(isAuthorizedCronRequest("Bearer super-secret", "super-secret"), true);
});

test("isAuthorizedCronRequest rejects missing or mismatched bearer token", () => {
	assert.equal(isAuthorizedCronRequest(undefined, "super-secret"), false);
	assert.equal(isAuthorizedCronRequest("Bearer wrong", "super-secret"), false);
	assert.equal(isAuthorizedCronRequest("super-secret", "super-secret"), false);
});

test("getQueryParam returns the first array value", () => {
	assert.equal(getQueryParam(["first", "second"]), "first");
});

test("getQueryParam returns undefined for empty input", () => {
	assert.equal(getQueryParam(undefined), undefined);
	assert.equal(getQueryParam([]), undefined);
});

test("resolveCronUserId prefers body user over query user and env user", () => {
	assert.equal(
		resolveCronUserId({
			bodyUserId: " body-user ",
			queryUser: "query-user",
			defaultUserId: "env-user",
		}),
		"body-user",
	);
});

test("resolveCronUserId falls back to query user then env user", () => {
	assert.equal(
		resolveCronUserId({
			bodyUserId: undefined,
			queryUser: " query-user ",
			defaultUserId: "env-user",
		}),
		"query-user",
	);
	assert.equal(
		resolveCronUserId({
			bodyUserId: undefined,
			queryUser: undefined,
			defaultUserId: " env-user ",
		}),
		"env-user",
	);
});

test("toErrorMessage keeps Error messages and normalizes unknown values", () => {
	assert.equal(toErrorMessage(new Error("Spotify failed")), "Spotify failed");
	assert.equal(toErrorMessage("plain failure"), "plain failure");
	assert.equal(toErrorMessage({ reason: "bad" }), "Unknown error");
});
```

- **Step 2: Run tests and verify failure**

Run:

```bash
node --test src/lib/for-later-albums-cron.test.ts
```

Expected: FAIL because `src/lib/for-later-albums-cron.ts` does not exist or does not export the tested helpers.

- **Step 3: Implement cron helper module**

Create `src/lib/for-later-albums-cron.ts`:

```typescript
export function isAuthorizedCronRequest(
	authorizationHeader: string | undefined,
	cronSecret: string,
): boolean {
	return authorizationHeader === `Bearer ${cronSecret}`;
}

export function getQueryParam(
	value: string | string[] | undefined,
): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

export function resolveCronUserId({
	bodyUserId,
	queryUser,
	defaultUserId,
}: {
	bodyUserId: string | undefined;
	queryUser: string | undefined;
	defaultUserId: string;
}): string {
	return (bodyUserId?.trim() || queryUser?.trim() || defaultUserId.trim());
}

export function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}
```

- **Step 4: Run helper tests and verify pass**

Run:

```bash
node --test src/lib/for-later-albums-cron.test.ts
```

Expected: PASS with TAP output ending in `# fail 0`.

- **Step 5: Run formatter check on helper files**

Run:

```bash
pnpm check src/lib/for-later-albums-cron.ts src/lib/for-later-albums-cron.test.ts
```

Expected: PASS with Biome reporting no errors for both files.

---

## Task 2: Confirm Sync Never Auto-Queues Discovery

**Files:**

- Verify: `src/lib/for-later-albums-sync.ts`
- **Step 1: Confirm sync never calls `queueRymDiscoveryForItem`**

`syncForLaterAlbums` must not enqueue AI discovery after playlist upserts. Every persisted `forLaterSyncRuns` row should include `rymDiscoveryQueued: 0` (schema field remains from Phase 1 for optional future automation).

- **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

---

## Task 3: Convex Sync Status Query

**Files:**

- Modify: `convex/forLaterAlbums.ts`
- **Step 1: Add the latest sync status query**

In `convex/forLaterAlbums.ts`, add this query near the existing sync-run functions:

```typescript
export const getForLaterSyncStatus = query({
	args: {
		userId: v.string(),
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("forLaterSyncRuns"),
			source: v.union(v.literal("manual"), v.literal("cron")),
			status: v.union(v.literal("success"), v.literal("failed")),
			startedAt: v.number(),
			completedAt: v.number(),
			durationMs: v.number(),
			tracksFromPlaylist: v.number(),
			uniqueAlbumsFromPlaylist: v.number(),
			newAlbumsAdded: v.number(),
			existingAlbumsSeen: v.number(),
			albumsMarkedRemoved: v.number(),
			rymMatchesCreated: v.number(),
			rymDiscoveryQueued: v.number(),
			error: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		const run = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		if (!run) return null;

		return {
			_id: run._id,
			source: run.source,
			status: run.status,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
			durationMs: run.durationMs,
			tracksFromPlaylist: run.tracksFromPlaylist,
			uniqueAlbumsFromPlaylist: run.uniqueAlbumsFromPlaylist,
			newAlbumsAdded: run.newAlbumsAdded,
			existingAlbumsSeen: run.existingAlbumsSeen,
			albumsMarkedRemoved: run.albumsMarkedRemoved,
			rymMatchesCreated: run.rymMatchesCreated,
			rymDiscoveryQueued: run.rymDiscoveryQueued,
			error: run.error,
		};
	},
});
```

- **Step 2: Confirm `saveForLaterSyncRun` accepts failed cron runs**

In the existing `saveForLaterSyncRun` mutation, ensure the args include the complete sync-run shape:

```typescript
args: {
	userId: v.string(),
	spotifyPlaylistId: v.string(),
	source: v.union(v.literal("manual"), v.literal("cron")),
	status: v.union(v.literal("success"), v.literal("failed")),
	startedAt: v.number(),
	completedAt: v.number(),
	durationMs: v.number(),
	spotifySnapshotId: v.optional(v.string()),
	tracksFromPlaylist: v.number(),
	uniqueAlbumsFromPlaylist: v.number(),
	newAlbumsAdded: v.number(),
	existingAlbumsSeen: v.number(),
	albumsMarkedRemoved: v.number(),
	rymMatchesCreated: v.number(),
	rymDiscoveryQueued: v.number(),
	error: v.optional(v.string()),
},
```

- **Step 3: Confirm the mutation writes the fields unchanged**

The mutation handler should insert the run directly:

```typescript
handler: async (ctx, args) => {
	return await ctx.db.insert("forLaterSyncRuns", args);
},
```

- **Step 4: Run Convex type generation**

Run:

```bash
npx convex codegen
```

Expected: PASS and regenerate `convex/_generated/api.d.ts` with `forLaterAlbums.getForLaterSyncStatus`.

- **Step 5: Run TypeScript check**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

---

## Task 4: Daily Cron Route

**Files:**

- Create: `src/pages/api/cron/sync-for-later-albums.ts`
- **Step 1: Create the cron route**

Create `src/pages/api/cron/sync-for-later-albums.ts`:

```typescript
import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { api } from "../../../../convex/_generated/api";
import {
	getQueryParam,
	isAuthorizedCronRequest,
	resolveCronUserId,
	toErrorMessage,
} from "~/lib/for-later-albums-cron";
import { syncForLaterAlbums } from "~/lib/for-later-albums-sync";
import { refreshAccessToken } from "~/lib/spotify";
import { env } from "~/env.js";

type CronSyncResponse = {
	success?: boolean;
	error?: string;
	message?: string;
	result?: Awaited<ReturnType<typeof syncForLaterAlbums>>;
	timestamp: string;
};

type CronRequestBody = {
	userId?: string;
};

function getBody(req: NextApiRequest): CronRequestBody {
	if (req.method !== "POST" || !req.body || typeof req.body !== "object") {
		return {};
	}

	return req.body as CronRequestBody;
}

async function saveFailedCronRun({
	convex,
	userId,
	startedAt,
	error,
}: {
	convex: ConvexHttpClient;
	userId: string;
	startedAt: number;
	error: string;
}): Promise<void> {
	const completedAt = Date.now();

	try {
		await convex.mutation(api.forLaterAlbums.saveForLaterSyncRun, {
			userId,
			spotifyPlaylistId: env.FOR_LATER_SPOTIFY_PLAYLIST_ID ?? "missing",
			source: "cron",
			status: "failed",
			startedAt,
			completedAt,
			durationMs: completedAt - startedAt,
			tracksFromPlaylist: 0,
			uniqueAlbumsFromPlaylist: 0,
			newAlbumsAdded: 0,
			existingAlbumsSeen: 0,
			albumsMarkedRemoved: 0,
			rymMatchesCreated: 0,
			rymDiscoveryQueued: 0,
			error,
		});
	} catch (saveError) {
		console.error("Failed to save For Later Albums cron failure", saveError);
	}
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<CronSyncResponse>,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({
			error: "Method not allowed",
			timestamp: new Date().toISOString(),
		});
	}

	if (!isAuthorizedCronRequest(req.headers.authorization, env.CRON_SECRET)) {
		return res.status(401).json({
			error: "Unauthorized",
			timestamp: new Date().toISOString(),
		});
	}

	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const body = getBody(req);
	const queryUser = getQueryParam(req.query.user);
	const userId = resolveCronUserId({
		bodyUserId: body.userId,
		queryUser,
		defaultUserId: env.SPOTIFY_SYNC_USER_ID,
	});

	if (!userId) {
		return res.status(400).json({
			error: "Missing Spotify sync user id",
			timestamp: new Date().toISOString(),
		});
	}

	try {
		const connection = await convex.query(api.spotify.getConnection, { userId });

		if (!connection) {
			const message = "No Spotify connection found";
			await saveFailedCronRun({ convex, userId, startedAt, error: message });
			return res.status(404).json({
				error: message,
				timestamp: new Date().toISOString(),
			});
		}

		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			try {
				const newTokens = await refreshAccessToken(connection.refreshToken);
				await convex.mutation(api.spotify.updateTokens, {
					userId,
					accessToken: newTokens.access_token,
					expiresIn: newTokens.expires_in,
					refreshToken: newTokens.refresh_token,
				});
				accessToken = newTokens.access_token;
			} catch (refreshError) {
				const message = toErrorMessage(refreshError);
				await saveFailedCronRun({
					convex,
					userId,
					startedAt,
					error: `Spotify token refresh failed: ${message}`,
				});
				return res.status(500).json({
					error: "Spotify token refresh failed",
					message,
					timestamp: new Date().toISOString(),
				});
			}
		}

		const result = await syncForLaterAlbums({
			accessToken,
			userId,
			source: "cron",
		});

		if (!result.success) {
			return res.status(500).json({
				success: false,
				error: "For Later Albums sync failed",
				message: result.error,
				result,
				timestamp: new Date().toISOString(),
			});
		}

		return res.status(200).json({
			success: true,
			result,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		const message = toErrorMessage(error);
		await saveFailedCronRun({ convex, userId, startedAt, error: message });

		return res.status(500).json({
			error: "For Later Albums cron sync failed",
			message,
			timestamp: new Date().toISOString(),
		});
	}
}
```

- **Step 2: Confirm route behavior for auth failures**

Run the dev server in one terminal:

```bash
pnpm dev
```

Expected: Next.js starts on port `1333`.

Then run:

```bash
curl -i http://localhost:1333/api/cron/sync-for-later-albums
```

Expected: HTTP `401` with JSON containing `"error":"Unauthorized"`.

- **Step 3: Confirm route behavior for unsupported methods**

Run:

```bash
curl -i -X PUT -H "Authorization: Bearer $CRON_SECRET" http://localhost:1333/api/cron/sync-for-later-albums
```

Expected: HTTP `405` with JSON containing `"error":"Method not allowed"`.

- **Step 4: Confirm authorized cron reaches Spotify connection lookup**

Run:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" "http://localhost:1333/api/cron/sync-for-later-albums"
```

Expected when local Convex has a Spotify connection: HTTP `200` with `"success":true`. Expected when local Convex has no connection for `SPOTIFY_SYNC_USER_ID`: HTTP `404` with `"error":"No Spotify connection found"` and a failed `forLaterSyncRuns` row.

- **Step 5: Run focused checks**

Run:

```bash
pnpm typecheck
pnpm check src/pages/api/cron/sync-for-later-albums.ts src/lib/for-later-albums-cron.ts
```

Expected: both commands exit `0`; TypeScript reports no errors and Biome reports no lint/format errors for the cron files.

---

## Task 5: Vercel Cron Schedule

**Files:**

- Modify: `vercel.json`
- **Step 1: Add the daily For Later Albums cron**

Replace `vercel.json` with:

```json
{
	"crons": [
		{
			"path": "/api/cron/sync-folio",
			"schedule": "30 8 * * *"
		},
		{
			"path": "/api/cron/sync-for-later-albums",
			"schedule": "15 9 * * *"
		}
	]
}
```

Vercel cron schedules are evaluated in UTC. This runs For Later Albums once per day at `09:15 UTC`.

- **Step 2: Validate JSON**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('vercel.json', 'utf8')); console.log('vercel.json ok')"
```

Expected output:

```txt
vercel.json ok
```

- **Step 3: Run Biome on config**

Run:

```bash
pnpm check vercel.json
```

Expected: PASS with no Biome errors for `vercel.json`.

---

## Task 6: Sync Failure Display

**Files:**

- Create: `src/app/for-later-albums/_components/sync-status-banner.tsx`
- Modify: `src/app/for-later-albums/page.tsx`
- **Step 1: Create the status banner server component**

Create `src/app/for-later-albums/_components/sync-status-banner.tsx`:

```typescript
import { fetchQuery } from "convex/nextjs";
import type { ReactElement } from "react";
import { api } from "../../../../convex/_generated/api";
import { env } from "~/env.js";

export async function SyncStatusBanner(): Promise<ReactElement | null> {
	const status = await fetchQuery(api.forLaterAlbums.getForLaterSyncStatus, {
		userId: env.SPOTIFY_SYNC_USER_ID,
	});

	if (!status) {
		return (
			<div className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
				For Later Albums has not synced yet.
			</div>
		);
	}

	const completedAt = new Date(status.completedAt).toLocaleString();

	if (status.status === "failed") {
		return (
			<div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 text-sm">
				<p className="font-medium">Last For Later Albums sync failed.</p>
				<p>
					{status.source === "cron" ? "Daily sync" : "Manual sync"} failed at{" "}
					{completedAt}.
				</p>
				{status.error ? <p className="mt-1">{status.error}</p> : null}
			</div>
		);
	}

	return (
		<div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">
			Last {status.source === "cron" ? "daily" : "manual"} sync completed at{" "}
			{completedAt}. Added {status.newAlbumsAdded} new albums;{" "}
			{status.rymMatchesCreated} RYM matches from Phase 2 rules.{" "}
			<span className="block mt-1">
				RYM link discovery is manual — use Find RYM links when you want AI lookups.
			</span>
		</div>
	);
}
```

- **Step 2: Render the banner on the For Later Albums page**

In `src/app/for-later-albums/page.tsx`, import the banner:

```typescript
import { SyncStatusBanner } from "./_components/sync-status-banner";
```

Render it above the existing Phase 4 sync button, filters, and album list:

```tsx
<div className="space-y-6">
	<SyncStatusBanner />
	{/* Existing Phase 4 controls and list stay below this banner. */}
</div>
```

Keep any existing Phase 4 components and props unchanged; only add the banner at the top of the page content.

- **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- **Step 4: Verify the failure display manually**

With the dev server running, trigger a failure by using a user id that has no Spotify connection:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" "http://localhost:1333/api/cron/sync-for-later-albums?user=missing-user-for-cron-test"
```

Expected: HTTP `404` with `"error":"No Spotify connection found"`.

Then open:

```txt
http://localhost:1333/for-later-albums
```

Expected: a red banner appears with "Last For Later Albums sync failed." and the failure message.

---

## Task 7: End-To-End Verification

**Files:**

- Verify: `src/lib/for-later-albums-cron.test.ts`
- Verify: `src/pages/api/cron/sync-for-later-albums.ts`
- Verify: `src/lib/for-later-albums-sync.ts`
- Verify: `convex/forLaterAlbums.ts`
- Verify: `src/app/for-later-albums/_components/sync-status-banner.tsx`
- Verify: `src/app/for-later-albums/page.tsx`
- Verify: `vercel.json`
- **Step 1: Run helper tests**

Run:

```bash
node --test src/lib/for-later-albums-cron.test.ts
```

Expected: PASS with TAP output ending in `# fail 0`.

- **Step 2: Run Convex codegen**

Run:

```bash
npx convex codegen
```

Expected: PASS and no unresolved generated API references.

- **Step 3: Run TypeScript**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- **Step 4: Run Biome**

Run:

```bash
pnpm check src/lib/for-later-albums-cron.ts src/lib/for-later-albums-cron.test.ts src/pages/api/cron/sync-for-later-albums.ts src/app/for-later-albums/_components/sync-status-banner.tsx vercel.json
```

Expected: PASS with no Biome errors.

- **Step 5: Verify unauthorized cron protection**

Run:

```bash
curl -i http://localhost:1333/api/cron/sync-for-later-albums
```

Expected: HTTP `401` with JSON containing `"error":"Unauthorized"`.

- **Step 6: Verify authorized cron sync**

Run:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" "http://localhost:1333/api/cron/sync-for-later-albums"
```

Expected when `SPOTIFY_SYNC_USER_ID`, `FOR_LATER_SPOTIFY_PLAYLIST_ID`, and the Spotify connection are configured: HTTP `200` with `"success":true`, a `forLaterSyncRuns` row with `source:"cron"` and `status:"success"`, and no duplicated `forLaterAlbumItems`.

- **Step 7: Verify failure observability**

Run:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" "http://localhost:1333/api/cron/sync-for-later-albums?user=missing-user-for-cron-test"
```

Expected: HTTP `404`, a `forLaterSyncRuns` row with `source:"cron"`, `status:"failed"`, and `error:"No Spotify connection found"`, plus a visible red failure banner at `/for-later-albums`.

- **Step 8: Confirm cron leaves discovery status untouched**

After a successful cron sync, spot-check unmatched `forLaterAlbumItems`: `rymDiscoveryStatus` should only change when Phase 2 matching links a scrape, never because cron queued AI work.

---

## Self-Review Checklist

- Phase 5 daily automation is covered by `src/pages/api/cron/sync-for-later-albums.ts` and `vercel.json`.
- `CRON_SECRET` authorization and `SPOTIFY_SYNC_USER_ID` fallback match existing cron patterns.
- Spotify access tokens refresh through the existing `refreshAccessToken` and `api.spotify.updateTokens` flow.
- Cron success and failure outcomes write `forLaterSyncRuns`.
- The UI can show the last failed daily sync through `getForLaterSyncStatus` and `SyncStatusBanner`.
- Daily sync does not duplicate backlog items because ingestion remains in the existing Phase 1 `syncForLaterAlbums` upsert flow.
- Removed rows are only marked inactive by the existing snapshot-aware sync utility after a successful playlist snapshot fetch.
- AI RYM discovery is never triggered by cron or playlist sync; `forLaterSyncRuns.rymDiscoveryQueued` remains `0` until optional future automation is added.


# Music Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Spotify music funnel that ingests curated source playlists, writes new discoveries to a main funnel playlist, writes second-source track repeats to a repeats playlist, and shows run history plus track/album/artist repeat analytics.

**Architecture:** Add Convex tables for settings, source playlists, sync runs, source-run rows, track encounters, and Spotify write idempotency. Put pure repeat/write decision logic in testable TypeScript helpers, keep Convex functions focused on persistence/query boundaries, and orchestrate Spotify reads/writes from Next.js API routes using existing Spotify token patterns.

**Tech Stack:** Convex schema/query/mutation APIs, Next.js App Router API routes, Next.js Pages API cron routes, Spotify Web API helpers, React client components, shadcn/ui, TypeScript, Biome, `node:test` via `pnpm exec tsx --test`.

---

## File Structure

- Modify `convex/schema.ts`: add music funnel tables and indexes.
- Create `convex/musicFunnel.ts`: settings/source CRUD, sync mutations, run queries, repeat analytics queries.
- Create `src/lib/music-funnel-sync-utils.ts`: pure helpers for Spotify track normalization, repeat summary computation, chunking, and write planning.
- Create `src/lib/music-funnel-sync-utils.test.ts`: unit tests for helper behavior.
- Create `src/lib/music-funnel-sync.ts`: Spotify/Convex sync orchestrator.
- Create `src/app/api/music-funnel/sync/route.ts`: manual sync route.
- Create `src/pages/api/cron/sync-music-funnel.ts`: cron sync route.
- Create `src/app/music-funnel/page.tsx`: feature page shell.
- Create `src/app/music-funnel/_components/music-funnel-header.tsx`: title, sync button, last-run summary.
- Create `src/app/music-funnel/_components/music-funnel-settings-card.tsx`: destination playlist settings.
- Create `src/app/music-funnel/_components/music-funnel-sources-card.tsx`: source playlist CRUD.
- Create `src/app/music-funnel/_components/music-funnel-recent-runs.tsx`: run/source-run history.
- Create `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx`: track, album, and artist repeat lists.
- Modify `src/app/layout.tsx` or navigation only if this app has a central nav entry for feature routes; otherwise leave navigation unchanged.

---

### Task 1: Pure Sync Decision Helpers

**Files:**
- Create: `src/lib/music-funnel-sync-utils.ts`
- Create: `src/lib/music-funnel-sync-utils.test.ts`

- [ ] **Step 1: Write tests for normalization, repeat summaries, chunking, and write planning**

Create `src/lib/music-funnel-sync-utils.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	chunkSpotifyUris,
	computeAlbumRepeatSummaries,
	computeArtistRepeatSummaries,
	computeTrackRepeatSummaries,
	normalizePlaylistTrack,
	planPlaylistWrites,
} from "./music-funnel-sync-utils";

const sourceA = "source-a";
const sourceB = "source-b";
const sourceC = "source-c";

function encounter(overrides: {
	sourceId: string;
	spotifyTrackId: string;
	spotifyAlbumId?: string;
	artists?: Array<{ spotifyArtistId: string; name: string }>;
}) {
	return {
		sourceId: overrides.sourceId,
		spotifyTrackId: overrides.spotifyTrackId,
		trackName: `Track ${overrides.spotifyTrackId}`,
		trackUri: `spotify:track:${overrides.spotifyTrackId}`,
		primaryArtistName: overrides.artists?.[0]?.name ?? "Artist One",
		artists:
			overrides.artists ?? [{ spotifyArtistId: "artist-1", name: "Artist One" }],
		spotifyAlbumId: overrides.spotifyAlbumId ?? "album-1",
		albumName: overrides.spotifyAlbumId ?? "Album One",
		albumImageUrl: "https://example.com/cover.jpg",
		firstSeenAt: 1000,
	};
}

test("normalizePlaylistTrack returns metadata needed by the funnel ledger", () => {
	const normalized = normalizePlaylistTrack({
		added_at: "2026-07-04T12:00:00Z",
		track: {
			id: "track-1",
			name: "Cool Song",
			artists: [
				{ id: "artist-1", name: "Artist One" },
				{ id: "artist-2", name: "Artist Two" },
			],
			album: {
				id: "album-1",
				name: "Cool Album",
				images: [{ url: "https://example.com/cover.jpg", height: 640, width: 640 }],
			},
			duration_ms: 180000,
			external_urls: { spotify: "https://open.spotify.com/track/track-1" },
			preview_url: null,
			track_number: 1,
		},
	});

	assert.deepEqual(normalized, {
		spotifyTrackId: "track-1",
		trackName: "Cool Song",
		trackUri: "spotify:track:track-1",
		primaryArtistName: "Artist One",
		artists: [
			{ spotifyArtistId: "artist-1", name: "Artist One" },
			{ spotifyArtistId: "artist-2", name: "Artist Two" },
		],
		spotifyAlbumId: "album-1",
		albumName: "Cool Album",
		albumImageUrl: "https://example.com/cover.jpg",
		playlistAddedAt: Date.parse("2026-07-04T12:00:00Z"),
	});
});

test("normalizePlaylistTrack returns null for local or unavailable tracks", () => {
	assert.equal(normalizePlaylistTrack({ added_at: "2026-07-04T12:00:00Z", track: null }), null);
});

test("computeTrackRepeatSummaries counts distinct sources per track", () => {
	const repeats = computeTrackRepeatSummaries([
		encounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
		encounter({ sourceId: sourceB, spotifyTrackId: "track-1" }),
		encounter({ sourceId: sourceB, spotifyTrackId: "track-1" }),
		encounter({ sourceId: sourceC, spotifyTrackId: "track-2" }),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyTrackId, "track-1");
	assert.deepEqual(repeats[0]?.sourceIds.sort(), [sourceA, sourceB]);
});

test("computeAlbumRepeatSummaries counts one source once per album", () => {
	const repeats = computeAlbumRepeatSummaries([
		encounter({ sourceId: sourceA, spotifyTrackId: "track-1", spotifyAlbumId: "album-1" }),
		encounter({ sourceId: sourceA, spotifyTrackId: "track-2", spotifyAlbumId: "album-1" }),
		encounter({ sourceId: sourceB, spotifyTrackId: "track-3", spotifyAlbumId: "album-1" }),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyAlbumId, "album-1");
	assert.deepEqual(repeats[0]?.sourceIds.sort(), [sourceA, sourceB]);
	assert.equal(repeats[0]?.contributingTrackCount, 3);
});

test("computeArtistRepeatSummaries counts every credited artist", () => {
	const repeats = computeArtistRepeatSummaries([
		encounter({
			sourceId: sourceA,
			spotifyTrackId: "track-1",
			artists: [
				{ spotifyArtistId: "artist-1", name: "Artist One" },
				{ spotifyArtistId: "artist-2", name: "Artist Two" },
			],
		}),
		encounter({
			sourceId: sourceB,
			spotifyTrackId: "track-2",
			artists: [{ spotifyArtistId: "artist-2", name: "Artist Two" }],
		}),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyArtistId, "artist-2");
	assert.deepEqual(repeats[0]?.sourceIds.sort(), [sourceA, sourceB]);
});

test("planPlaylistWrites queues first global sightings for the main playlist", () => {
	const planned = planPlaylistWrites({
		candidateEncounters: [
			encounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			encounter({ sourceId: sourceA, spotifyTrackId: "track-4" }),
		],
		totalSourceCountsByTrackId: new Map([
			["track-1", 1],
			["track-4", 1],
		]),
		alreadyWrittenMainTrackIds: new Set(["track-4"]),
		alreadyWrittenRepeatTrackIds: new Set(),
	});

	assert.deepEqual(
		planned.mainWrites.map((write) => write.spotifyTrackId),
		["track-1"],
	);
	assert.deepEqual(planned.repeatWrites, []);
	assert.equal(planned.mainWrites[0]?.reason, "first_seen");
});

test("planPlaylistWrites queues second-source tracks for the repeats playlist", () => {
	const planned = planPlaylistWrites({
		candidateEncounters: [
			encounter({ sourceId: sourceB, spotifyTrackId: "track-2" }),
			encounter({ sourceId: sourceB, spotifyTrackId: "track-5" }),
		],
		totalSourceCountsByTrackId: new Map([
			["track-2", 2],
			["track-5", 2],
		]),
		alreadyWrittenMainTrackIds: new Set(["track-2", "track-5"]),
		alreadyWrittenRepeatTrackIds: new Set(["track-5"]),
	});

	assert.deepEqual(planned.mainWrites, []);
	assert.deepEqual(
		planned.repeatWrites.map((write) => write.spotifyTrackId),
		["track-2"],
	);
	assert.equal(planned.repeatWrites[0]?.reason, "second_source_repeat");
});

test("planPlaylistWrites can catch up missed historical main and repeat writes", () => {
	const planned = planPlaylistWrites({
		candidateEncounters: [
			encounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			encounter({ sourceId: sourceB, spotifyTrackId: "track-2" }),
		],
		totalSourceCountsByTrackId: new Map([
			["track-1", 1],
			["track-2", 2],
		]),
		alreadyWrittenMainTrackIds: new Set(),
		alreadyWrittenRepeatTrackIds: new Set(),
	});

	assert.deepEqual(
		planned.mainWrites.map((write) => write.spotifyTrackId),
		["track-1", "track-2"],
	);
	assert.deepEqual(
		planned.repeatWrites.map((write) => write.spotifyTrackId),
		["track-2"],
	);
});

test("planPlaylistWrites dedupes duplicate candidate encounters for the same track", () => {
	const planned = planPlaylistWrites({
		candidateEncounters: [
			encounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			encounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			encounter({ sourceId: sourceB, spotifyTrackId: "track-1" }),
		],
		totalSourceCountsByTrackId: new Map([["track-1", 2]]),
		alreadyWrittenMainTrackIds: new Set(),
		alreadyWrittenRepeatTrackIds: new Set(),
	});

	assert.deepEqual(
		planned.mainWrites.map((write) => write.spotifyTrackId),
		["track-1"],
	);
	assert.deepEqual(
		planned.repeatWrites.map((write) => write.spotifyTrackId),
		["track-1"],
	);
});

test("chunkSpotifyUris chunks at Spotify's 100 URI playlist add limit", () => {
	const uris = Array.from({ length: 205 }, (_, index) => `spotify:track:${index}`);
	const chunks = chunkSpotifyUris(uris);

	assert.equal(chunks.length, 3);
	assert.equal(chunks[0]?.length, 100);
	assert.equal(chunks[1]?.length, 100);
	assert.equal(chunks[2]?.length, 5);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm exec tsx --test src/lib/music-funnel-sync-utils.test.ts
```

Expected: fails because `src/lib/music-funnel-sync-utils.ts` does not exist yet.

- [ ] **Step 3: Implement helper types and functions**

Create `src/lib/music-funnel-sync-utils.ts`:

```typescript
import type { PlaylistTrackItem } from "~/lib/spotify";

export type MusicFunnelArtist = {
	spotifyArtistId: string;
	name: string;
};

export type NormalizedMusicFunnelTrack = {
	spotifyTrackId: string;
	trackName: string;
	trackUri: string;
	primaryArtistName: string;
	artists: MusicFunnelArtist[];
	spotifyAlbumId: string;
	albumName: string;
	albumImageUrl?: string;
	playlistAddedAt?: number;
};

export type MusicFunnelEncounterLike = NormalizedMusicFunnelTrack & {
	sourceId: string;
	firstSeenAt: number;
};

export type RepeatSummary = {
	sourceIds: string[];
	firstSeenAt: number;
	latestSeenAt: number;
};

export type TrackRepeatSummary = RepeatSummary & {
	spotifyTrackId: string;
	trackName: string;
	primaryArtistName: string;
	albumName: string;
	albumImageUrl?: string;
};

export type AlbumRepeatSummary = RepeatSummary & {
	spotifyAlbumId: string;
	albumName: string;
	primaryArtistName: string;
	albumImageUrl?: string;
	contributingTrackCount: number;
};

export type ArtistRepeatSummary = RepeatSummary & {
	spotifyArtistId: string;
	name: string;
	contributingTrackCount: number;
};

export type PlannedPlaylistWrite = {
	spotifyTrackId: string;
	trackUri: string;
	reason: "first_seen" | "second_source_repeat";
};

export function normalizePlaylistTrack(
	item: PlaylistTrackItem,
): NormalizedMusicFunnelTrack | null {
	if (!item.track) {
		return null;
	}

	const artists = item.track.artists.map((artist) => ({
		spotifyArtistId: artist.id,
		name: artist.name,
	}));
	const imageUrl = item.track.album.images[0]?.url;
	const parsedAddedAt = Date.parse(item.added_at);

	return {
		spotifyTrackId: item.track.id,
		trackName: item.track.name,
		trackUri: `spotify:track:${item.track.id}`,
		primaryArtistName: artists[0]?.name ?? "Unknown Artist",
		artists,
		spotifyAlbumId: item.track.album.id,
		albumName: item.track.album.name,
		albumImageUrl: imageUrl,
		playlistAddedAt: Number.isNaN(parsedAddedAt) ? undefined : parsedAddedAt,
	};
}

export function computeTrackRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): TrackRepeatSummary[] {
	const byTrack = new Map<string, MusicFunnelEncounterLike[]>();
	for (const encounter of encounters) {
		const rows = byTrack.get(encounter.spotifyTrackId) ?? [];
		rows.push(encounter);
		byTrack.set(encounter.spotifyTrackId, rows);
	}

	return [...byTrack.entries()]
		.map(([spotifyTrackId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			return {
				spotifyTrackId,
				trackName: first.trackName,
				primaryArtistName: first.primaryArtistName,
				albumName: first.albumName,
				albumImageUrl: first.albumImageUrl,
				sourceIds,
				firstSeenAt: Math.min(...rows.map((row) => row.firstSeenAt)),
				latestSeenAt: Math.max(...rows.map((row) => row.firstSeenAt)),
			};
		})
		.filter((summary): summary is TrackRepeatSummary => summary !== null)
		.sort((a, b) => b.sourceIds.length - a.sourceIds.length || b.latestSeenAt - a.latestSeenAt);
}

export function computeAlbumRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): AlbumRepeatSummary[] {
	const byAlbum = new Map<string, MusicFunnelEncounterLike[]>();
	for (const encounter of encounters) {
		const rows = byAlbum.get(encounter.spotifyAlbumId) ?? [];
		rows.push(encounter);
		byAlbum.set(encounter.spotifyAlbumId, rows);
	}

	return [...byAlbum.entries()]
		.map(([spotifyAlbumId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			return {
				spotifyAlbumId,
				albumName: first.albumName,
				primaryArtistName: first.primaryArtistName,
				albumImageUrl: first.albumImageUrl,
				sourceIds,
				firstSeenAt: Math.min(...rows.map((row) => row.firstSeenAt)),
				latestSeenAt: Math.max(...rows.map((row) => row.firstSeenAt)),
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId)).size,
			};
		})
		.filter((summary): summary is AlbumRepeatSummary => summary !== null)
		.sort((a, b) => b.sourceIds.length - a.sourceIds.length || b.latestSeenAt - a.latestSeenAt);
}

export function computeArtistRepeatSummaries(
	encounters: MusicFunnelEncounterLike[],
): ArtistRepeatSummary[] {
	const rowsByArtist = new Map<
		string,
		{ name: string; sourceId: string; spotifyTrackId: string; firstSeenAt: number }[]
	>();

	for (const encounter of encounters) {
		for (const artist of encounter.artists) {
			const rows = rowsByArtist.get(artist.spotifyArtistId) ?? [];
			rows.push({
				name: artist.name,
				sourceId: encounter.sourceId,
				spotifyTrackId: encounter.spotifyTrackId,
				firstSeenAt: encounter.firstSeenAt,
			});
			rowsByArtist.set(artist.spotifyArtistId, rows);
		}
	}

	return [...rowsByArtist.entries()]
		.map(([spotifyArtistId, rows]) => {
			const sourceIds = uniqueSorted(rows.map((row) => row.sourceId));
			if (sourceIds.length < 2) {
				return null;
			}
			const first = rows[0];
			if (!first) {
				return null;
			}
			return {
				spotifyArtistId,
				name: first.name,
				sourceIds,
				firstSeenAt: Math.min(...rows.map((row) => row.firstSeenAt)),
				latestSeenAt: Math.max(...rows.map((row) => row.firstSeenAt)),
				contributingTrackCount: new Set(rows.map((row) => row.spotifyTrackId)).size,
			};
		})
		.filter((summary): summary is ArtistRepeatSummary => summary !== null)
		.sort((a, b) => b.sourceIds.length - a.sourceIds.length || b.latestSeenAt - a.latestSeenAt);
}

export function planPlaylistWrites({
	candidateEncounters,
	totalSourceCountsByTrackId,
	alreadyWrittenMainTrackIds,
	alreadyWrittenRepeatTrackIds,
}: {
	candidateEncounters: MusicFunnelEncounterLike[];
	totalSourceCountsByTrackId: Map<string, number>;
	alreadyWrittenMainTrackIds: Set<string>;
	alreadyWrittenRepeatTrackIds: Set<string>;
}): { mainWrites: PlannedPlaylistWrite[]; repeatWrites: PlannedPlaylistWrite[] } {
	const mainWrites: PlannedPlaylistWrite[] = [];
	const repeatWrites: PlannedPlaylistWrite[] = [];
	const plannedMainTrackIds = new Set<string>();
	const plannedRepeatTrackIds = new Set<string>();

	for (const encounter of candidateEncounters) {
		const totalSourceCount =
			totalSourceCountsByTrackId.get(encounter.spotifyTrackId) ?? 0;

		if (
			totalSourceCount >= 1 &&
			!alreadyWrittenMainTrackIds.has(encounter.spotifyTrackId) &&
			!plannedMainTrackIds.has(encounter.spotifyTrackId)
		) {
			mainWrites.push({
				spotifyTrackId: encounter.spotifyTrackId,
				trackUri: encounter.trackUri,
				reason: "first_seen",
			});
			plannedMainTrackIds.add(encounter.spotifyTrackId);
		}

		if (
			totalSourceCount >= 2 &&
			!alreadyWrittenRepeatTrackIds.has(encounter.spotifyTrackId) &&
			!plannedRepeatTrackIds.has(encounter.spotifyTrackId)
		) {
			repeatWrites.push({
				spotifyTrackId: encounter.spotifyTrackId,
				trackUri: encounter.trackUri,
				reason: "second_source_repeat",
			});
			plannedRepeatTrackIds.add(encounter.spotifyTrackId);
		}
	}

	return { mainWrites, repeatWrites };
}

export function chunkSpotifyUris(uris: string[], chunkSize = 100): string[][] {
	const chunks: string[][] = [];
	for (let index = 0; index < uris.length; index += chunkSize) {
		chunks.push(uris.slice(index, index + chunkSize));
	}
	return chunks;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
pnpm exec tsx --test src/lib/music-funnel-sync-utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/music-funnel-sync-utils.ts src/lib/music-funnel-sync-utils.test.ts
git commit -m "test: cover music funnel sync helpers"
```

---

### Task 2: Convex Schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add music funnel tables**

In `convex/schema.ts`, add the following tables near the existing Spotify tables:

```typescript
	musicFunnelSettings: defineTable({
		userId: v.string(),
		mainPlaylistId: v.optional(v.string()),
		repeatsPlaylistId: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_userId", ["userId"]),

	musicFunnelSources: defineTable({
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		displayName: v.string(),
		curatorName: v.string(),
		notes: v.optional(v.string()),
		scheduleHint: v.optional(v.string()),
		isActive: v.boolean(),
		spotifyPlaylistName: v.optional(v.string()),
		spotifyOwnerId: v.optional(v.string()),
		spotifyOwnerName: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		lastSnapshotId: v.optional(v.string()),
		lastTrackCount: v.optional(v.number()),
		lastScannedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_active", ["userId", "isActive"])
		.index("by_userId_spotifyPlaylistId", ["userId", "spotifyPlaylistId"]),

	musicFunnelRuns: defineTable({
		userId: v.string(),
		source: v.union(v.literal("manual"), v.literal("cron")),
		status: v.union(v.literal("success"), v.literal("partial"), v.literal("failed")),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		durationMs: v.optional(v.number()),
		sourcesScanned: v.number(),
		tracksSeen: v.number(),
		newEncounters: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		errors: v.array(v.string()),
	})
		.index("by_userId_startedAt", ["userId", "startedAt"])
		.index("by_userId_status_startedAt", ["userId", "status", "startedAt"]),

	musicFunnelSourceRuns: defineTable({
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		sourceDisplayName: v.string(),
		status: v.union(v.literal("success"), v.literal("failed")),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		durationMs: v.optional(v.number()),
		spotifySnapshotId: v.optional(v.string()),
		tracksFetched: v.number(),
		newEncounters: v.number(),
		alreadySeenFromSource: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		error: v.optional(v.string()),
	})
		.index("by_userId_startedAt", ["userId", "startedAt"])
		.index("by_runId", ["runId"])
		.index("by_sourceId_startedAt", ["sourceId", "startedAt"]),

	musicFunnelTrackEncounters: defineTable({
		userId: v.string(),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.id("musicFunnelSourceRuns"),
		spotifyTrackId: v.string(),
		trackName: v.string(),
		trackUri: v.string(),
		primaryArtistName: v.string(),
		artists: v.array(
			v.object({
				spotifyArtistId: v.string(),
				name: v.string(),
			}),
		),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		playlistAddedAt: v.optional(v.number()),
		firstSeenAt: v.number(),
		createdAt: v.number(),
	})
		.index("by_userId_createdAt", ["userId", "createdAt"])
		.index("by_userId_spotifyTrackId", ["userId", "spotifyTrackId"])
		.index("by_userId_spotifyAlbumId", ["userId", "spotifyAlbumId"])
		.index("by_userId_sourceId_spotifyTrackId", [
			"userId",
			"sourceId",
			"spotifyTrackId",
		])
		.index("by_sourceId_createdAt", ["sourceId", "createdAt"]),

	musicFunnelPlaylistWrites: defineTable({
		userId: v.string(),
		kind: v.union(v.literal("main"), v.literal("repeat")),
		spotifyPlaylistId: v.string(),
		spotifyTrackId: v.string(),
		trackUri: v.string(),
		reason: v.union(v.literal("first_seen"), v.literal("second_source_repeat")),
		runId: v.id("musicFunnelRuns"),
		sourceRunId: v.optional(v.id("musicFunnelSourceRuns")),
		writtenAt: v.number(),
		spotifySnapshotId: v.optional(v.string()),
	})
		.index("by_userId_kind_spotifyTrackId", ["userId", "kind", "spotifyTrackId"])
		.index("by_userId_writtenAt", ["userId", "writtenAt"])
		.index("by_runId", ["runId"]),
```

- [ ] **Step 2: Run typecheck and confirm generated Convex types accept the schema**

Run:

```bash
pnpm typecheck
```

Expected: typecheck may fail if generated Convex files are stale. If so, run:

```bash
pnpm exec convex codegen
pnpm typecheck
```

Expected after codegen: no schema/type errors from the new tables.

- [ ] **Step 3: Commit Task 2**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat: add music funnel schema"
```

---

### Task 3: Convex Functions And Analytics Queries

**Files:**
- Create: `convex/musicFunnel.ts`

- [ ] **Step 1: Create validators, helper types, and settings/source CRUD**

Create `convex/musicFunnel.ts` with the imports, validators, and first functions:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const syncSourceValidator = v.union(v.literal("manual"), v.literal("cron"));
const runStatusValidator = v.union(
	v.literal("success"),
	v.literal("partial"),
	v.literal("failed"),
);
const sourceRunStatusValidator = v.union(v.literal("success"), v.literal("failed"));
const writeKindValidator = v.union(v.literal("main"), v.literal("repeat"));
const writeReasonValidator = v.union(
	v.literal("first_seen"),
	v.literal("second_source_repeat"),
);
const artistValidator = v.object({
	spotifyArtistId: v.string(),
	name: v.string(),
});
const sourceReturnValidator = v.object({
	_id: v.id("musicFunnelSources"),
	_creationTime: v.number(),
	userId: v.string(),
	spotifyPlaylistId: v.string(),
	displayName: v.string(),
	curatorName: v.string(),
	notes: v.optional(v.string()),
	scheduleHint: v.optional(v.string()),
	isActive: v.boolean(),
	spotifyPlaylistName: v.optional(v.string()),
	spotifyOwnerId: v.optional(v.string()),
	spotifyOwnerName: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	lastSnapshotId: v.optional(v.string()),
	lastTrackCount: v.optional(v.number()),
	lastScannedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
});
const encounterInputValidator = v.object({
	spotifyTrackId: v.string(),
	trackName: v.string(),
	trackUri: v.string(),
	primaryArtistName: v.string(),
	artists: v.array(artistValidator),
	spotifyAlbumId: v.string(),
	albumName: v.string(),
	albumImageUrl: v.optional(v.string()),
	playlistAddedAt: v.optional(v.number()),
});

export const getSettings = query({
	args: { userId: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("musicFunnelSettings"),
			_creationTime: v.number(),
			userId: v.string(),
			mainPlaylistId: v.optional(v.string()),
			repeatsPlaylistId: v.optional(v.string()),
			createdAt: v.number(),
			updatedAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("musicFunnelSettings")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();
	},
});

export const upsertSettings = mutation({
	args: {
		userId: v.string(),
		mainPlaylistId: v.optional(v.string()),
		repeatsPlaylistId: v.optional(v.string()),
	},
	returns: v.id("musicFunnelSettings"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSettings">> => {
		const now = Date.now();
		const existing = await ctx.db
			.query("musicFunnelSettings")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				mainPlaylistId: emptyToUndefined(args.mainPlaylistId),
				repeatsPlaylistId: emptyToUndefined(args.repeatsPlaylistId),
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("musicFunnelSettings", {
			userId: args.userId,
			mainPlaylistId: emptyToUndefined(args.mainPlaylistId),
			repeatsPlaylistId: emptyToUndefined(args.repeatsPlaylistId),
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const listSources = query({
	args: { userId: v.string(), activeOnly: v.optional(v.boolean()) },
	returns: v.array(sourceReturnValidator),
	handler: async (ctx, args): Promise<Doc<"musicFunnelSources">[]> => {
		if (args.activeOnly) {
			return await ctx.db
				.query("musicFunnelSources")
				.withIndex("by_userId_active", (q) =>
					q.eq("userId", args.userId).eq("isActive", true),
				)
				.collect();
		}

		return await ctx.db
			.query("musicFunnelSources")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const upsertSource = mutation({
	args: {
		userId: v.string(),
		sourceId: v.optional(v.id("musicFunnelSources")),
		spotifyPlaylistId: v.string(),
		displayName: v.string(),
		curatorName: v.string(),
		notes: v.optional(v.string()),
		scheduleHint: v.optional(v.string()),
		isActive: v.boolean(),
	},
	returns: v.id("musicFunnelSources"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSources">> => {
		const now = Date.now();
		const patch = {
			spotifyPlaylistId: args.spotifyPlaylistId.trim(),
			displayName: args.displayName.trim(),
			curatorName: args.curatorName.trim(),
			notes: emptyToUndefined(args.notes),
			scheduleHint: emptyToUndefined(args.scheduleHint),
			isActive: args.isActive,
			updatedAt: now,
		};

		if (args.sourceId) {
			await ctx.db.patch(args.sourceId, patch);
			return args.sourceId;
		}

		return await ctx.db.insert("musicFunnelSources", {
			userId: args.userId,
			...patch,
			createdAt: now,
		});
	},
});

export const setSourceActive = mutation({
	args: {
		sourceId: v.id("musicFunnelSources"),
		isActive: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.sourceId, {
			isActive: args.isActive,
			updatedAt: Date.now(),
		});
		return null;
	},
});

function emptyToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
```

- [ ] **Step 2: Add sync mutations**

In `convex/musicFunnel.ts`, add:

```typescript
export const startRun = mutation({
	args: { userId: v.string(), source: syncSourceValidator, startedAt: v.number() },
	returns: v.id("musicFunnelRuns"),
	handler: async (ctx, args): Promise<Id<"musicFunnelRuns">> => {
		return await ctx.db.insert("musicFunnelRuns", {
			userId: args.userId,
			source: args.source,
			status: "failed",
			startedAt: args.startedAt,
			sourcesScanned: 0,
			tracksSeen: 0,
			newEncounters: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [],
		});
	},
});

export const finishRun = mutation({
	args: {
		runId: v.id("musicFunnelRuns"),
		status: runStatusValidator,
		completedAt: v.number(),
		durationMs: v.number(),
		sourcesScanned: v.number(),
		tracksSeen: v.number(),
		newEncounters: v.number(),
		newTracksAddedToMain: v.number(),
		repeatTracksAdded: v.number(),
		trackRepeatsFound: v.number(),
		albumRepeatsFound: v.number(),
		artistRepeatsFound: v.number(),
		errors: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		await ctx.db.patch(args.runId, {
			status: args.status,
			completedAt: args.completedAt,
			durationMs: args.durationMs,
			sourcesScanned: args.sourcesScanned,
			tracksSeen: args.tracksSeen,
			newEncounters: args.newEncounters,
			newTracksAddedToMain: args.newTracksAddedToMain,
			repeatTracksAdded: args.repeatTracksAdded,
			trackRepeatsFound: args.trackRepeatsFound,
			albumRepeatsFound: args.albumRepeatsFound,
			artistRepeatsFound: args.artistRepeatsFound,
			errors: args.errors,
		});
		return null;
	},
});

export const startSourceRun = mutation({
	args: {
		userId: v.string(),
		runId: v.id("musicFunnelRuns"),
		sourceId: v.id("musicFunnelSources"),
		spotifyPlaylistId: v.string(),
		sourceDisplayName: v.string(),
		startedAt: v.number(),
	},
	returns: v.id("musicFunnelSourceRuns"),
	handler: async (ctx, args): Promise<Id<"musicFunnelSourceRuns">> => {
		return await ctx.db.insert("musicFunnelSourceRuns", {
			userId: args.userId,
			runId: args.runId,
			sourceId: args.sourceId,
			spotifyPlaylistId: args.spotifyPlaylistId,
			sourceDisplayName: args.sourceDisplayName,
			status: "failed",
			startedAt: args.startedAt,
			tracksFetched: 0,
			newEncounters: 0,
			alreadySeenFromSource: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		});
	},
});
```

Add matching `finishSourceRun`, `updateSourceSnapshot`, `recordTrackEncounters`, and `recordPlaylistWrites` mutations. `recordTrackEncounters` must check `by_userId_sourceId_spotifyTrackId` before insert and return inserted encounter-like rows, `writeCandidateEncounters`, `writeCandidateTrackIds`, and `totalSourceCounts` for the candidate track IDs after insertion. `recordPlaylistWrites` must check `by_userId_kind_spotifyTrackId` before insert.

- [ ] **Step 3: Add UI and analytics queries**

Add these query exports:

```typescript
export const getUiSummary = query({
	args: { userId: v.string() },
	returns: v.object({
		activeSourceCount: v.number(),
		totalEncounterCount: v.number(),
		lastRun: v.union(
			v.null(),
			v.object({
				_id: v.id("musicFunnelRuns"),
				status: runStatusValidator,
				startedAt: v.number(),
				completedAt: v.optional(v.number()),
				sourcesScanned: v.number(),
				newEncounters: v.number(),
				newTracksAddedToMain: v.number(),
				repeatTracksAdded: v.number(),
				errors: v.array(v.string()),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const activeSources = await ctx.db
			.query("musicFunnelSources")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const encounters = await ctx.db
			.query("musicFunnelTrackEncounters")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.collect();
		const lastRun = await ctx.db
			.query("musicFunnelRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		return {
			activeSourceCount: activeSources.length,
			totalEncounterCount: encounters.length,
			lastRun: lastRun
				? {
						_id: lastRun._id,
						status: lastRun.status,
						startedAt: lastRun.startedAt,
						completedAt: lastRun.completedAt,
						sourcesScanned: lastRun.sourcesScanned,
						newEncounters: lastRun.newEncounters,
						newTracksAddedToMain: lastRun.newTracksAddedToMain,
						repeatTracksAdded: lastRun.repeatTracksAdded,
						errors: lastRun.errors,
					}
				: null,
		};
	},
});
```

Add `listRecentRuns`, `listRunSourceRuns`, `listTrackRepeats`, `listAlbumRepeats`, `listArtistRepeats`, `listEncounterRowsForAnalytics`, and `getWrittenTrackIds`. Keep `take()` limits reasonable, such as 20 recent runs, 50 repeat rows, and 5000 encounter rows for the first analytics implementation because the first version targets a small source set. `getWrittenTrackIds` should accept `{ userId, kind, spotifyTrackIds }` and return the subset already present in `musicFunnelPlaylistWrites`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors in `convex/musicFunnel.ts`.

- [ ] **Step 5: Commit Task 3**

```bash
git add convex/musicFunnel.ts
git commit -m "feat: add music funnel Convex functions"
```

---

### Task 4: Sync Orchestrator And API Routes

**Files:**
- Create: `src/lib/music-funnel-sync.ts`
- Create: `src/app/api/music-funnel/sync/route.ts`
- Create: `src/pages/api/cron/sync-music-funnel.ts`

- [ ] **Step 1: Implement sync orchestrator types and setup**

Create `src/lib/music-funnel-sync.ts`:

```typescript
import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env.js";
import {
	addTracksToPlaylist,
	getAllPlaylistTrackItems,
	getPlaylist,
} from "~/lib/spotify";
import {
	chunkSpotifyUris,
	computeAlbumRepeatSummaries,
	computeArtistRepeatSummaries,
	computeTrackRepeatSummaries,
	normalizePlaylistTrack,
	planPlaylistWrites,
} from "~/lib/music-funnel-sync-utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type MusicFunnelSyncResult = {
	success: boolean;
	status: "success" | "partial" | "failed";
	runId?: Id<"musicFunnelRuns">;
	durationMs: number;
	sourcesScanned: number;
	tracksSeen: number;
	newEncounters: number;
	newTracksAddedToMain: number;
	repeatTracksAdded: number;
	trackRepeatsFound: number;
	albumRepeatsFound: number;
	artistRepeatsFound: number;
	errors: string[];
};

export async function syncMusicFunnel({
	accessToken,
	userId,
	source,
}: {
	accessToken: string;
	userId: string;
	source: "manual" | "cron";
}): Promise<MusicFunnelSyncResult> {
	const startedAt = Date.now();
	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const runId = await convex.mutation(api.musicFunnel.startRun, {
		userId,
		source,
		startedAt,
	});

	const errors: string[] = [];
	let sourcesScanned = 0;
	let tracksSeen = 0;
	let newEncounters = 0;
	let newTracksAddedToMain = 0;
	let repeatTracksAdded = 0;

	try {
		const settings = await convex.query(api.musicFunnel.getSettings, { userId });
		const sources = await convex.query(api.musicFunnel.listSources, {
			userId,
			activeOnly: true,
		});

		for (const musicFunnelSource of sources) {
			const result = await syncSourcePlaylist({
				convex,
				accessToken,
				userId,
				runId,
				source: musicFunnelSource,
				mainPlaylistId: settings?.mainPlaylistId,
				repeatsPlaylistId: settings?.repeatsPlaylistId,
			});
			sourcesScanned += result.sourceSucceeded ? 1 : 0;
			tracksSeen += result.tracksSeen;
			newEncounters += result.newEncounters;
			newTracksAddedToMain += result.newTracksAddedToMain;
			repeatTracksAdded += result.repeatTracksAdded;
			errors.push(...result.errors);
		}

		const allEncounters = await convex.query(api.musicFunnel.listEncounterRowsForAnalytics, {
			userId,
			limit: 5000,
		});
		const trackRepeatsFound = computeTrackRepeatSummaries(allEncounters).length;
		const albumRepeatsFound = computeAlbumRepeatSummaries(allEncounters).length;
		const artistRepeatsFound = computeArtistRepeatSummaries(allEncounters).length;
		const status = sourcesScanned === 0 ? "failed" : errors.length > 0 ? "partial" : "success";
		const completedAt = Date.now();

		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status,
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		});

		return {
			success: status !== "failed",
			status,
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound,
			albumRepeatsFound,
			artistRepeatsFound,
			errors,
		};
	} catch (error) {
		const completedAt = Date.now();
		const message = error instanceof Error ? error.message : "Unknown music funnel sync error";
		await convex.mutation(api.musicFunnel.finishRun, {
			runId,
			status: "failed",
			completedAt,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		});
		return {
			success: false,
			status: "failed",
			runId,
			durationMs: completedAt - startedAt,
			sourcesScanned,
			tracksSeen,
			newEncounters,
			newTracksAddedToMain,
			repeatTracksAdded,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			errors: [...errors, message],
		};
	}
}
```

In the same file, add `syncSourcePlaylist`:

```typescript
async function syncSourcePlaylist({
	convex,
	accessToken,
	userId,
	runId,
	source,
	mainPlaylistId,
	repeatsPlaylistId,
}: {
	convex: ConvexHttpClient;
	accessToken: string;
	userId: string;
	runId: Id<"musicFunnelRuns">;
	source: {
		_id: Id<"musicFunnelSources">;
		spotifyPlaylistId: string;
		displayName: string;
	};
	mainPlaylistId?: string;
	repeatsPlaylistId?: string;
}): Promise<{
	sourceSucceeded: boolean;
	tracksSeen: number;
	newEncounters: number;
	newTracksAddedToMain: number;
	repeatTracksAdded: number;
	errors: string[];
}> {
	const sourceStartedAt = Date.now();
	const sourceRunId = await convex.mutation(api.musicFunnel.startSourceRun, {
		userId,
		runId,
		sourceId: source._id,
		spotifyPlaylistId: source.spotifyPlaylistId,
		sourceDisplayName: source.displayName,
		startedAt: sourceStartedAt,
	});

	try {
		const [playlist, trackCollection] = await Promise.all([
			getPlaylist(accessToken, source.spotifyPlaylistId),
			getAllPlaylistTrackItems(accessToken, source.spotifyPlaylistId),
		]);
		const normalizedTracks = trackCollection.items
			.map((item) => normalizePlaylistTrack(item))
			.filter((track): track is NonNullable<typeof track> => track !== null);

		const encounterResult = await convex.mutation(
			api.musicFunnel.recordTrackEncounters,
			{
				userId,
				runId,
				sourceRunId,
				sourceId: source._id,
				spotifyPlaylistId: source.spotifyPlaylistId,
				seenAt: sourceStartedAt,
				tracks: normalizedTracks,
			},
		);

		const mainAlreadyWritten = await convex.query(
			api.musicFunnel.getWrittenTrackIds,
			{
				userId,
				kind: "main",
				spotifyTrackIds: encounterResult.writeCandidateTrackIds,
			},
		);
		const repeatAlreadyWritten = await convex.query(
			api.musicFunnel.getWrittenTrackIds,
			{
				userId,
				kind: "repeat",
				spotifyTrackIds: encounterResult.writeCandidateTrackIds,
			},
		);
		const plannedWrites = planPlaylistWrites({
			candidateEncounters: encounterResult.writeCandidateEncounters,
			totalSourceCountsByTrackId: new Map(
				encounterResult.totalSourceCounts.map(
					(row: { spotifyTrackId: string; sourceCount: number }) => [
						row.spotifyTrackId,
						row.sourceCount,
					],
				),
			),
			alreadyWrittenMainTrackIds: new Set(mainAlreadyWritten),
			alreadyWrittenRepeatTrackIds: new Set(repeatAlreadyWritten),
		});

		const mainWrites = mainPlaylistId
			? await writeTracksToSpotifyPlaylist({
					convex,
					accessToken,
					userId,
					runId,
					sourceRunId,
					playlistId: mainPlaylistId,
					kind: "main",
					writes: plannedWrites.mainWrites,
				})
			: 0;
		const repeatWrites = repeatsPlaylistId
			? await writeTracksToSpotifyPlaylist({
					convex,
					accessToken,
					userId,
					runId,
					sourceRunId,
					playlistId: repeatsPlaylistId,
					kind: "repeat",
					writes: plannedWrites.repeatWrites,
				})
			: 0;

		await convex.mutation(api.musicFunnel.updateSourceSnapshot, {
			sourceId: source._id,
			spotifyPlaylistName: playlist.name,
			spotifyOwnerId: playlist.owner.id,
			spotifyOwnerName: playlist.owner.display_name,
			imageUrl: playlist.images[0]?.url,
			lastSnapshotId: playlist.snapshot_id,
			lastTrackCount: playlist.tracks.total,
			lastScannedAt: sourceStartedAt,
		});
		await convex.mutation(api.musicFunnel.finishSourceRun, {
			sourceRunId,
			status: "success",
			completedAt: Date.now(),
			durationMs: Date.now() - sourceStartedAt,
			spotifySnapshotId: playlist.snapshot_id,
			tracksFetched: normalizedTracks.length,
			newEncounters: encounterResult.insertedEncounters.length,
			alreadySeenFromSource:
				normalizedTracks.length - encounterResult.insertedEncounters.length,
			newTracksAddedToMain: mainWrites,
			repeatTracksAdded: repeatWrites,
			trackRepeatsFound: plannedWrites.repeatWrites.length,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		});

		return {
			sourceSucceeded: true,
			tracksSeen: normalizedTracks.length,
			newEncounters: encounterResult.insertedEncounters.length,
			newTracksAddedToMain: mainWrites,
			repeatTracksAdded: repeatWrites,
			errors: [],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown source sync error";
		await convex.mutation(api.musicFunnel.finishSourceRun, {
			sourceRunId,
			status: "failed",
			completedAt: Date.now(),
			durationMs: Date.now() - sourceStartedAt,
			tracksFetched: 0,
			newEncounters: 0,
			alreadySeenFromSource: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
			error: message,
		});

		return {
			sourceSucceeded: false,
			tracksSeen: 0,
			newEncounters: 0,
			newTracksAddedToMain: 0,
			repeatTracksAdded: 0,
			errors: [`${source.displayName}: ${message}`],
		};
	}
}

async function writeTracksToSpotifyPlaylist({
	convex,
	accessToken,
	userId,
	runId,
	sourceRunId,
	playlistId,
	kind,
	writes,
}: {
	convex: ConvexHttpClient;
	accessToken: string;
	userId: string;
	runId: Id<"musicFunnelRuns">;
	sourceRunId: Id<"musicFunnelSourceRuns">;
	playlistId: string;
	kind: "main" | "repeat";
	writes: Array<{
		spotifyTrackId: string;
		trackUri: string;
		reason: "first_seen" | "second_source_repeat";
	}>;
}): Promise<number> {
	let written = 0;
	for (const chunk of chunkSpotifyUris(writes.map((write) => write.trackUri))) {
		const response = await addTracksToPlaylist(accessToken, playlistId, chunk);
		const chunkWrites = writes.filter((write) => chunk.includes(write.trackUri));
		await convex.mutation(api.musicFunnel.recordPlaylistWrites, {
			userId,
			runId,
			sourceRunId,
			kind,
			spotifyPlaylistId: playlistId,
			spotifySnapshotId: response.snapshot_id,
			writes: chunkWrites,
			writtenAt: Date.now(),
		});
		written += chunkWrites.length;
	}
	return written;
}
```

When implementing, move any repeated inline object types into named local types if TypeScript inference becomes hard to read.

- [ ] **Step 2: Add manual sync route**

Create `src/app/api/music-funnel/sync/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { syncMusicFunnel } from "~/lib/music-funnel-sync";

export async function POST(request: Request): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	if (!accessToken) {
		return NextResponse.json({ error: "Missing Spotify access token" }, { status: 401 });
	}

	const body = (await request.json()) as { userId?: string };
	if (!body.userId) {
		return NextResponse.json({ error: "Missing userId" }, { status: 400 });
	}

	const result = await syncMusicFunnel({
		accessToken,
		userId: body.userId,
		source: "manual",
	});

	return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
```

- [ ] **Step 3: Add cron route**

Create `src/pages/api/cron/sync-music-funnel.ts`:

```typescript
import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env";
import { refreshAccessToken } from "~/lib/spotify";
import { syncMusicFunnel } from "~/lib/music-funnel-sync";
import { api } from "../../../../convex/_generated/api";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userParam = req.query.user;
	const userId =
		typeof userParam === "string" && userParam.trim()
			? userParam.trim()
			: env.SPOTIFY_SYNC_USER_ID;

	try {
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const connection = await convex.query(api.spotify.getConnection, { userId });
		if (!connection) {
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		let accessToken = connection.accessToken;
		if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
			const tokens = await refreshAccessToken(connection.refreshToken);
			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
			accessToken = tokens.access_token;
		}

		const result = await syncMusicFunnel({ accessToken, userId, source: "cron" });
		return res.status(result.success ? 200 : 500).json({ success: result.success, result });
	} catch (error) {
		return res.status(500).json({
			error: "Music funnel sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors in new sync/API files.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/lib/music-funnel-sync.ts src/app/api/music-funnel/sync/route.ts src/pages/api/cron/sync-music-funnel.ts
git commit -m "feat: add music funnel sync routes"
```

---

### Task 5: Music Funnel UI

**Files:**
- Create: `src/app/music-funnel/page.tsx`
- Create: `src/app/music-funnel/_components/music-funnel-header.tsx`
- Create: `src/app/music-funnel/_components/music-funnel-settings-card.tsx`
- Create: `src/app/music-funnel/_components/music-funnel-sources-card.tsx`
- Create: `src/app/music-funnel/_components/music-funnel-recent-runs.tsx`
- Create: `src/app/music-funnel/_components/music-funnel-repeat-lists.tsx`

- [ ] **Step 1: Create page shell**

Create `src/app/music-funnel/page.tsx`:

```typescript
"use client";

import { useQuery } from "convex/react";
import { LoginPrompt } from "~/components/login-prompt";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { MusicFunnelHeader } from "./_components/music-funnel-header";
import { MusicFunnelRecentRuns } from "./_components/music-funnel-recent-runs";
import { MusicFunnelRepeatLists } from "./_components/music-funnel-repeat-lists";
import { MusicFunnelSettingsCard } from "./_components/music-funnel-settings-card";
import { MusicFunnelSourcesCard } from "./_components/music-funnel-sources-card";

export default function MusicFunnelPage() {
	const {
		userId,
		isAuthenticated,
		isConnected,
		displayName,
		getValidAccessToken,
		isLoading,
	} = useSpotifyAuth();

	const summary = useQuery(
		api.musicFunnel.getUiSummary,
		userId ? { userId } : "skip",
	);
	const settings = useQuery(
		api.musicFunnel.getSettings,
		userId ? { userId } : "skip",
	);
	const sources = useQuery(
		api.musicFunnel.listSources,
		userId ? { userId } : "skip",
	);

	if (isLoading) {
		return <div className="container mx-auto max-w-6xl p-6">Loading...</div>;
	}

	if (!isAuthenticated || !userId) {
		return <LoginPrompt />;
	}

	if (!isConnected) {
		return <LoginPrompt message="Connect Spotify to build your music funnel." />;
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 p-6">
			<MusicFunnelHeader
				userId={userId}
				spotifyDisplayName={displayName}
				getValidAccessToken={getValidAccessToken}
				summary={summary}
			/>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
				<div className="space-y-6">
					<MusicFunnelRecentRuns userId={userId} />
					<MusicFunnelRepeatLists userId={userId} />
				</div>
				<div className="space-y-6">
					<MusicFunnelSettingsCard userId={userId} settings={settings} />
					<MusicFunnelSourcesCard userId={userId} sources={sources} />
				</div>
			</div>
		</div>
	);
}
```

If `LoginPrompt` does not accept `message`, use the existing supported props from the component instead.

- [ ] **Step 2: Create header with manual sync**

Create `src/app/music-funnel/_components/music-funnel-header.tsx`:

```typescript
"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

type MusicFunnelSummary = {
	activeSourceCount: number;
	totalEncounterCount: number;
	lastRun: {
		status: "success" | "partial" | "failed";
		startedAt: number;
		completedAt?: number;
		newEncounters: number;
		newTracksAddedToMain: number;
		repeatTracksAdded: number;
		errors: string[];
	} | null;
};

export function MusicFunnelHeader({
	userId,
	spotifyDisplayName,
	getValidAccessToken,
	summary,
}: {
	userId: string;
	spotifyDisplayName?: string;
	getValidAccessToken: () => Promise<string | null>;
	summary?: MusicFunnelSummary;
}) {
	const [isSyncing, setIsSyncing] = useState(false);

	async function handleSync(): Promise<void> {
		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify before syncing");
				return;
			}

			const response = await fetch("/api/music-funnel/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({ userId }),
			});
			const result = (await response.json()) as {
				status?: "success" | "partial" | "failed";
				newEncounters?: number;
				repeatTracksAdded?: number;
				errors?: string[];
			};
			if (!response.ok) {
				throw new Error(result.errors?.[0] ?? "Music funnel sync failed");
			}
			if (result.status === "partial") {
				toast.warning("Music funnel synced with some source errors");
			} else {
				toast.success(
					`Music funnel synced: ${result.newEncounters ?? 0} new, ${result.repeatTracksAdded ?? 0} repeats`,
				);
			}
		} catch (error) {
			console.error("Music funnel sync failed:", error);
			toast.error(error instanceof Error ? error.message : "Could not sync music funnel");
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div>
				<h1 className="font-bold text-3xl">Music Funnel</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					{summary
						? `${summary.activeSourceCount} active sources · ${summary.totalEncounterCount} encounters${spotifyDisplayName ? ` · ${spotifyDisplayName}` : ""}${summary.lastRun?.completedAt ? ` · Last sync ${new Date(summary.lastRun.completedAt).toLocaleString()}` : ""}`
						: "Loading music funnel summary..."}
				</p>
			</div>
			<Button type="button" onClick={() => void handleSync()} disabled={isSyncing}>
				<RefreshCw className={isSyncing ? "size-4 animate-spin" : "size-4"} />
				{isSyncing ? "Syncing..." : "Sync now"}
			</Button>
		</header>
	);
}
```

- [ ] **Step 3: Create settings and source cards**

Create settings and source card components with controlled form inputs and Convex mutations:

```typescript
const upsertSettings = useMutation(api.musicFunnel.upsertSettings);
await upsertSettings({
	userId,
	mainPlaylistId,
	repeatsPlaylistId,
});
```

```typescript
const upsertSource = useMutation(api.musicFunnel.upsertSource);
await upsertSource({
	userId,
	sourceId: editingSourceId,
	spotifyPlaylistId,
	displayName,
	curatorName,
	notes,
	scheduleHint,
	isActive,
});
```

Use `Card`, `Button`, `Input`, `Textarea`, and `Switch` if available in `src/components/ui/`. If `Switch` is not available, use a checkbox input styled with existing card conventions.

- [ ] **Step 4: Create runs and repeat list components**

Create recent run and repeat list components using:

```typescript
const runs = useQuery(api.musicFunnel.listRecentRuns, { userId, limit: 10 });
const trackRepeats = useQuery(api.musicFunnel.listTrackRepeats, { userId, limit: 25 });
const albumRepeats = useQuery(api.musicFunnel.listAlbumRepeats, { userId, limit: 25 });
const artistRepeats = useQuery(api.musicFunnel.listArtistRepeats, { userId, limit: 25 });
```

Render simple cards/tables:

- Recent runs: status, completed time, new encounters, main writes, repeat writes, and errors.
- Track repeats: track, artist, album, source count, source labels.
- Album repeats: album, artist, source count, contributing tracks.
- Artist repeats: artist, source count, contributing tracks.

- [ ] **Step 5: Run typecheck and lint**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: no TypeScript or Biome errors.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/music-funnel
git commit -m "feat: add music funnel page"
```

---

### Task 6: End-To-End Verification And Polish

**Files:**
- Modify any files touched by earlier tasks only when verification reveals concrete issues.

- [ ] **Step 1: Run all available static checks**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: both commands pass.

- [ ] **Step 2: Run helper tests**

Run:

```bash
pnpm exec tsx --test src/lib/music-funnel-sync-utils.test.ts
```

Expected: all helper tests pass.

- [ ] **Step 3: Manually verify the route shape without Spotify writes where possible**

Start the dev server if it is not already running:

```bash
pnpm dev
```

Then verify the UI loads at:

```bash
open http://127.0.0.1:1333/music-funnel
```

Expected:

- Authenticated Spotify user sees the Music Funnel page.
- Settings card saves main and repeats playlist IDs.
- Source card creates, edits, and deactivates a source.
- Recent runs and repeat lists render empty states before the first sync.

- [ ] **Step 4: Manually verify a small real sync**

Configure:

- One main funnel playlist ID.
- One repeats playlist ID.
- One or two source playlists with a small known overlap if available.

Click `Sync now`.

Expected:

- A run row appears.
- Each source gets a source-run row.
- First-time tracks are added to the main funnel playlist once.
- A track recommended by a second distinct source is added to the repeats playlist once.
- Repeat analytics show track, album, and artist rows when there are cross-source matches.

- [ ] **Step 5: Verify cron auth behavior**

With the dev server running, call:

```bash
curl -i http://127.0.0.1:1333/api/cron/sync-music-funnel
```

Expected: `401 Unauthorized`.

Then call with the secret:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:1333/api/cron/sync-music-funnel
```

Expected: `200` for success/partial success or a meaningful `404` if no Spotify connection exists for `SPOTIFY_SYNC_USER_ID`.

- [ ] **Step 6: Commit verification fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: polish music funnel verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: source settings, destination settings, encounter ledger, main writes, repeat writes, run history, track repeats, album repeats, artist repeats, manual sync, and cron sync are covered.
- Placeholder scan: no task should contain unfinished-marker language or vague catch-all implementation instructions.
- Type consistency: `mainPlaylistId`, `repeatsPlaylistId`, `musicFunnelSources`, `musicFunnelRuns`, `musicFunnelSourceRuns`, `musicFunnelTrackEncounters`, and `musicFunnelPlaylistWrites` names must match the spec and schema.
- Scope control: do not add Instagram scraping, notifications, automatic destination playlist creation, or source-specific scheduling in this implementation.

## Execution Choice

Plan complete. Recommended execution is **Subagent-Driven Development**: dispatch one fresh subagent per task, review after each task, and keep this session as the coordinator.

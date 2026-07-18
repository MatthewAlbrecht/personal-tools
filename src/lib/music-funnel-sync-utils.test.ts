import assert from "node:assert/strict";
import test from "node:test";
import {
	chunkSpotifyUris,
	computeAlbumRepeatSummaries,
	computeArtistRepeatSummaries,
	computeTrackRepeatSummaries,
	excludeAlreadyWrittenPlaylistWrites,
	normalizePlaylistTrack,
	pendingPlaylistWritesAfterPresenceCheck,
	planPlaylistWrites,
	qualifiesAsMusicFunnelAlbumRepeat,
} from "./music-funnel-sync-utils";
import type {
	MusicFunnelArtist,
	MusicFunnelEncounterLike,
	SpotifyAlbumType,
} from "./music-funnel-sync-utils";
import type { PlaylistTrackItem } from "./spotify";

const sourceA = "source-a";
const sourceB = "source-b";
const sourceC = "source-c";

function createEncounter({
	sourceId,
	spotifyTrackId,
	spotifyAlbumId = "album-1",
	albumName = "Album One",
	artists = [{ spotifyArtistId: "artist-1", name: "Artist One" }],
	firstSeenAt = 1000,
	spotifyAlbumType = "album" as SpotifyAlbumType | null | undefined,
}: {
	sourceId: string;
	spotifyTrackId: string;
	spotifyAlbumId?: string;
	albumName?: string;
	artists?: MusicFunnelArtist[];
	firstSeenAt?: number;
	spotifyAlbumType?: SpotifyAlbumType | null;
}): MusicFunnelEncounterLike {
	const encounter: MusicFunnelEncounterLike = {
		sourceId,
		spotifyTrackId,
		trackName: `Track ${spotifyTrackId}`,
		trackUri: `spotify:track:${spotifyTrackId}`,
		primaryArtistName: artists[0]?.name ?? "Unknown Artist",
		artists,
		spotifyAlbumId,
		albumName,
		albumImageUrl: "https://example.com/cover.jpg",
		firstSeenAt,
	};
	if (spotifyAlbumType !== null) {
		encounter.spotifyAlbumType = spotifyAlbumType ?? "album";
	}
	return encounter;
}

function createPlaylistTrackItem(overrides?: {
	addedAt?: string;
	images?: Array<{ url: string; height: number; width: number }>;
}): PlaylistTrackItem {
	return {
		added_at: overrides?.addedAt ?? "2026-07-04T12:00:00Z",
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
				album_type: "album",
				images: overrides?.images ?? [
					{ url: "https://example.com/cover.jpg", height: 640, width: 640 },
				],
			},
			duration_ms: 180000,
			external_urls: { spotify: "https://open.spotify.com/track/track-1" },
			preview_url: null,
			track_number: 1,
		},
	};
}

test("normalizePlaylistTrack returns metadata needed by the funnel ledger", () => {
	const normalized = normalizePlaylistTrack(createPlaylistTrackItem());

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
		spotifyAlbumType: "album",
		albumImageUrl: "https://example.com/cover.jpg",
		playlistAddedAt: Date.parse("2026-07-04T12:00:00Z"),
	});
});

test("normalizePlaylistTrack copies album_type when present", () => {
	const item = createPlaylistTrackItem();
	if (item.track) {
		item.track.album.album_type = "compilation";
	}
	assert.equal(normalizePlaylistTrack(item)?.spotifyAlbumType, "compilation");
});

test("qualifiesAsMusicFunnelAlbumRepeat allows album and compilation only", () => {
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("album"), true);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("compilation"), true);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat("single"), false);
	assert.equal(qualifiesAsMusicFunnelAlbumRepeat(undefined), false);
});

test("computeAlbumRepeatSummaries excludes singles and missing album type", () => {
	const singles = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t1",
			spotifyAlbumId: "single-1",
			spotifyAlbumType: "single",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t2",
			spotifyAlbumId: "single-1",
			spotifyAlbumType: "single",
		}),
	]);
	assert.equal(singles.length, 0);

	const missing = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t3",
			spotifyAlbumId: "unknown-1",
			spotifyAlbumType: null,
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t4",
			spotifyAlbumId: "unknown-1",
			spotifyAlbumType: null,
		}),
	]);
	assert.equal(missing.length, 0);
});

test("computeAlbumRepeatSummaries keeps compilations with 2+ sources", () => {
	const repeats = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "t1",
			spotifyAlbumId: "comp-1",
			spotifyAlbumType: "compilation",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "t2",
			spotifyAlbumId: "comp-1",
			spotifyAlbumType: "compilation",
		}),
	]);
	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyAlbumId, "comp-1");
});

test("normalizePlaylistTrack returns null for local or unavailable tracks", () => {
	assert.equal(
		normalizePlaylistTrack({
			added_at: "2026-07-04T12:00:00Z",
			track: null,
		}),
		null,
	);
});

test("normalizePlaylistTrack omits invalid dates and missing album images", () => {
	const normalized = normalizePlaylistTrack(
		createPlaylistTrackItem({ addedAt: "not a date", images: [] }),
	);

	assert.equal(normalized?.albumImageUrl, undefined);
	assert.equal(normalized?.playlistAddedAt, undefined);
});

test("computeTrackRepeatSummaries counts distinct sources per track and ignores duplicate rows from the same source", () => {
	const repeats = computeTrackRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "track-1",
			firstSeenAt: 1000,
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "track-1",
			firstSeenAt: 3000,
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "track-1",
			firstSeenAt: 4000,
		}),
		createEncounter({ sourceId: sourceC, spotifyTrackId: "track-2" }),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyTrackId, "track-1");
	assert.deepEqual(repeats[0]?.sourceIds, [sourceA, sourceB]);
	assert.equal(repeats[0]?.sourceCount, 2);
	assert.equal(repeats[0]?.firstSeenAt, 1000);
	assert.equal(repeats[0]?.latestSeenAt, 4000);
});

test("computeAlbumRepeatSummaries counts one source once per album while preserving contributing track count", () => {
	const repeats = computeAlbumRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "track-1",
			spotifyAlbumId: "album-1",
		}),
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "track-2",
			spotifyAlbumId: "album-1",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "track-3",
			spotifyAlbumId: "album-1",
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "track-3",
			spotifyAlbumId: "album-1",
		}),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyAlbumId, "album-1");
	assert.deepEqual(repeats[0]?.sourceIds, [sourceA, sourceB]);
	assert.equal(repeats[0]?.sourceCount, 2);
	assert.equal(repeats[0]?.contributingTrackCount, 3);
});

test("computeArtistRepeatSummaries counts every credited artist, not just primary", () => {
	const repeats = computeArtistRepeatSummaries([
		createEncounter({
			sourceId: sourceA,
			spotifyTrackId: "track-1",
			artists: [
				{ spotifyArtistId: "artist-1", name: "Artist One" },
				{ spotifyArtistId: "artist-2", name: "Artist Two" },
			],
		}),
		createEncounter({
			sourceId: sourceB,
			spotifyTrackId: "track-2",
			artists: [{ spotifyArtistId: "artist-2", name: "Artist Two" }],
		}),
	]);

	assert.equal(repeats.length, 1);
	assert.equal(repeats[0]?.spotifyArtistId, "artist-2");
	assert.deepEqual(repeats[0]?.sourceIds, [sourceA, sourceB]);
	assert.equal(repeats[0]?.sourceCount, 2);
	assert.equal(repeats[0]?.contributingTrackCount, 2);
});

test("planPlaylistWrites queues first global sightings for the main playlist", () => {
	const planned = planPlaylistWrites({
		candidateEncounters: [
			createEncounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			createEncounter({ sourceId: sourceA, spotifyTrackId: "track-4" }),
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
			createEncounter({ sourceId: sourceB, spotifyTrackId: "track-2" }),
			createEncounter({ sourceId: sourceB, spotifyTrackId: "track-5" }),
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
			createEncounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			createEncounter({ sourceId: sourceB, spotifyTrackId: "track-2" }),
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
			createEncounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			createEncounter({ sourceId: sourceA, spotifyTrackId: "track-1" }),
			createEncounter({ sourceId: sourceB, spotifyTrackId: "track-1" }),
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

test("chunkSpotifyUris chunks at 100 URIs", () => {
	const uris = Array.from(
		{ length: 205 },
		(_, index) => `spotify:track:${index}`,
	);
	const chunks = chunkSpotifyUris(uris);

	assert.equal(chunks.length, 3);
	assert.equal(chunks[0]?.length, 100);
	assert.equal(chunks[1]?.length, 100);
	assert.equal(chunks[2]?.length, 5);
});

test("excludeAlreadyWrittenPlaylistWrites drops tracks already in the write ledger", () => {
	const writes = [
		{
			spotifyTrackId: "track-1",
			trackUri: "spotify:track:track-1",
			reason: "second_source_repeat" as const,
		},
		{
			spotifyTrackId: "track-2",
			trackUri: "spotify:track:track-2",
			reason: "second_source_repeat" as const,
		},
	];

	const pending = excludeAlreadyWrittenPlaylistWrites(
		writes,
		new Set(["track-1"]),
	);

	assert.deepEqual(
		pending.map((write) => write.spotifyTrackId),
		["track-2"],
	);
});

test("pendingPlaylistWritesAfterPresenceCheck skips tracks already on the Spotify playlist even if ledger is empty", () => {
	const writes = [
		{
			spotifyTrackId: "track-1",
			trackUri: "spotify:track:track-1",
			reason: "second_source_repeat" as const,
		},
		{
			spotifyTrackId: "track-2",
			trackUri: "spotify:track:track-2",
			reason: "second_source_repeat" as const,
		},
		{
			spotifyTrackId: "track-3",
			trackUri: "spotify:track:track-3",
			reason: "second_source_repeat" as const,
		},
	];

	const result = pendingPlaylistWritesAfterPresenceCheck({
		writes,
		ledgerTrackIds: new Set(["track-1"]),
		destinationPlaylistTrackIds: new Set(["track-2"]),
	});

	assert.deepEqual(
		result.toWrite.map((write) => write.spotifyTrackId),
		["track-3"],
	);
	assert.deepEqual(
		result.alreadyOnPlaylist.map((write) => write.spotifyTrackId),
		["track-2"],
	);
});

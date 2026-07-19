import assert from "node:assert/strict";
import test from "node:test";
import { type PlayEvent, detectAlbumListenSessions } from "./album-detection";

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
	assert.equal(sessions[0]?.latestPlayedAt, morningStart + 11 * 3 * 60_000);
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

/**
 * Historical Repair Candidate Builder
 *
 * Pure functions to rebuild album listen candidates from raw
 * `spotifyRecentlyPlayedSyncLogs`-style payloads. Dedupes plays across
 * overlapping sync logs, re-runs album listen detection, and drops any
 * candidate that overlaps a listen the user already has recorded.
 */

import { createHash } from "node:crypto";
import { type PlayEvent, detectAlbumListenSessions } from "./album-detection";

export type RepairCandidate = {
	id: string;
	userId: string;
	spotifyAlbumId: string;
	albumName?: string;
	trackIds: string[];
	earliestPlayedAt: number;
	latestPlayedAt: number;
	coverage: number;
	ascendingRatio: number;
	evidenceLogIds: string[];
};

export type ExistingListenInterval = {
	spotifyAlbumId: string;
	earliestPlayedAt: number;
	latestPlayedAt: number;
};

type RawRecentlyPlayedItem = {
	track?: {
		id?: string;
		track_number?: number;
		disc_number?: number;
		album?: { id?: string; name?: string };
	};
	played_at?: string;
};

type DedupedPlay = {
	play: PlayEvent;
	albumName?: string;
	logIds: Set<string>;
};

/**
 * Parses a raw `recentlyPlayed`-shaped JSON response into `PlayEvent[]`,
 * defaulting `discNumber` to 1 when missing. Malformed items are skipped.
 */
export function parseRecentlyPlayedRaw(rawResponse: string): PlayEvent[] {
	let items: RawRecentlyPlayedItem[];
	try {
		items = JSON.parse(rawResponse);
	} catch {
		return [];
	}
	if (!Array.isArray(items)) return [];

	const events: PlayEvent[] = [];
	for (const item of items) {
		const trackId = item.track?.id;
		const albumId = item.track?.album?.id;
		const trackNumber = item.track?.track_number;
		const playedAtRaw = item.played_at;
		if (!trackId || !albumId || trackNumber === undefined || !playedAtRaw) {
			continue;
		}
		const playedAt = Date.parse(playedAtRaw);
		if (Number.isNaN(playedAt)) continue;

		events.push({
			trackId,
			trackNumber,
			discNumber: item.track?.disc_number ?? 1,
			playedAt,
			albumId,
		});
	}
	return events;
}

function overlapsExistingListen(
	spotifyAlbumId: string,
	earliestPlayedAt: number,
	latestPlayedAt: number,
	existingListens: ExistingListenInterval[],
): boolean {
	return existingListens.some(
		(listen) =>
			listen.spotifyAlbumId === spotifyAlbumId &&
			earliestPlayedAt <= listen.latestPlayedAt &&
			latestPlayedAt >= listen.earliestPlayedAt,
	);
}

function candidateId(
	userId: string,
	spotifyAlbumId: string,
	earliestPlayedAt: number,
	latestPlayedAt: number,
	sortedTrackIds: string[],
): string {
	const key = [
		userId,
		spotifyAlbumId,
		earliestPlayedAt,
		latestPlayedAt,
		...sortedTrackIds,
	].join("|");
	return createHash("sha256").update(key).digest("hex");
}

/**
 * Rebuilds repair candidates from raw sync logs: dedupes plays across logs
 * (unioning evidence log ids per play), groups by album, re-detects listen
 * sessions, and excludes anything overlapping an existing recorded listen.
 */
export function buildRepairCandidates(input: {
	userId: string;
	logs: Array<{ id: string; rawResponse: string }>;
	albumTotalTracks: Map<string, number>;
	existingListens: ExistingListenInterval[];
}): RepairCandidate[] {
	const { userId, logs, albumTotalTracks, existingListens } = input;

	const dedupedByKey = new Map<string, DedupedPlay>();
	for (const log of logs) {
		let rawItems: RawRecentlyPlayedItem[];
		try {
			rawItems = JSON.parse(log.rawResponse);
		} catch {
			continue;
		}
		if (!Array.isArray(rawItems)) continue;

		const albumNameByAlbumId = new Map<string, string>();
		for (const item of rawItems) {
			const name = item.track?.album?.name;
			const albumId = item.track?.album?.id;
			if (name && albumId && !albumNameByAlbumId.has(albumId)) {
				albumNameByAlbumId.set(albumId, name);
			}
		}

		const plays = parseRecentlyPlayedRaw(log.rawResponse);
		for (const play of plays) {
			const key = `${play.trackId}:${play.playedAt}`;
			const existing = dedupedByKey.get(key);
			if (existing) {
				existing.logIds.add(log.id);
			} else {
				dedupedByKey.set(key, {
					play,
					albumName: albumNameByAlbumId.get(play.albumId),
					logIds: new Set([log.id]),
				});
			}
		}
	}

	const byAlbum = new Map<string, DedupedPlay[]>();
	for (const deduped of dedupedByKey.values()) {
		const existing = byAlbum.get(deduped.play.albumId) ?? [];
		existing.push(deduped);
		byAlbum.set(deduped.play.albumId, existing);
	}

	const candidates: RepairCandidate[] = [];
	for (const [albumId, dedupedPlays] of byAlbum) {
		const totalTracks = albumTotalTracks.get(albumId);
		if (!totalTracks) continue;

		const plays = dedupedPlays.map((d) => d.play);
		const sessions = detectAlbumListenSessions(plays, totalTracks);

		const albumName = dedupedPlays.find((d) => d.albumName)?.albumName;

		for (const session of sessions) {
			if (
				overlapsExistingListen(
					albumId,
					session.earliestPlayedAt,
					session.latestPlayedAt,
					existingListens,
				)
			) {
				continue;
			}

			const evidenceLogIds = new Set<string>();
			for (const d of dedupedPlays) {
				if (
					d.play.playedAt >= session.earliestPlayedAt &&
					d.play.playedAt <= session.latestPlayedAt &&
					session.trackIds.includes(d.play.trackId)
				) {
					for (const logId of d.logIds) evidenceLogIds.add(logId);
				}
			}

			const uniqueTrackCount = new Set(session.trackIds).size;
			const coverage = uniqueTrackCount / totalTracks;
			const sortedTrackIds = [...session.trackIds].sort();

			candidates.push({
				id: candidateId(
					userId,
					albumId,
					session.earliestPlayedAt,
					session.latestPlayedAt,
					sortedTrackIds,
				),
				userId,
				spotifyAlbumId: albumId,
				albumName,
				trackIds: session.trackIds,
				earliestPlayedAt: session.earliestPlayedAt,
				latestPlayedAt: session.latestPlayedAt,
				coverage,
				ascendingRatio: computeAscendingRatio(
					dedupedPlays
						.map((d) => d.play)
						.filter(
							(p) =>
								p.playedAt >= session.earliestPlayedAt &&
								p.playedAt <= session.latestPlayedAt,
						),
				),
				evidenceLogIds: [...evidenceLogIds],
			});
		}
	}

	return candidates;
}

function computeAscendingRatio(plays: PlayEvent[]): number {
	const sorted = [...plays].sort((a, b) => a.playedAt - b.playedAt);
	if (sorted.length <= 1) return 1;

	let ascendingPairs = 0;
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const curr = sorted[i];
		if (!prev || !curr) continue;
		const isAscending =
			curr.discNumber !== prev.discNumber
				? curr.discNumber > prev.discNumber
				: curr.trackNumber >= prev.trackNumber;
		if (isAscending) ascendingPairs++;
	}
	return ascendingPairs / (sorted.length - 1);
}

/**
 * Deterministic SHA-256 hex hash of a candidate set, for detecting whether
 * a previewed repair is still valid at apply time.
 */
export function computePreviewHash(candidates: RepairCandidate[]): string {
	const canonical = [...candidates]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((c) => ({
			id: c.id,
			spotifyAlbumId: c.spotifyAlbumId,
			albumName: c.albumName,
			trackIds: c.trackIds,
			earliestPlayedAt: c.earliestPlayedAt,
			latestPlayedAt: c.latestPlayedAt,
		}));
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Album Listen Detection Utility
 *
 * Detects valid "straight through" album listens from play events.
 * Splits raw play history into "attempts" whenever the track order jumps
 * backward to near the start of the album (an early restart), then finds
 * the strongest contiguous, mostly-ascending, time-bounded window within
 * each attempt. This keeps stale plays from an earlier session (e.g. a
 * lone track played hours before a clean morning listen) from poisoning
 * or merging with a valid straight-through listen.
 */

export type PlayEvent = {
	trackId: string;
	trackNumber: number;
	discNumber: number;
	playedAt: number; // Unix timestamp
	albumId: string;
};

export type ListenSession = {
	albumId: string;
	trackIds: string[];
	earliestPlayedAt: number;
	latestPlayedAt: number;
};

// Constants for detection thresholds
const COVERAGE_THRESHOLD = 0.7; // 70% of album tracks required
const ASCENDING_THRESHOLD = 0.7; // 70% of consecutive pairs must be ascending
const MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const EARLY_RESTART_PERCENT = 0.3; // Landing track must be <= 30% into the album to count as a restart
const MIN_ALBUM_TRACKS = 4; // Skip singles/EPs - only count albums with 4+ tracks

type Window = {
	plays: PlayEvent[];
	coverage: number;
	ascendingRatio: number;
	span: number;
};

/**
 * Groups play events by album ID
 */
export function groupPlaysByAlbum(
	plays: PlayEvent[],
): Map<string, PlayEvent[]> {
	const byAlbum = new Map<string, PlayEvent[]>();

	for (const play of plays) {
		const existing = byAlbum.get(play.albumId) ?? [];
		existing.push(play);
		byAlbum.set(play.albumId, existing);
	}

	return byAlbum;
}

/**
 * Disc-aware ascending check: a later disc is always "ascending" relative
 * to an earlier disc; within the same disc, track numbers must not decrease.
 */
function isAscendingPair(prev: PlayEvent, curr: PlayEvent): boolean {
	if (curr.discNumber !== prev.discNumber) {
		return curr.discNumber > prev.discNumber;
	}
	return curr.trackNumber >= prev.trackNumber;
}

/**
 * Detects an early restart: (discNumber, trackNumber) goes lexicographically
 * backward and the landing track is on disc 1, within the first 30% of the
 * album. This is what separates a genuine new attempt (someone restarting
 * the album from the top) from an out-of-order shuffle blip.
 */
function isEarlyRestart(
	prev: PlayEvent,
	curr: PlayEvent,
	totalTracks: number,
): boolean {
	if (isAscendingPair(prev, curr)) return false;

	const earlyRestartCutoff = Math.ceil(totalTracks * EARLY_RESTART_PERCENT);
	return curr.discNumber === 1 && curr.trackNumber <= earlyRestartCutoff;
}

/**
 * Splits time-sorted plays into "attempts" on early restarts.
 */
function splitIntoAttempts(
	sorted: PlayEvent[],
	totalTracks: number,
): PlayEvent[][] {
	if (sorted.length === 0) return [];

	const attempts: PlayEvent[][] = [];
	let current: PlayEvent[] = [sorted[0]!];

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1]!;
		const curr = sorted[i]!;

		if (isEarlyRestart(prev, curr, totalTracks)) {
			attempts.push(current);
			current = [curr];
		} else {
			current.push(curr);
		}
	}
	attempts.push(current);

	return attempts;
}

/**
 * Computes coverage and ascending ratio for a contiguous window of plays.
 */
function scoreWindow(plays: PlayEvent[], totalTracks: number): Window {
	const uniqueTrackIds = new Set(plays.map((p) => p.trackId));
	const coverage = uniqueTrackIds.size / totalTracks;

	let ascendingPairs = 0;
	const totalPairs = plays.length - 1;
	for (let i = 1; i < plays.length; i++) {
		if (isAscendingPair(plays[i - 1]!, plays[i]!)) {
			ascendingPairs++;
		}
	}
	const ascendingRatio = totalPairs === 0 ? 1 : ascendingPairs / totalPairs;
	const span = plays.at(-1)!.playedAt - plays[0]!.playedAt;

	return { plays, coverage, ascendingRatio, span };
}

/**
 * Compares two valid windows per the spec's scoring order: higher coverage
 * wins, then higher ascending ratio, then shorter span.
 */
function isBetterWindow(candidate: Window, current: Window): boolean {
	if (candidate.coverage !== current.coverage) {
		return candidate.coverage > current.coverage;
	}
	if (candidate.ascendingRatio !== current.ascendingRatio) {
		return candidate.ascendingRatio > current.ascendingRatio;
	}
	return candidate.span < current.span;
}

/**
 * Searches every contiguous sub-window `[i..j]` within an attempt and
 * returns the best-scoring one that satisfies coverage >= 70%, ascending
 * ratio >= 70%, and span <= 4 hours. Returns null if no window qualifies.
 *
 * Attempts are time-sorted, so span grows monotonically as `j` advances for
 * a fixed `i` — once a window's span exceeds the 4h cap, every larger `j`
 * for that `i` will too, so the inner loop can stop early.
 */
function findBestWindow(
	attempt: PlayEvent[],
	totalTracks: number,
): Window | null {
	let best: Window | null = null;

	for (let i = 0; i < attempt.length; i++) {
		for (let j = i; j < attempt.length; j++) {
			const span = attempt[j]!.playedAt - attempt[i]!.playedAt;
			if (span > MAX_SESSION_DURATION_MS) break;

			const candidate = scoreWindow(attempt.slice(i, j + 1), totalTracks);
			if (
				candidate.coverage < COVERAGE_THRESHOLD ||
				candidate.ascendingRatio < ASCENDING_THRESHOLD
			) {
				continue;
			}

			if (!best || isBetterWindow(candidate, best)) {
				best = candidate;
			}
		}
	}

	return best;
}

function toListenSession(window: Window): ListenSession {
	const trackIds = [...new Set(window.plays.map((p) => p.trackId))];
	const earliestPlayedAt = window.plays[0]!.playedAt;
	const latestPlayedAt = window.plays.at(-1)!.playedAt;

	return {
		albumId: window.plays[0]!.albumId,
		trackIds,
		earliestPlayedAt,
		latestPlayedAt,
	};
}

/**
 * Main detection function - detects valid album listen sessions
 *
 * @param plays - All play events for a single album
 * @param totalTracks - Total number of tracks in the album
 * @returns Array of valid listen sessions, in chronological order
 */
export function detectAlbumListenSessions(
	plays: PlayEvent[],
	totalTracks: number,
): ListenSession[] {
	// Skip singles/EPs - only count proper albums
	if (plays.length === 0 || totalTracks === 0 || totalTracks < MIN_ALBUM_TRACKS)
		return [];

	const sorted = [...plays].sort((a, b) => {
		if (a.playedAt !== b.playedAt) return a.playedAt - b.playedAt;
		if (a.discNumber !== b.discNumber) return a.discNumber - b.discNumber;
		return a.trackNumber - b.trackNumber;
	});

	const attempts = splitIntoAttempts(sorted, totalTracks);

	const sessions: ListenSession[] = [];
	for (const attempt of attempts) {
		const best = findBestWindow(attempt, totalTracks);
		if (best) {
			sessions.push(toListenSession(best));
		}
	}

	return sessions.sort((a, b) => a.earliestPlayedAt - b.earliestPlayedAt);
}

/**
 * Process all plays and detect listen sessions for all albums
 */
export function detectAllAlbumListens(
	plays: PlayEvent[],
	albumTotalTracks: Map<string, number>, // albumId -> totalTracks
): ListenSession[] {
	const byAlbum = groupPlaysByAlbum(plays);
	const allSessions: ListenSession[] = [];

	for (const [albumId, albumPlays] of byAlbum) {
		const totalTracks = albumTotalTracks.get(albumId);
		if (!totalTracks) continue;

		const sessions = detectAlbumListenSessions(albumPlays, totalTracks);
		allSessions.push(...sessions);
	}

	return allSessions;
}

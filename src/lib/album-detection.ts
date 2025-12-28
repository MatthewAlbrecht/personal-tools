/**
 * Album Listen Detection Utility
 *
 * Detects valid "straight through" album listens from play events.
 * Handles back-to-back listens by detecting track number restarts.
 * Rejects shuffled/scattered plays by requiring ascending track order.
 */

export type PlayEvent = {
	trackId: string;
	trackNumber: number;
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
const MAJORITY_THRESHOLD = 0.7; // 70% of album tracks required
const ASCENDING_THRESHOLD = 0.7; // 70% of consecutive pairs must be ascending
const MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const RESTART_FROM_TRACK = 3; // Consider restart if going to track 1-3
const RESTART_AFTER_TRACK_PERCENT = 0.7; // Consider restart if coming from track > 70% through album
const MIN_ALBUM_TRACKS = 4; // Skip singles/EPs - only count albums with 4+ tracks

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
 * Detects if a track number sequence indicates an album restart
 * Returns true if going from a late track to an early track
 */
function isRestart(
	prevTrackNumber: number,
	currTrackNumber: number,
	totalTracks: number,
): boolean {
	const restartAfterTrack = Math.ceil(
		totalTracks * RESTART_AFTER_TRACK_PERCENT,
	);
	return (
		prevTrackNumber >= restartAfterTrack &&
		currTrackNumber <= RESTART_FROM_TRACK
	);
}

/**
 * Splits plays into listen sessions based on track number restarts
 */
function splitIntoSessions(
	plays: PlayEvent[],
	totalTracks: number,
): PlayEvent[][] {
	if (plays.length === 0) return [];

	// Sort by played_at time
	const sorted = [...plays].sort((a, b) => a.playedAt - b.playedAt);

	const sessions: PlayEvent[][] = [];
	const firstPlay = sorted[0];
	if (!firstPlay) return [];

	let currentSession: PlayEvent[] = [firstPlay];

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1]!;
		const curr = sorted[i]!;

		if (isRestart(prev.trackNumber, curr.trackNumber, totalTracks)) {
			// Start new session
			sessions.push(currentSession);
			currentSession = [curr];
		} else {
			currentSession.push(curr);
		}
	}

	// Don't forget the last session
	if (currentSession.length > 0) {
		sessions.push(currentSession);
	}

	return sessions;
}

/**
 * Checks if track numbers are mostly ascending (70%+ of consecutive pairs)
 */
function isMostlyAscending(plays: PlayEvent[]): boolean {
	if (plays.length <= 1) return true;

	let ascendingPairs = 0;
	let totalPairs = 0;

	for (let i = 1; i < plays.length; i++) {
		const curr = plays[i]!;
		const prev = plays[i - 1]!;
		totalPairs++;
		if (curr.trackNumber >= prev.trackNumber) {
			ascendingPairs++;
		}
	}

	return ascendingPairs / totalPairs >= ASCENDING_THRESHOLD;
}

/**
 * Validates a session against all criteria
 */
function isValidSession(session: PlayEvent[], totalTracks: number): boolean {
	if (session.length === 0) return false;

	// Check majority threshold (70% of unique tracks)
	const uniqueTrackIds = new Set(session.map((p) => p.trackId));
	if (uniqueTrackIds.size < totalTracks * MAJORITY_THRESHOLD) {
		return false;
	}

	// Check duration (within 4 hours)
	const earliest = Math.min(...session.map((p) => p.playedAt));
	const latest = Math.max(...session.map((p) => p.playedAt));
	if (latest - earliest > MAX_SESSION_DURATION_MS) {
		return false;
	}

	// Check ascending order (70% of pairs)
	if (!isMostlyAscending(session)) {
		return false;
	}

	return true;
}

/**
 * Main detection function - detects valid album listen sessions
 *
 * @param plays - All play events for a single album
 * @param totalTracks - Total number of tracks in the album
 * @returns Array of valid listen sessions
 */
export function detectAlbumListenSessions(
	plays: PlayEvent[],
	totalTracks: number,
): ListenSession[] {
	// Skip singles/EPs - only count proper albums
	if (plays.length === 0 || totalTracks === 0 || totalTracks < MIN_ALBUM_TRACKS)
		return [];

	// Split into sessions based on track restarts
	const sessions = splitIntoSessions(plays, totalTracks);

	// Validate each session and convert to ListenSession format
	const validSessions: ListenSession[] = [];

	for (const session of sessions) {
		if (isValidSession(session, totalTracks) && session[0]) {
			const trackIds = [...new Set(session.map((p) => p.trackId))];
			const earliestPlayedAt = Math.min(...session.map((p) => p.playedAt));
			const latestPlayedAt = Math.max(...session.map((p) => p.playedAt));

			validSessions.push({
				albumId: session[0].albumId,
				trackIds,
				earliestPlayedAt,
				latestPlayedAt,
			});
		}
	}

	return validSessions;
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

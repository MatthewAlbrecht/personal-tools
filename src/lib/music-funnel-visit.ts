export function getLastSeenStorageKey(userId: string): string {
	return `music-funnel-last-seen-${userId}`;
}

export function getVisitSinceSessionKey(userId: string): string {
	return `music-funnel-visit-since-${userId}`;
}

function parseTimestamp(value: string | null): number | null {
	if (value === null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export function resolveVisitSince({
	sessionValue,
	localValue,
	now,
}: {
	sessionValue: string | null;
	localValue: string | null;
	now: number;
}): number {
	return (
		parseTimestamp(sessionValue) ?? parseTimestamp(localValue) ?? now
	);
}

export function isNewSince(eventAt: number, visitSince: number): boolean {
	return eventAt > visitSince;
}

export function sourceRunHasActivity(run: {
	newEncounters: number;
	trackRepeatsFound: number;
	albumRepeatsFound: number;
	artistRepeatsFound: number;
}): boolean {
	return (
		run.newEncounters > 0 ||
		run.trackRepeatsFound > 0 ||
		run.albumRepeatsFound > 0 ||
		run.artistRepeatsFound > 0
	);
}

export function summarizeMissed({
	visitSince,
	sourceRuns,
	repeats,
}: {
	visitSince: number;
	sourceRuns: Array<{
		startedAt: number;
		newEncounters: number;
		trackRepeatsFound: number;
		albumRepeatsFound: number;
		artistRepeatsFound: number;
	}>;
	repeats: Array<{ type: "track" | "album" | "artist"; becameRepeatAt: number }>;
}): {
	syncCount: number;
	repeatTrackCount: number;
	repeatAlbumCount: number;
	repeatArtistCount: number;
} {
	const syncCount = sourceRuns.filter(
		(run) =>
			run.startedAt > visitSince && sourceRunHasActivity(run),
	).length;

	let repeatTrackCount = 0;
	let repeatAlbumCount = 0;
	let repeatArtistCount = 0;
	for (const row of repeats) {
		if (!isNewSince(row.becameRepeatAt, visitSince)) continue;
		if (row.type === "track") repeatTrackCount += 1;
		else if (row.type === "album") repeatAlbumCount += 1;
		else repeatArtistCount += 1;
	}

	return {
		syncCount,
		repeatTrackCount,
		repeatAlbumCount,
		repeatArtistCount,
	};
}

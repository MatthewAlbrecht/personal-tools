export function computeBecameRepeatAt(
	rows: Array<{ sourceId: string; firstSeenAt: number }>,
): number {
	const earliestBySource = new Map<string, number>();
	for (const row of rows) {
		const prev = earliestBySource.get(row.sourceId);
		if (prev === undefined || row.firstSeenAt < prev) {
			earliestBySource.set(row.sourceId, row.firstSeenAt);
		}
	}
	const times = [...earliestBySource.values()].sort((a, b) => a - b);
	const second = times[1];
	if (second === undefined) {
		throw new Error("computeBecameRepeatAt requires at least 2 distinct sources");
	}
	return second;
}

export function sortUnifiedRepeatsByLatestSeenAt<
	TRow extends { latestSeenAt: number },
>(rows: TRow[]): TRow[] {
	return [...rows].sort((a, b) => b.latestSeenAt - a.latestSeenAt);
}

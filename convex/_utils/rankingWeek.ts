const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Week key = UTC midnight of the Sunday at or before now (inclusive when now is Sunday 00:00 UTC); matches Sunday cron capture.
export function previousSundayUtcMs(nowMs: number): number {
	const date = new Date(nowMs);
	const utcMidnight = Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate(),
	);
	const dayOfWeek = new Date(utcMidnight).getUTCDay();
	if (dayOfWeek === 0) {
		return utcMidnight;
	}
	return utcMidnight - dayOfWeek * MS_PER_DAY;
}

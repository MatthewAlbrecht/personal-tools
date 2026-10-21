// Adaptive timing (ticket 17): when scheduled full runs happen. Once about
// 4 weeks of Listings exist, the hours of the week (in my time zone) when
// sellers post new Listings for my Printings get a full run about every hour;
// otherwise full runs are under 6 hours apart. Before that, about every 3
// hours. Gaps vary within a range, and there are no full runs overnight
// (ticket 19). Relative imports only (Convex imports this).

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The LaunchAgent asks the app whether a run is due this often. Here, not in
 * automation.ts, so the gaps below can use it without a circular import.
 */
export const SCHEDULE_TICK_MS = 10 * MINUTE_MS;

export const HOURS_IN_WEEK = 7 * 24;

/** Posting times are learned once Listings go back this many days. */
export const LEARNING_DAYS = 28;

/** Busy hours are counted over this many days of listing times. */
export const POSTING_WINDOW_MS = LEARNING_DAYS * DAY_MS;

/** Never longer than this between scheduled full runs, once learned. */
export const MAX_FULL_RUN_GAP_MS = 6 * HOUR_MS;

/** A gap between full runs: somewhere from `min` to `max` (Unix ms). */
export type GapRange = { min: number; max: number };

/**
 * The gap between full runs while learning, or when no hour stands out:
 * about 3 hours.
 */
export const FALLBACK_GAP: GapRange = {
	min: 2.5 * HOUR_MS,
	max: 3.75 * HOUR_MS,
};

/** The gap in a busy hour and the hour after it: about an hour. */
export const BUSY_GAP: GapRange = { min: 45 * MINUTE_MS, max: 80 * MINUTE_MS };

/**
 * The longest gap outside busy hours, once learned. Its top is two asks
 * short of 6 hours, so neither the wait for the next ask nor an ask that
 * finds a run (a refresh) still open passes 6 hours.
 */
export const CAP_GAP: GapRange = {
	min: 5 * HOUR_MS,
	max: MAX_FULL_RUN_GAP_MS - 2 * SCHEDULE_TICK_MS,
};

/** Where in a range a gap falls, from a draw in [0, 1]. */
export function gapWithin(range: GapRange, gapDraw: number): number {
	return range.min + gapDraw * (range.max - range.min);
}

/** No full runs from this hour (1 AM)… */
export const OVERNIGHT_FROM_HOUR = 1;
/** …until this hour (7 AM), in my time zone. */
export const OVERNIGHT_UNTIL_HOUR = 7;

/** Whether `time` is in the overnight pause (1–7 AM in `timeZone`). */
export function inOvernightPause(time: number, timeZone: string): boolean {
	const hour = hourOfWeek(time, timeZone) % 24;
	return hour >= OVERNIGHT_FROM_HOUR && hour < OVERNIGHT_UNTIL_HOUR;
}

/**
 * An hour of the week is busy when at least this many Listings went up in
 * it over the window (most weeks)…
 */
const BUSY_MIN_LISTINGS = 3;
/** …and at least this many times the average hour. */
const BUSY_OVER_AVERAGE = 2;
/** At most this many busy hours a week (the busiest), to keep runs modest. */
export const MAX_BUSY_HOURS = 24;

/**
 * When full runs happen. `learning` until Listings go back LEARNING_DAYS
 * (`dataSince` is the first capture, null before any). `busyHours` are hours
 * of the week (0 is Sunday midnight to 1am in `timeZone`), ascending; empty
 * while learning, or when no hour stands out.
 */
export type RunTiming = {
	status: "learning" | "learned";
	dataSince: number | null;
	timeZone: string;
	busyHours: number[];
};

/** The hour of the week `time` falls in, in `timeZone`: 0 (Sunday 12–1am) to 167. */
export function hourOfWeek(time: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		weekday: "short",
		hour: "numeric",
	}).formatToParts(new Date(time));
	const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
	const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
	return WEEKDAYS.indexOf(weekday) * 24 + hour;
}

/** The days of a week, as hour of the week counts them (Sunday first). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Learns when full runs happen from `listedTimes`: when the Listings matched
 * to my Printings went up (eBay's listing time). Only those in the last
 * LEARNING_DAYS before `now` count.
 */
export function learnRunTiming({
	listedTimes,
	dataSince,
	timeZone,
	now,
}: {
	listedTimes: readonly number[];
	dataSince: number | null;
	timeZone: string;
	now: number;
}): RunTiming {
	if (dataSince === null || now - dataSince < LEARNING_DAYS * DAY_MS) {
		return { status: "learning", dataSince, timeZone, busyHours: [] };
	}
	const counts = new Array<number>(HOURS_IN_WEEK).fill(0);
	for (const time of listedTimes) {
		if (time <= now - POSTING_WINDOW_MS || time > now) continue;
		const hour = hourOfWeek(time, timeZone);
		counts[hour] = (counts[hour] ?? 0) + 1;
	}
	const average = counts.reduce((sum, count) => sum + count, 0) / HOURS_IN_WEEK;
	const busyHours = counts
		.map((count, hour) => ({ count, hour }))
		.filter(
			({ count }) =>
				count >= BUSY_MIN_LISTINGS && count >= BUSY_OVER_AVERAGE * average,
		)
		.sort((a, b) => b.count - a.count || a.hour - b.hour)
		.slice(0, MAX_BUSY_HOURS)
		.map(({ hour }) => hour)
		.sort((a, b) => a - b);
	return { status: "learned", dataSince, timeZone, busyHours };
}

/**
 * Whether a scheduled ask at `now` starts a full run. Never from 1 to 7 AM
 * in my time zone; the first ask after starts one if it's due by then.
 * Otherwise, with busy hours learned: in a busy hour and the hour after
 * (whose run catches the busy hour's Listings) 45–80 minutes after the last,
 * else 5 hours to 5 hours 40 after it. Otherwise 2½–3¾ hours after it.
 * `gapDraw` (0–1, picked when the last full run ended) says where in each
 * range the gap falls. None yet: due (outside the night).
 */
export function fullRunDue({
	lastFullRunAt,
	gapDraw,
	timing,
	now,
}: {
	lastFullRunAt: number | null;
	gapDraw: number;
	timing: RunTiming;
	now: number;
}): boolean {
	if (inOvernightPause(now, timing.timeZone)) return false;
	if (lastFullRunAt === null) return true;
	const since = now - lastFullRunAt;
	// Half a tick early, so a run asked for a few seconds late still counts.
	const slack = SCHEDULE_TICK_MS / 2;
	if (timing.status === "learning" || timing.busyHours.length === 0) {
		return since >= gapWithin(FALLBACK_GAP, gapDraw) - slack;
	}
	if (since >= gapWithin(CAP_GAP, gapDraw)) return true;
	const hour = hourOfWeek(now, timing.timeZone);
	const previous = (hour + HOURS_IN_WEEK - 1) % HOURS_IN_WEEK;
	const busy =
		timing.busyHours.includes(hour) || timing.busyHours.includes(previous);
	return busy && since >= gapWithin(BUSY_GAP, gapDraw) - slack;
}

// Adaptive timing (ticket 17): when scheduled full runs happen. Once about
// 4 weeks of Listings exist, the hours of the week (in my time zone) when
// sellers post new Listings for my Printings get a full run every hour;
// otherwise full runs are at most 6 hours apart. Before that, every 3 hours.
// Relative imports only (Convex imports this).

import { FULL_RUN_EVERY_MS, SCHEDULE_TICK_MS } from "./automation";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const HOURS_IN_WEEK = 7 * 24;

/** Posting times are learned once Listings go back this many days. */
export const LEARNING_DAYS = 28;

/** Busy hours are counted over this many days of listing times. */
export const POSTING_WINDOW_MS = LEARNING_DAYS * DAY_MS;

/** Never longer than this between scheduled full runs, once learned. */
export const MAX_FULL_RUN_GAP_MS = 6 * HOUR_MS;

/** A full run this often in a busy hour and the hour after it. */
export const BUSY_RUN_EVERY_MS = HOUR_MS;

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
 * Whether a scheduled ask at `now` starts a full run. With busy hours
 * learned: every hour in a busy hour and the hour after (whose run catches
 * the busy hour's Listings), else once 6 hours have passed. Otherwise every
 * 3 hours. The 6 hours are asked for 20 minutes early (two asks), so
 * neither the wait for the next ask nor a run still open passes them.
 * None yet: due.
 */
export function fullRunDue({
	lastFullRunAt,
	timing,
	now,
}: {
	lastFullRunAt: number | null;
	timing: RunTiming;
	now: number;
}): boolean {
	if (lastFullRunAt === null) return true;
	const since = now - lastFullRunAt;
	// Half a tick early, so a run asked for a few seconds late still counts.
	const slack = SCHEDULE_TICK_MS / 2;
	if (timing.status === "learning" || timing.busyHours.length === 0) {
		return since >= FULL_RUN_EVERY_MS - slack;
	}
	// Two asks early: the next ask is a tick away, and one more covers an ask
	// that finds a run (a refresh) still open.
	if (since >= MAX_FULL_RUN_GAP_MS - 2 * SCHEDULE_TICK_MS) return true;
	const hour = hourOfWeek(now, timing.timeZone);
	const previous = (hour + HOURS_IN_WEEK - 1) % HOURS_IN_WEEK;
	const busy =
		timing.busyHours.includes(hour) || timing.busyHours.includes(previous);
	return busy && since >= BUSY_RUN_EVERY_MS - slack;
}

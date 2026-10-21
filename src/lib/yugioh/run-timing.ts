// When scheduled full runs happen: a plan of 4 slots a day in my time zone,
// about 7 AM, 11 AM, 3 PM and 7 PM. The first slot falls between 6 and 9 AM,
// each next one about 4 hours later give or take 25 minutes, and about 1 day
// in 3 one slot is skipped. A day's plan is drawn once and stored, so every
// ask that day gets the same answer. Relative imports only (Convex imports
// this). How the runs are driven: docs/yugioh/automation.md.

const MINUTE_MS = 60 * 1000;

/**
 * The LaunchAgent asks the app whether a run is due this often. Here, not in
 * automation.ts, so timing rules can use it without a circular import.
 */
export const SCHEDULE_TICK_MS = 10 * MINUTE_MS;

/** Full runs planned a day. */
export const SLOTS_PER_DAY = 4;

/** The first slot falls from this many minutes after midnight (6 AM)… */
export const FIRST_SLOT_FROM_MINUTES = 6 * 60;
/** …to this many (9 AM), local time. */
export const FIRST_SLOT_UNTIL_MINUTES = 9 * 60;

/** Each next slot is about this long after the one before (4 hours)… */
export const SLOT_GAP_MINUTES = 4 * 60;
/** …give or take up to this long. */
export const SLOT_JITTER_MINUTES = 25;

/** The chance that a day skips one of its slots, picked at random. */
export const SKIP_CHANCE = 1 / 3;

/**
 * `planned`: still to come, or due. `skipped`: dropped when the day was
 * drawn. `ran`: a scheduled full run started for it. `passed`: missed (the
 * Mac slept, a cool-down) and folded into a later slot's run.
 */
export type RunSlotStatus = "planned" | "skipped" | "ran" | "passed";

/** One planned full run: when (Unix ms) and what became of it. */
export type RunSlot = { at: number; status: RunSlotStatus };

/** A day's plan of full runs: its local date (`YYYY-MM-DD`) in `timeZone`. */
export type RunDay = { date: string; timeZone: string; slots: RunSlot[] };

/** The calendar date (`YYYY-MM-DD`) `time` falls on in `timeZone`. */
export function localDate(time: number, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date(time));
	const part = (type: string) =>
		parts.find((entry) => entry.type === type)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The day's plan, from `draw` (Math.random in the app): the first slot's
 * time, then each next slot's jitter, then whether a slot is skipped and,
 * if so, which.
 */
export function planRunDay(
	date: string,
	timeZone: string,
	draw: () => number,
): RunDay {
	const minutes: number[] = [
		FIRST_SLOT_FROM_MINUTES +
			draw() * (FIRST_SLOT_UNTIL_MINUTES - FIRST_SLOT_FROM_MINUTES),
	];
	for (let slot = 1; slot < SLOTS_PER_DAY; slot++) {
		const previous = minutes[slot - 1] ?? FIRST_SLOT_FROM_MINUTES;
		const jitter = (draw() * 2 - 1) * SLOT_JITTER_MINUTES;
		minutes.push(previous + SLOT_GAP_MINUTES + jitter);
	}
	const skipped =
		draw() < SKIP_CHANCE
			? Math.min(SLOTS_PER_DAY - 1, Math.floor(draw() * SLOTS_PER_DAY))
			: null;
	return {
		date,
		timeZone,
		slots: minutes.map((minute, index) => ({
			at: zonedTime(date, Math.round(minute), timeZone),
			status: index === skipped ? "skipped" : "planned",
		})),
	};
}

/**
 * The slot a scheduled ask at `now` runs, as its index: the latest planned
 * slot whose time has passed, so slots missed while the Mac slept give one
 * run, not several. Slots before `notBefore` (a check page's cool-down, or a
 * full run that was going at the time) aren't due. Null when none is.
 */
export function dueSlot(
	slots: readonly RunSlot[],
	notBefore: number | null,
	now: number,
): number | null {
	let due: number | null = null;
	slots.forEach((slot, index) => {
		if (slot.status !== "planned" || slot.at > now) return;
		if (notBefore !== null && slot.at < notBefore) return;
		due = index;
	});
	return due;
}

/**
 * The slots after the run for slot `index` starts: it ran, and every
 * earlier slot still planned passed (folded into this run).
 */
export function takeSlot(slots: readonly RunSlot[], index: number): RunSlot[] {
	return slots.map((slot, i) => {
		if (i === index) return { ...slot, status: "ran" };
		if (i < index && slot.status === "planned") {
			return { ...slot, status: "passed" };
		}
		return slot;
	});
}

/**
 * The Unix ms of `minutes` after midnight on `date` (`YYYY-MM-DD`) in
 * `timeZone`, on the local clock (DST included).
 */
function zonedTime(date: string, minutes: number, timeZone: string): number {
	const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
	const wall = Date.UTC(year, month - 1, day, 0, minutes);
	// Guess with the offset at the wall time, then correct with the offset
	// at the guess, which is right unless the time falls in a DST gap.
	const guess = wall - zoneOffset(wall, timeZone);
	return wall - zoneOffset(guess, timeZone);
}

/** How far `timeZone`'s clock is ahead of UTC at `time`, in ms. */
function zoneOffset(time: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
	}).formatToParts(new Date(time));
	const part = (type: string) =>
		Number(parts.find((entry) => entry.type === type)?.value ?? 0);
	const asUtc = Date.UTC(
		part("year"),
		part("month") - 1,
		part("day"),
		part("hour"),
		part("minute"),
		part("second"),
	);
	return asUtc - Math.floor(time / 1000) * 1000;
}

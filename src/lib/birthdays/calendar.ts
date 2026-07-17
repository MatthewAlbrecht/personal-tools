import type { CalendarDate, ReminderStep } from "./types";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
	if (month === 2) {
		return isLeapYear(year) ? 29 : 28;
	}
	return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function isValidBirthdayDate(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12) return false;
	if (day < 1) return false;
	// Allow Feb 29 as a birthday even in non-leap display years
	const maxDay = month === 2 ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
	return day <= maxDay;
}

export function clampDay(year: number, month: number, day: number): number {
	return Math.min(day, daysInMonth(year, month));
}

export function addDays(date: CalendarDate, delta: number): CalendarDate {
	const utc = Date.UTC(date.year, date.month - 1, date.day);
	const next = new Date(utc + delta * 24 * 60 * 60 * 1000);
	return {
		year: next.getUTCFullYear(),
		month: next.getUTCMonth() + 1,
		day: next.getUTCDate(),
	};
}

export function computeStepDate(
	month: number,
	day: number,
	step: ReminderStep,
	occurrenceYear: number,
): CalendarDate {
	const birthdayDay = clampDay(occurrenceYear, month, day);
	const birthday: CalendarDate = {
		year: occurrenceYear,
		month,
		day: birthdayDay,
	};

	if (step === "day_of") return birthday;
	if (step === "day_before") return addDays(birthday, -1);
	if (step === "week") return addDays(birthday, -7);

	// month: same day one calendar month earlier, clamp
	let priorMonth = month - 1;
	let priorYear = occurrenceYear;
	if (priorMonth < 1) {
		priorMonth = 12;
		priorYear = occurrenceYear - 1;
	}
	return {
		year: priorYear,
		month: priorMonth,
		day: clampDay(priorYear, priorMonth, day),
	};
}

export function calendarDateInTimeZone(
	ms: number,
	timeZone: string,
): CalendarDate {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	}).formatToParts(new Date(ms));

	function part(type: Intl.DateTimeFormatPartTypes): number {
		const value = parts.find((p) => p.type === type)?.value;
		if (!value) throw new Error(`Missing ${type} in date parts`);
		return Number.parseInt(value, 10);
	}

	return { year: part("year"), month: part("month"), day: part("day") };
}

export function todayInMountainTime(nowMs: number): CalendarDate {
	return calendarDateInTimeZone(nowMs, "America/Denver");
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
	if (a.year !== b.year) return a.year - b.year;
	if (a.month !== b.month) return a.month - b.month;
	return a.day - b.day;
}

export function datesEqual(a: CalendarDate, b: CalendarDate): boolean {
	return compareCalendarDates(a, b) === 0;
}

export function daysUntil(from: CalendarDate, to: CalendarDate): number {
	const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
	const toUtc = Date.UTC(to.year, to.month - 1, to.day);
	return Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}

export function nextBirthdayOccurrence(
	month: number,
	day: number,
	today: CalendarDate,
): CalendarDate {
	const thisYearDay = clampDay(today.year, month, day);
	const candidate: CalendarDate = {
		year: today.year,
		month,
		day: thisYearDay,
	};
	if (compareCalendarDates(candidate, today) >= 0) {
		return candidate;
	}
	const nextYear = today.year + 1;
	return {
		year: nextYear,
		month,
		day: clampDay(nextYear, month, day),
	};
}

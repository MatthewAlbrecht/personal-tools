import {
	computeStepDate,
	datesEqual,
	daysUntil,
} from "./calendar";
import type {
	BirthdayPersonInput,
	CalendarDate,
	DueReminder,
	ReminderStep,
} from "./types";

export const REMINDER_LADDER: ReminderStep[] = [
	"month",
	"week",
	"day_before",
	"day_of",
];

export function stepsFromEntry(entryPoint: ReminderStep): ReminderStep[] {
	const index = REMINDER_LADDER.indexOf(entryPoint);
	if (index < 0) return [];
	return REMINDER_LADDER.slice(index);
}

export function stepLabel(step: ReminderStep): string {
	switch (step) {
		case "month":
			return "1 month out";
		case "week":
			return "1 week out";
		case "day_before":
			return "day before";
		case "day_of":
			return "today";
	}
}

export function getDueReminders(
	people: BirthdayPersonInput[],
	today: CalendarDate,
): DueReminder[] {
	const due: DueReminder[] = [];
	const yearsToCheck = [today.year - 1, today.year, today.year + 1];

	for (const person of people) {
		for (const step of stepsFromEntry(person.entryPoint)) {
			for (const occurrenceYear of yearsToCheck) {
				const stepDate = computeStepDate(
					person.month,
					person.day,
					step,
					occurrenceYear,
				);
				if (!datesEqual(stepDate, today)) continue;

				const birthdayDate = computeStepDate(
					person.month,
					person.day,
					"day_of",
					occurrenceYear,
				);
				const age =
					person.birthYear !== undefined
						? occurrenceYear - person.birthYear
						: undefined;

				due.push({
					birthdayId: person.id,
					name: person.name,
					month: person.month,
					day: person.day,
					birthYear: person.birthYear,
					step,
					occurrenceYear,
					age,
					daysUntilBirthday: daysUntil(today, birthdayDate),
				});
			}
		}
	}

	return due;
}

export function buildDigestSubject(dueItems: DueReminder[]): string | null {
	if (dueItems.length === 0) return null;

	const todays = dueItems.filter((item) => item.step === "day_of");
	const upcoming = dueItems.filter((item) => item.step !== "day_of");

	if (todays.length === 1 && upcoming.length === 0) {
		return `🎂 ${todays[0]!.name}'s birthday is today`;
	}

	if (todays.length > 0 && upcoming.length > 0) {
		const weekish = upcoming.find((item) => item.daysUntilBirthday === 7);
		if (todays.length >= 1 && weekish && upcoming.length === 1) {
			return `🎂 ${todays.length} birthday${todays.length === 1 ? "" : "s"} today, 1 reminder in 7 days`;
		}
		return `🎂 ${todays.length} birthday${todays.length === 1 ? "" : "s"} today, ${upcoming.length} upcoming reminder${upcoming.length === 1 ? "" : "s"}`;
	}

	if (todays.length > 1) {
		return `🎂 ${todays.length} birthdays today`;
	}

	return `🎂 ${dueItems.length} upcoming birthday reminder${dueItems.length === 1 ? "" : "s"}`;
}

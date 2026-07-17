import assert from "node:assert/strict";
import test from "node:test";
import {
	buildDigestSubject,
	getDueReminders,
	stepsFromEntry,
} from "./reminders";
import type { BirthdayPersonInput } from "./types";

test("stepsFromEntry returns suffix of ladder", () => {
	assert.deepEqual(stepsFromEntry("month"), [
		"month",
		"week",
		"day_before",
		"day_of",
	]);
	assert.deepEqual(stepsFromEntry("week"), [
		"week",
		"day_before",
		"day_of",
	]);
	assert.deepEqual(stepsFromEntry("day_before"), ["day_before", "day_of"]);
	assert.deepEqual(stepsFromEntry("day_of"), ["day_of"]);
});

test("getDueReminders respects entry point", () => {
	const people: BirthdayPersonInput[] = [
		{
			id: "1",
			name: "Sister",
			month: 7,
			day: 17,
			entryPoint: "month",
			birthYear: 1990,
		},
		{
			id: "2",
			name: "Local",
			month: 7,
			day: 17,
			entryPoint: "week",
		},
	];
	// One month before Jul 17 = Jun 17
	const due = getDueReminders(people, { year: 2026, month: 6, day: 17 });
	assert.equal(due.length, 1);
	assert.equal(due[0]?.name, "Sister");
	assert.equal(due[0]?.step, "month");
	assert.equal(due[0]?.occurrenceYear, 2026);
	assert.equal(due[0]?.age, 36);
});

test("getDueReminders year-boundary month reminder", () => {
	const people: BirthdayPersonInput[] = [
		{
			id: "1",
			name: "Jan",
			month: 1,
			day: 5,
			entryPoint: "month",
		},
	];
	const due = getDueReminders(people, { year: 2025, month: 12, day: 5 });
	assert.equal(due.length, 1);
	assert.equal(due[0]?.step, "month");
	assert.equal(due[0]?.occurrenceYear, 2026);
	assert.equal(due[0]?.daysUntilBirthday, 31);
});

test("buildDigestSubject is content-aware", () => {
	assert.equal(buildDigestSubject([]), null);
	assert.equal(
		buildDigestSubject([
			{
				birthdayId: "1",
				name: "Jane",
				month: 7,
				day: 17,
				step: "day_of",
				occurrenceYear: 2026,
				daysUntilBirthday: 0,
			},
		]),
		"🎂 Jane's birthday is today",
	);
	assert.equal(
		buildDigestSubject([
			{
				birthdayId: "1",
				name: "A",
				month: 7,
				day: 17,
				step: "day_of",
				occurrenceYear: 2026,
				daysUntilBirthday: 0,
			},
			{
				birthdayId: "2",
				name: "B",
				month: 7,
				day: 18,
				step: "day_of",
				occurrenceYear: 2026,
				daysUntilBirthday: 0,
			},
			{
				birthdayId: "3",
				name: "C",
				month: 7,
				day: 24,
				step: "week",
				occurrenceYear: 2026,
				daysUntilBirthday: 7,
			},
		]),
		"🎂 2 birthdays today, 1 reminder in 7 days",
	);
	assert.equal(
		buildDigestSubject([
			{
				birthdayId: "1",
				name: "A",
				month: 8,
				day: 1,
				step: "month",
				occurrenceYear: 2026,
				daysUntilBirthday: 30,
			},
			{
				birthdayId: "2",
				name: "B",
				month: 8,
				day: 2,
				step: "week",
				occurrenceYear: 2026,
				daysUntilBirthday: 7,
			},
			{
				birthdayId: "3",
				name: "C",
				month: 8,
				day: 3,
				step: "day_before",
				occurrenceYear: 2026,
				daysUntilBirthday: 1,
			},
		]),
		"🎂 3 upcoming birthday reminders",
	);
});

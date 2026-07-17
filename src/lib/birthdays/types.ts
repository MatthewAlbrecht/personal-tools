export type ReminderStep = "month" | "week" | "day_before" | "day_of";

export type CalendarDate = {
	year: number;
	month: number;
	day: number;
};

export type BirthdayPersonInput = {
	id: string;
	name: string;
	month: number;
	day: number;
	birthYear?: number;
	entryPoint: ReminderStep;
};

export type DueReminder = {
	birthdayId: string;
	name: string;
	month: number;
	day: number;
	birthYear?: number;
	step: ReminderStep;
	occurrenceYear: number;
	age?: number;
	daysUntilBirthday: number;
};

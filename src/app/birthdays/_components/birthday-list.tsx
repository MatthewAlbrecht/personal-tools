"use client";

import { useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
	compareCalendarDates,
	computeStepDate,
	nextBirthdayOccurrence,
	todayInMountainTime,
} from "~/lib/birthdays/calendar";
import { stepLabel, stepsFromEntry } from "~/lib/birthdays/reminders";
import type { CalendarDate, ReminderStep } from "~/lib/birthdays/types";
import type { Doc } from "../../../../convex/_generated/dataModel";

export function BirthdayList({
	items,
	onEdit,
	onDelete,
}: {
	items: Doc<"birthdays">[];
	onEdit: (item: Doc<"birthdays">) => void;
	onDelete: (item: Doc<"birthdays">) => void;
}) {
	const today = todayInMountainTime(Date.now());
	const sortedItems = useMemo(
		() =>
			[...items].sort((a, b) =>
				compareCalendarDates(
					nextBirthdayOccurrence(a.month, a.day, today),
					nextBirthdayOccurrence(b.month, b.day, today),
				),
			),
		[items, today],
	);

	if (sortedItems.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground text-sm">
					No birthdays yet. Add someone to start tracking reminders.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{sortedItems.map((item) => (
				<BirthdayRow
					key={item._id}
					item={item}
					onDelete={() => onDelete(item)}
					onEdit={() => onEdit(item)}
					today={today}
				/>
			))}
		</div>
	);
}

function BirthdayRow({
	item,
	onEdit,
	onDelete,
	today,
}: {
	item: Doc<"birthdays">;
	onEdit: () => void;
	onDelete: () => void;
	today: CalendarDate;
}) {
	const nextOccurrence = nextBirthdayOccurrence(item.month, item.day, today);
	const nextReminder = findNextReminder(item, today);
	const age =
		item.birthYear !== undefined
			? nextOccurrence.year - item.birthYear
			: undefined;

	return (
		<Card>
			<CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{item.name}</p>
						<Badge variant="outline">Starts {stepLabel(item.entryPoint)}</Badge>
					</div>
					<p className="text-sm">
						{formatMonthDay(item.month, item.day)}
						{age !== undefined ? ` · Turning ${age}` : ""}
					</p>
					<p className="text-muted-foreground text-sm">
						{nextReminder
							? `Next reminder: ${stepLabel(nextReminder.step)} · ${formatCalendarDate(nextReminder.date)}`
							: "No upcoming reminder"}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button onClick={onEdit} size="sm" type="button" variant="outline">
						Edit
					</Button>
					<Button
						onClick={onDelete}
						size="sm"
						type="button"
						variant="destructive"
					>
						Delete
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function findNextReminder(
	item: Doc<"birthdays">,
	today: CalendarDate,
): { date: CalendarDate; step: ReminderStep } | null {
	let next: { date: CalendarDate; step: ReminderStep } | null = null;
	const occurrenceYears = [today.year - 1, today.year, today.year + 1];

	for (const step of stepsFromEntry(item.entryPoint)) {
		for (const occurrenceYear of occurrenceYears) {
			const date = computeStepDate(item.month, item.day, step, occurrenceYear);
			if (compareCalendarDates(date, today) < 0) continue;
			if (!next || compareCalendarDates(date, next.date) < 0) {
				next = { date, step };
			}
		}
	}

	return next;
}

function formatMonthDay(month: number, day: number): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(2000, month - 1, day)));
}

function formatCalendarDate(date: CalendarDate): string {
	return formatMonthDay(date.month, date.day);
}

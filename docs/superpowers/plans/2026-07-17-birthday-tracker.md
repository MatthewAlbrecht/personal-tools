# Birthday Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/birthdays` CRUD for people plus a daily noon-ish Mountain Time digest email of due drip reminders (entry point into a fixed month → week → day_before → day_of ladder).

**Architecture:** Pure calendar helpers in `src/lib/birthdays/` drive due detection. Convex stores `birthdays` + `birthdayReminderDeliveries`. A Vercel Pages cron (`CRON_SECRET`) loads people for `SPOTIFY_SYNC_USER_ID`, filters already-delivered steps, sends one Resend digest to `NOTIFICATION_EMAIL`, then records deliveries. UI uses `useAuthToken()` for `userId` like Concerts.

**Tech Stack:** Next.js 15 App Router, Convex, Resend + React Email, Vercel cron, TypeScript, Biome, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-17-birthday-tracker-design.md`

## Global Constraints

- Reminder ladder is fixed: `month` → `week` → `day_before` → `day_of`
- Per person: only `entryPoint` controls which suffix of the ladder fires
- One daily digest email to `NOTIFICATION_EMAIL` only; subject must be content-aware
- All “today” / due math in `America/Denver`
- `month` step = same calendar day one month earlier, clamp to last day of prior month
- Cron schedule `0 18 * * *` UTC (≈ noon MDT); exact noon year-round not required
- `userId` is `v.string()` (AUTH username / `SPOTIFY_SYNC_USER_ID`), not a Convex `users` table id
- Classic function declarations; `type` aliases; kebab-case filenames; env via `~/env.js`
- No notes/gift fields, no multi-recipient, no dashboard module, no custom offsets

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/birthdays/types.ts` | Shared types (`ReminderStep`, person input, due item) |
| Create | `src/lib/birthdays/calendar.ts` | Valid date, step date, today-in-MT, next occurrence |
| Create | `src/lib/birthdays/reminders.ts` | Ladder suffix, due reminders, digest subject |
| Create | `src/lib/birthdays/calendar.test.ts` | Calendar / clamp / MT today tests |
| Create | `src/lib/birthdays/reminders.test.ts` | Entry point, year boundary, subject tests |
| Modify | `convex/schema.ts` | `birthdays` + `birthdayReminderDeliveries` tables |
| Create | `convex/birthdays.ts` | CRUD + cron list/filter/record |
| Create | `src/lib/emails/birthday-digest.tsx` | React Email digest body |
| Modify | `src/lib/email.tsx` | `sendBirthdayDigestEmail` |
| Create | `src/pages/api/cron/send-birthday-reminders.ts` | Cron orchestration |
| Modify | `vercel.json` | Add birthday cron schedule |
| Create | `src/app/birthdays/page.tsx` | List + form UI |
| Create | `src/app/birthdays/_components/birthday-form.tsx` | Create/edit form |
| Create | `src/app/birthdays/_components/birthday-list.tsx` | Sorted list rows |
| Modify | `src/middleware.ts` | Protect `/birthdays` |
| Modify | `src/app/_components/site-header.tsx` | Nav link |
| Modify | `src/app/page.tsx` | Home link when authed |
| Modify | `docs/ideas/2026-07-10-birthday-tracker-with-per-person-email-reminders.md` | `status: planned` + links |

---

### Task 1: Calendar helpers (TDD)

**Files:**
- Create: `src/lib/birthdays/types.ts`
- Create: `src/lib/birthdays/calendar.ts`
- Create: `src/lib/birthdays/calendar.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ReminderStep = "month" | "week" | "day_before" | "day_of"`
  - `type CalendarDate = { year: number; month: number; day: number }`
  - `function isValidBirthdayDate(month: number, day: number): boolean`
  - `function computeStepDate(month: number, day: number, step: ReminderStep, occurrenceYear: number): CalendarDate`
  - `function calendarDateInTimeZone(ms: number, timeZone: string): CalendarDate`
  - `function todayInMountainTime(nowMs: number): CalendarDate`
  - `function daysUntil(from: CalendarDate, to: CalendarDate): number`
  - `function nextBirthdayOccurrence(month: number, day: number, today: CalendarDate): CalendarDate`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/birthdays/calendar.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	calendarDateInTimeZone,
	computeStepDate,
	isValidBirthdayDate,
	nextBirthdayOccurrence,
	todayInMountainTime,
} from "./calendar";

test("isValidBirthdayDate rejects Feb 30 and accepts Feb 29", () => {
	assert.equal(isValidBirthdayDate(2, 30), false);
	assert.equal(isValidBirthdayDate(2, 29), true);
	assert.equal(isValidBirthdayDate(4, 31), false);
	assert.equal(isValidBirthdayDate(1, 31), true);
});

test("computeStepDate day_of and day_before", () => {
	assert.deepEqual(computeStepDate(7, 17, "day_of", 2026), {
		year: 2026,
		month: 7,
		day: 17,
	});
	assert.deepEqual(computeStepDate(7, 17, "day_before", 2026), {
		year: 2026,
		month: 7,
		day: 16,
	});
});

test("computeStepDate week is 7 days before", () => {
	assert.deepEqual(computeStepDate(7, 17, "week", 2026), {
		year: 2026,
		month: 7,
		day: 10,
	});
});

test("computeStepDate month clamps Jan 31 to Feb 28/29", () => {
	assert.deepEqual(computeStepDate(1, 31, "month", 2026), {
		year: 2025,
		month: 12,
		day: 31,
	});
	// Birthday Mar 31 → one month earlier = Feb 28 2026 (non-leap)
	assert.deepEqual(computeStepDate(3, 31, "month", 2026), {
		year: 2026,
		month: 2,
		day: 28,
	});
	assert.deepEqual(computeStepDate(3, 31, "month", 2024), {
		year: 2024,
		month: 2,
		day: 29,
	});
});

test("computeStepDate month for Jan 5 is Dec 5 prior year", () => {
	assert.deepEqual(computeStepDate(1, 5, "month", 2026), {
		year: 2025,
		month: 12,
		day: 5,
	});
});

test("todayInMountainTime uses America/Denver", () => {
	// 2026-07-17 18:00 UTC = noon MDT
	const noonMdt = Date.UTC(2026, 6, 17, 18, 0, 0);
	assert.deepEqual(todayInMountainTime(noonMdt), {
		year: 2026,
		month: 7,
		day: 17,
	});
	assert.deepEqual(
		calendarDateInTimeZone(noonMdt, "America/Denver"),
		todayInMountainTime(noonMdt),
	);
});

test("nextBirthdayOccurrence wraps to next year", () => {
	assert.deepEqual(
		nextBirthdayOccurrence(7, 17, { year: 2026, month: 7, day: 17 }),
		{ year: 2026, month: 7, day: 17 },
	);
	assert.deepEqual(
		nextBirthdayOccurrence(7, 17, { year: 2026, month: 7, day: 18 }),
		{ year: 2027, month: 7, day: 17 },
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/birthdays/calendar.test.ts`  
Expected: FAIL — cannot find module `./calendar`

- [ ] **Step 3: Implement types + calendar helpers**

```typescript
// src/lib/birthdays/types.ts
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
```

```typescript
// src/lib/birthdays/calendar.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/birthdays/calendar.test.ts`  
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/birthdays/types.ts src/lib/birthdays/calendar.ts src/lib/birthdays/calendar.test.ts
git commit -m "$(cat <<'EOF'
feat(birthdays): add calendar helpers for reminder dates

EOF
)"
```

---

### Task 2: Reminder ladder + digest subject (TDD)

**Files:**
- Create: `src/lib/birthdays/reminders.ts`
- Create: `src/lib/birthdays/reminders.test.ts`

**Interfaces:**
- Consumes: `computeStepDate`, `datesEqual`, `daysUntil`, types from Task 1
- Produces:
  - `const REMINDER_LADDER: ReminderStep[]`
  - `function stepsFromEntry(entryPoint: ReminderStep): ReminderStep[]`
  - `function getDueReminders(people: BirthdayPersonInput[], today: CalendarDate): DueReminder[]`
  - `function buildDigestSubject(dueItems: DueReminder[]): string | null`
  - `function stepLabel(step: ReminderStep): string`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/birthdays/reminders.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/birthdays/reminders.test.ts`  
Expected: FAIL — cannot find module `./reminders`

- [ ] **Step 3: Implement reminders**

```typescript
// src/lib/birthdays/reminders.ts
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
```

Note: keep `buildDigestSubject` aligned with the three test cases above. If a mixed case does not hit the special “1 reminder in 7 days” branch, the generic mixed string is fine — but the tests pin the three examples from the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/birthdays/reminders.test.ts src/lib/birthdays/calendar.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/birthdays/reminders.ts src/lib/birthdays/reminders.test.ts
git commit -m "$(cat <<'EOF'
feat(birthdays): add ladder due detection and digest subjects

EOF
)"
```

---

### Task 3: Schema

**Files:**
- Modify: `convex/schema.ts` (append before the closing `});` of `defineSchema`)

**Interfaces:**
- Produces: tables `birthdays`, `birthdayReminderDeliveries`

- [ ] **Step 1: Add tables to schema**

Append inside `defineSchema({ ... })` before the final `});`:

```typescript
	birthdays: defineTable({
		userId: v.string(),
		name: v.string(),
		month: v.number(),
		day: v.number(),
		birthYear: v.optional(v.number()),
		entryPoint: v.union(
			v.literal("month"),
			v.literal("week"),
			v.literal("day_before"),
			v.literal("day_of"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_userId", ["userId"]),

	birthdayReminderDeliveries: defineTable({
		userId: v.string(),
		birthdayId: v.id("birthdays"),
		occurrenceYear: v.number(),
		step: v.union(
			v.literal("month"),
			v.literal("week"),
			v.literal("day_before"),
			v.literal("day_of"),
		),
		sentAt: v.number(),
	}).index("by_birthday_year_step", [
		"birthdayId",
		"occurrenceYear",
		"step",
	]),
```

- [ ] **Step 2: Ensure Convex picks up schema**

With `npx convex dev` already running locally, confirm no schema errors in the Convex CLI output. If not running, start it and wait for sync success.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "$(cat <<'EOF'
feat(birthdays): add birthdays and delivery tables

EOF
)"
```

---

### Task 4: Convex CRUD + cron helpers

**Files:**
- Create: `convex/birthdays.ts`

**Interfaces:**
- Consumes: `requireAuth`, schema tables, `isValidBirthdayDate` — **do not import from `src/` into Convex**. Duplicate a tiny `assertValidBirthdayDate` in `convex/birthdays.ts` (or put shared validation in `convex/_utils/birthdayDate.ts` if preferred; keep validation rules identical to `isValidBirthdayDate`).
- Produces:
  - `api.birthdays.list` — `{ userId: string }` → birthday docs
  - `api.birthdays.create` / `update` / `remove`
  - `api.birthdays.listForReminders` — `{ userId: string }` → people for cron
  - `api.birthdays.filterUndelivered` — `{ keys: { birthdayId, occurrenceYear, step }[] }` → undelivered keys
  - `api.birthdays.recordDeliveries` — insert delivery rows

- [ ] **Step 1: Implement `convex/birthdays.ts`**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./auth";
import type { Id } from "./_generated/dataModel";

const entryPointValidator = v.union(
	v.literal("month"),
	v.literal("week"),
	v.literal("day_before"),
	v.literal("day_of"),
);

const birthdayDocValidator = v.object({
	_id: v.id("birthdays"),
	_creationTime: v.number(),
	userId: v.string(),
	name: v.string(),
	month: v.number(),
	day: v.number(),
	birthYear: v.optional(v.number()),
	entryPoint: entryPointValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
});

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function assertValidBirthdayDate(month: number, day: number): void {
	if (!Number.isInteger(month) || month < 1 || month > 12) {
		throw new Error("Invalid birthday month");
	}
	if (!Number.isInteger(day) || day < 1) {
		throw new Error("Invalid birthday day");
	}
	const maxDay = month === 2 ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
	if (day > maxDay) {
		throw new Error("Invalid birthday date");
	}
}

export const list = query({
	args: { userId: v.string() },
	returns: v.array(birthdayDocValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("birthdays")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const listForReminders = query({
	args: { userId: v.string() },
	returns: v.array(birthdayDocValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("birthdays")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const create = mutation({
	args: {
		userId: v.string(),
		name: v.string(),
		month: v.number(),
		day: v.number(),
		birthYear: v.optional(v.number()),
		entryPoint: entryPointValidator,
	},
	returns: v.id("birthdays"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		assertValidBirthdayDate(args.month, args.day);
		const trimmed = args.name.trim();
		if (!trimmed) throw new Error("Name is required");
		const now = Date.now();
		return await ctx.db.insert("birthdays", {
			userId: args.userId,
			name: trimmed,
			month: args.month,
			day: args.day,
			birthYear: args.birthYear,
			entryPoint: args.entryPoint,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		id: v.id("birthdays"),
		userId: v.string(),
		name: v.string(),
		month: v.number(),
		day: v.number(),
		birthYear: v.optional(v.number()),
		entryPoint: entryPointValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		assertValidBirthdayDate(args.month, args.day);
		const existing = await ctx.db.get(args.id);
		if (!existing || existing.userId !== args.userId) {
			throw new Error("Birthday not found");
		}
		const trimmed = args.name.trim();
		if (!trimmed) throw new Error("Name is required");
		await ctx.db.patch(args.id, {
			name: trimmed,
			month: args.month,
			day: args.day,
			birthYear: args.birthYear,
			entryPoint: args.entryPoint,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const remove = mutation({
	args: {
		id: v.id("birthdays"),
		userId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing || existing.userId !== args.userId) {
			throw new Error("Birthday not found");
		}
		await ctx.db.delete(args.id);
		return null;
	},
});

const deliveryKeyValidator = v.object({
	birthdayId: v.id("birthdays"),
	occurrenceYear: v.number(),
	step: entryPointValidator,
});

export const filterUndelivered = query({
	args: {
		keys: v.array(deliveryKeyValidator),
	},
	returns: v.array(deliveryKeyValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const undelivered: Array<{
			birthdayId: Id<"birthdays">;
			occurrenceYear: number;
			step: "month" | "week" | "day_before" | "day_of";
		}> = [];

		for (const key of args.keys) {
			const existing = await ctx.db
				.query("birthdayReminderDeliveries")
				.withIndex("by_birthday_year_step", (q) =>
					q
						.eq("birthdayId", key.birthdayId)
						.eq("occurrenceYear", key.occurrenceYear)
						.eq("step", key.step),
				)
				.first();
			if (!existing) {
				undelivered.push(key);
			}
		}
		return undelivered;
	},
});

export const recordDeliveries = mutation({
	args: {
		userId: v.string(),
		items: v.array(deliveryKeyValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const sentAt = Date.now();
		for (const item of args.items) {
			const existing = await ctx.db
				.query("birthdayReminderDeliveries")
				.withIndex("by_birthday_year_step", (q) =>
					q
						.eq("birthdayId", item.birthdayId)
						.eq("occurrenceYear", item.occurrenceYear)
						.eq("step", item.step),
				)
				.first();
			if (existing) continue;
			await ctx.db.insert("birthdayReminderDeliveries", {
				userId: args.userId,
				birthdayId: item.birthdayId,
				occurrenceYear: item.occurrenceYear,
				step: item.step,
				sentAt,
			});
		}
		return null;
	},
});
```

- [ ] **Step 2: Typecheck Convex module**

Run: `pnpm typecheck`  
Expected: no errors related to `convex/birthdays.ts` / schema

- [ ] **Step 3: Commit**

```bash
git add convex/birthdays.ts convex/_generated/
git commit -m "$(cat <<'EOF'
feat(birthdays): add Convex CRUD and delivery helpers

EOF
)"
```

(If `_generated` is gitignored, omit it.)

---

### Task 5: Digest email sender

**Files:**
- Create: `src/lib/emails/birthday-digest.tsx`
- Modify: `src/lib/email.tsx`

**Interfaces:**
- Consumes: `DueReminder` shape (or a parallel email DTO), `buildDigestSubject`, Resend, `env`
- Produces: `sendBirthdayDigestEmail(dueItems): Promise<{ id?: string } | undefined>` — returns early / skips when subject is null

- [ ] **Step 1: Add React Email component**

Mirror structure/style of `src/lib/emails/folio-notification.tsx` (Html/Head/Body/Container/Heading/Text). List each due item with name, birthday `month/day`, `stepLabel(step)`, optional age, and days until birthday.

Use classic `function BirthdayDigestEmail(...)` export (not arrow). Prefer `type` for props.

- [ ] **Step 2: Add `sendBirthdayDigestEmail` to `src/lib/email.tsx`**

```typescript
import { BirthdayDigestEmail } from "./emails/birthday-digest";
import { buildDigestSubject, stepLabel } from "./birthdays/reminders";
import type { DueReminder } from "./birthdays/types";

export async function sendBirthdayDigestEmail(dueItems: DueReminder[]) {
	const subject = buildDigestSubject(dueItems);
	if (!subject) {
		console.log("📧 No birthday reminders due, skipping email");
		return;
	}

	try {
		console.log(`📧 Sending birthday digest (${dueItems.length} items)...`);
		const result = await resend.emails.send({
			from: "Birthday Tracker <notifications@moooose.dev>",
			to: env.NOTIFICATION_EMAIL,
			subject,
			react: <BirthdayDigestEmail dueItems={dueItems} />,
		});
		console.log("✅ Birthday digest sent:", result.data?.id);
		return result;
	} catch (error) {
		console.error("❌ Failed to send birthday digest:", error);
		throw error;
	}
}
```

Wire `stepLabel` into the email component props or call it inside the component via import from `~/lib/birthdays/reminders`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/emails/birthday-digest.tsx src/lib/email.tsx
git commit -m "$(cat <<'EOF'
feat(birthdays): add Resend digest email

EOF
)"
```

---

### Task 6: Cron route + Vercel schedule

**Files:**
- Create: `src/pages/api/cron/send-birthday-reminders.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `api.birthdays.listForReminders`, `filterUndelivered`, `recordDeliveries`, `getDueReminders`, `todayInMountainTime`, `sendBirthdayDigestEmail`, `env.CRON_SECRET`, `env.SPOTIFY_SYNC_USER_ID`

- [ ] **Step 1: Implement cron handler**

```typescript
import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env.js";
import { todayInMountainTime } from "~/lib/birthdays/calendar";
import { getDueReminders } from "~/lib/birthdays/reminders";
import type { BirthdayPersonInput } from "~/lib/birthdays/types";
import { sendBirthdayDigestEmail } from "~/lib/email";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userParam = req.query.user;
	const userId =
		typeof userParam === "string" && userParam.trim()
			? userParam.trim()
			: env.SPOTIFY_SYNC_USER_ID;

	try {
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const people = await convex.query(api.birthdays.listForReminders, {
			userId,
		});

		const today = todayInMountainTime(Date.now());
		const inputs: BirthdayPersonInput[] = people.map((person) => ({
			id: person._id,
			name: person.name,
			month: person.month,
			day: person.day,
			birthYear: person.birthYear,
			entryPoint: person.entryPoint,
		}));

		const due = getDueReminders(inputs, today);
		if (due.length === 0) {
			return res.status(200).json({ ok: true, sent: false, reason: "nothing_due" });
		}

		const keys = due.map((item) => ({
			birthdayId: item.birthdayId as Id<"birthdays">,
			occurrenceYear: item.occurrenceYear,
			step: item.step,
		}));

		const undeliveredKeys = await convex.query(api.birthdays.filterUndelivered, {
			keys,
		});
		const undeliveredSet = new Set(
			undeliveredKeys.map(
				(k) => `${k.birthdayId}:${k.occurrenceYear}:${k.step}`,
			),
		);
		const toSend = due.filter((item) =>
			undeliveredSet.has(
				`${item.birthdayId}:${item.occurrenceYear}:${item.step}`,
			),
		);

		if (toSend.length === 0) {
			return res.status(200).json({
				ok: true,
				sent: false,
				reason: "already_delivered",
			});
		}

		await sendBirthdayDigestEmail(toSend);

		await convex.mutation(api.birthdays.recordDeliveries, {
			userId,
			items: toSend.map((item) => ({
				birthdayId: item.birthdayId as Id<"birthdays">,
				occurrenceYear: item.occurrenceYear,
				step: item.step,
			})),
		});

		return res.status(200).json({
			ok: true,
			sent: true,
			count: toSend.length,
		});
	} catch (error) {
		console.error("❌ Birthday reminder cron failed:", error);
		return res.status(500).json({
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}
```

Critical: on Resend failure, do **not** call `recordDeliveries` (the `await sendBirthdayDigestEmail` throw path handles this).

- [ ] **Step 2: Update `vercel.json`**

```json
{
	"crons": [
		{
			"path": "/api/cron/sync-folio",
			"schedule": "30 8 * * *"
		},
		{
			"path": "/api/cron/send-birthday-reminders",
			"schedule": "0 18 * * *"
		}
	]
}
```

- [ ] **Step 3: Manual smoke (optional local)**

If env is available: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:1333/api/cron/send-birthday-reminders`  
Expected: 200 JSON with `sent: false` when nothing due.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/send-birthday-reminders.ts vercel.json
git commit -m "$(cat <<'EOF'
feat(birthdays): add daily reminder digest cron

EOF
)"
```

---

### Task 7: `/birthdays` UI

**Files:**
- Create: `src/app/birthdays/page.tsx`
- Create: `src/app/birthdays/_components/birthday-form.tsx`
- Create: `src/app/birthdays/_components/birthday-list.tsx`

**Interfaces:**
- Consumes: `api.birthdays.list|create|update|remove`, `useAuthToken`, helpers `nextBirthdayOccurrence`, `stepsFromEntry`, `computeStepDate`, `todayInMountainTime`, `stepLabel`
- Produces: working authenticated page

**UI requirements:**
- List sorted by next birthday occurrence (soonest first)
- Each row: name, `Mon D` date, optional age (from next occurrence year − birthYear), entry point label, next reminder hint (earliest upcoming step date ≥ today among `stepsFromEntry`)
- Add form always visible or “Add person” toggling the form
- Edit inline or via same form with `editingId`
- Entry point `<select>` with helper text: “Gets this reminder and everything after (week, day before, day of as applicable).”
- Delete uses `window.confirm`
- Empty state when list is empty
- Match existing personal-tools styling (simple layout, `Button`/`Input` from shadcn, no new design system)

- [ ] **Step 1: Implement form component**

`birthday-form.tsx`: props `{ initial?, onSubmit, onCancel?, submitLabel }`. Fields: name (text), month (1–12 number), day (1–31 number), birthYear (optional number), entryPoint select. Classic function component; inline props type.

- [ ] **Step 2: Implement list component**

`birthday-list.tsx`: props `{ items, onEdit, onDelete }`. Sort with `nextBirthdayOccurrence` + `compareCalendarDates`. Show next reminder hint by scanning `stepsFromEntry(entryPoint)` for the soonest `computeStepDate` ≥ today (check occurrence years as in `getDueReminders`).

- [ ] **Step 3: Implement page**

`page.tsx` (`"use client"`):

```typescript
const { userId, isLoading } = useAuthToken();
const birthdays = useQuery(
  api.birthdays.list,
  userId ? { userId } : "skip",
);
// create/update/remove mutations with toast.success / toast.error
```

- [ ] **Step 4: Manual UI check**

Run: `pnpm dev` → open `/birthdays` while signed in  
Verify: create person at `month`, edit to `week`, delete, empty state.

- [ ] **Step 5: Commit**

```bash
git add src/app/birthdays/
git commit -m "$(cat <<'EOF'
feat(birthdays): add /birthdays list and form UI

EOF
)"
```

---

### Task 8: Nav, middleware, home link + idea status

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/_components/site-header.tsx`
- Modify: `src/app/page.tsx`
- Modify: `docs/ideas/2026-07-10-birthday-tracker-with-per-person-email-reminders.md`

- [ ] **Step 1: Protect `/birthdays` in middleware**

Add `isBirthdays = request.nextUrl.pathname.startsWith("/birthdays")` to the auth gate condition, and add `"/birthdays"` + `"/birthdays/:path*"` to `config.matcher`.

- [ ] **Step 2: Add header + home links**

In `site-header.tsx` authenticated nav, add:

```tsx
<Link href="/birthdays" className="text-sm hover:underline">
  Birthdays
</Link>
```

In `page.tsx` authenticated block, add a Link to `/birthdays` labeled `Birthdays →` consistent with neighbors.

- [ ] **Step 3: Mark idea planned**

Update frontmatter `status: planned` and add Notes bullet:

```markdown
- Planned — spec: `docs/superpowers/specs/2026-07-17-birthday-tracker-design.md`, plan: `docs/superpowers/plans/2026-07-17-birthday-tracker.md`
```

- [ ] **Step 4: Final verification**

Run:

```bash
npx tsx --test src/lib/birthdays/calendar.test.ts src/lib/birthdays/reminders.test.ts
pnpm typecheck
pnpm check
```

Expected: tests PASS; typecheck clean; Biome clean (or only pre-existing issues unrelated to this work).

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/app/_components/site-header.tsx src/app/page.tsx docs/ideas/2026-07-10-birthday-tracker-with-per-person-email-reminders.md
git commit -m "$(cat <<'EOF'
feat(birthdays): wire nav, auth gate, and mark idea planned

EOF
)"
```

---

## Self-Review (plan author)

| Spec requirement | Task |
|------------------|------|
| `/birthdays` CRUD | 4, 7 |
| Entry-point ladder | 2, 7 |
| Month clamp | 1 |
| MT today | 1, 6 |
| Daily digest + content-aware subject | 2, 5, 6 |
| Deliveries dedupe | 3, 4, 6 |
| Cron `0 18 * * *` | 6 |
| Nav + auth | 8 |
| Pure helper tests | 1, 2 |
| No notes / multi-recipient / dashboard | Global constraints / omitted |

Pinned open details from spec:
- `userId: v.string()` via `useAuthToken` / `SPOTIFY_SYNC_USER_ID`
- List enrichment client-side via helpers
- Subject templates pinned in Task 2 tests

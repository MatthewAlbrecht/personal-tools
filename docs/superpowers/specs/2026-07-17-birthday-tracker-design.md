# Birthday Tracker Design

## Goal

Add a dedicated `/birthdays` feature to store friends and family birthdays and email a daily digest of due reminders to the existing `NOTIFICATION_EMAIL`, with a per-person entry point into a fixed reminder ladder.

## Product Shape

### Route

- Authenticated `/birthdays` — list, create, edit, delete
- Nav link so the feature is reachable from the rest of the app

### Per person

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Display name |
| `month` / `day` | yes | Birthday month (1–12) and day (1–31); invalid calendar dates rejected |
| `birthYear` | no | When set, show age in UI and digest |
| `entryPoint` | yes | Where this person starts on the global ladder |

### Global reminder ladder (fixed for v1)

Ordered steps:

1. `month` — same calendar day one month earlier (clamp when the prior month has fewer days, e.g. Jan 31 → Feb 28/29)
2. `week` — 7 days before the birthday
3. `day_before` — 1 day before
4. `day_of` — the birthday itself

**Entry point semantics:** choosing a step means that person gets that step and every step after it. Examples:

- Sister starts at `month` → month, week, day_before, day_of
- Local friend starts at `week` → week, day_before, day_of
- High-school friend starts at `day_before` → day_before, day_of

There is one ladder for everyone; people only differ by where they enter it. No per-step toggles and no custom offsets in v1.

### Email

- One **daily digest** combining everything due that day (not one email per person/step)
- To: `NOTIFICATION_EMAIL` only (no per-person recipients)
- Send time: ~noon Mountain Time via Vercel cron on a fixed UTC schedule (`0 18 * * *` ≈ noon MDT / 11am MST). Exact noon year-round is not required
- Subject must reflect contents, e.g. `🎂 2 birthdays today, 1 reminder in 7 days`
- If nothing is due (or everything due was already delivered), send nothing

### Timezone

All “today” / step-date calculations use **America/Denver** (Mountain Time).

## Non-Goals (v1)

- Notes, gift ideas, relationship labels
- Multiple email recipients / subscribers
- Custom reminder offsets beyond the fixed ladder
- Per-step independent toggles (entry point is the only control)
- Dashboard “upcoming birthdays” module (separate idea; not this track)
- Exact noon year-round across DST

## Architecture

**Approach:** Vercel cron + compute-on-run (matches Folio / other cron patterns).

- Convex stores people and delivery records
- Pure date/ladder helpers live in `src/lib/birthdays/` (testable without Convex/Resend)
- Daily cron loads people, computes due reminders in MT, filters already-delivered rows, sends one Resend digest, then records deliveries
- Pre-materialized yearly reminder rows and per-reminder Convex `scheduler` jobs are rejected for v1 (digest-unfriendly / overkill at personal scale)

### Data flow (cron)

1. `GET /api/cron/send-birthday-reminders` with `Authorization: Bearer CRON_SECRET`
2. Load all birthday people via Convex
3. Compute `today` in America/Denver
4. For each person, for each ladder step at/after their `entryPoint`, if `computeStepDate === today`, include in due set (with optional age and days-until-birthday)
5. Drop items already present in `birthdayReminderDeliveries` for `(birthdayId, occurrenceYear, step)`
6. If remaining set empty → 200, no email
7. Else render digest, send via Resend; on success record all remaining deliveries; on Resend failure do **not** record (retry can send)

## Schema

### `birthdays`

| Field | Validator |
|-------|-----------|
| `userId` | `v.id("users")` (or existing user id pattern in this app) |
| `name` | `v.string()` |
| `month` | `v.number()` (1–12) |
| `day` | `v.number()` (1–31) |
| `birthYear` | `v.optional(v.number())` |
| `entryPoint` | `v.union(v.literal("month"), v.literal("week"), v.literal("day_before"), v.literal("day_of"))` |

Index: `by_userId` on `["userId"]`.

### `birthdayReminderDeliveries`

Dedupe + light audit so same-day cron reruns do not double-send.

| Field | Validator |
|-------|-----------|
| `userId` | user id |
| `birthdayId` | `v.id("birthdays")` |
| `occurrenceYear` | `v.number()` — calendar year of the birthday occurrence this reminder is for |
| `step` | same union as `entryPoint` |
| `sentAt` | `v.number()` |

Index: `by_birthday_year_step` on `["birthdayId", "occurrenceYear", "step"]`.

`occurrenceYear` is the year of the birthday being reminded about (e.g. for a Jan 5 birthday, a Dec 5 `month` reminder in 2025 uses `occurrenceYear: 2026`).

## Pure helpers (`src/lib/birthdays/`)

| Function | Responsibility |
|----------|----------------|
| `computeStepDate(month, day, step, occurrenceYear)` | Calendar date (Y-M-D in MT terms) when that step fires, with month clamp |
| `stepsFromEntry(entryPoint)` | Ladder suffix starting at entry |
| `getDueReminders(people, today)` | Due items for a given MT calendar day |
| `buildDigestSubject(dueItems)` | Subject string from due set |

Invalid dates (e.g. Feb 30) are rejected at create/update validation, not silently coerced.

## Convex API (`convex/birthdays.ts`)

All public handlers use `requireAuth` (existing pattern).

| Function | Kind | Purpose |
|----------|------|---------|
| `list` | query | People for current user, enriched with next occurrence / next reminder for UI if cheap |
| `create` / `update` / `remove` | mutations | CRUD with date + entryPoint validation |
| Query used by cron to list people | query | Called from cron via ConvexHttpClient (same pattern as Folio) |
| Query/filter for existing deliveries | query | Cron skips already-sent `(birthdayId, year, step)` |
| `recordDeliveries` | mutation | Insert delivery rows after successful send |

Exact public vs internal naming follows existing cron conventions in this repo (Folio uses public actions/mutations from cron with `CRON_SECRET` on the HTTP route).

## Email

- New React Email component: `src/lib/emails/birthday-digest.tsx`
- New sender: `sendBirthdayDigestEmail(...)` in `src/lib/email.tsx` (mirror `sendNewReleasesEmail`)
- From address: same notifications domain pattern as Folio (`notifications@moooose.dev`)
- Body: grouped or listed due items with name, birthday date, step label, optional age

Subject examples (exact wording can be refined in implementation as long as it stays content-aware):

- One day-of: `🎂 Jane's birthday is today`
- Mixed: `🎂 2 birthdays today, 1 reminder in 7 days`
- Only early reminders: `🎂 3 upcoming birthday reminders`

## Cron wiring

- Route: `src/pages/api/cron/send-birthday-reminders.ts` (Pages API + `CRON_SECRET`, matching Folio)
- `vercel.json` entry: path `/api/cron/send-birthday-reminders`, schedule `0 18 * * *`

## UI

- List sorted by next birthday occurrence (soonest first)
- Each row: name, date, optional age, entry point, short “next reminder” hint
- Add/edit form: name, month/day, optional year, entry-point select with helper copy (“gets this step and everything after”)
- Delete with confirm
- Empty state when no people

## Error handling

| Case | Behavior |
|------|----------|
| Unauthenticated UI/API | Existing auth gates |
| Invalid month/day | Reject mutation with clear error |
| Cron missing/wrong secret | 401 |
| Resend failure | Log + non-2xx; **do not** write deliveries |
| Digest send success | Record all due deliveries for that run (all-or-nothing per digest) |

## Testing

Pure helpers under `src/lib/birthdays/` (node:test or existing project test style):

- Month clamp (Jan 31 → Feb 28/29)
- Entry-point suffix (week excludes month)
- Year-boundary due detection (Dec birthday, Jan `day_before` / Dec `month`)
- Digest subject for empty / single / mixed sets

No full end-to-end Resend tests required in v1.

## Open implementation details (pin in plan, not product)

- Exact Convex user id field name matching the rest of the schema
- Whether list enrichment (next reminder) is computed client-side or in the query
- Precise subject-string templates

## Success criteria

1. Can add/edit/delete people with name, month/day, optional year, and entry point
2. Daily cron sends at most one digest to `NOTIFICATION_EMAIL` when something is newly due
3. Entry point correctly controls which ladder steps fire
4. Same-day cron rerun does not duplicate emails (deliveries table)
5. Month-before uses calendar-day-previous-month with clamp

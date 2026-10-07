# Audit: concerts + birthdays slice vs AGENTS.md

Audited 2026-10-07. Read-only; findings verified by reading code, grep, `pnpm exec biome check`, `pnpm exec tsc --noEmit` (clean, 0 errors in slice) and `pnpm exec tsx --test` (13/13 pass).

## Scope (files reviewed)

- Convex: `convex/concerts.ts` (1098 lines), `convex/concertActions.ts`, `convex/birthdays.ts`, `convex/crons.ts`, `convex/auth.ts`, `convex/schema.ts` (concert*/userConcert*/birthday* tables, lines 1641-1770), `convex/_utils/concertEventDedupe.ts`, `convex/_utils/ticketmasterConcerts.ts`
- Pages/components: `src/app/concerts/**` (layout, page, upcoming, new, venues, `_components/*` x9, `_utils/*`), `src/app/birthdays/**` (page, birthday-form, birthday-list)
- API/cron: `src/app/api/concerts/ical/route.ts`, `_ical.ts`, `_ical.test.ts`; `src/pages/api/cron/send-birthday-reminders.ts`; `vercel.json`; `src/middleware.ts`; `src/app/api/auth/status/route.ts`
- Lib: `src/lib/birthdays/{calendar,reminders,types}.ts` + tests, `src/lib/email.tsx`, `src/lib/emails/birthday-digest.tsx`, `src/env.js`, `src/hooks/use-auth-token`, `vitest.config.ts`
- Function surface used by pages (grep-confirmed): `api.concerts.{listSelectedVenues,getCalendarFeedForUser,listUpcomingShows,listNewShows,updateEventUserStatus,upsertVenueFromTicketmaster,setVenueSelected,updateUserVenueLabel,upsertEventsFromTicketmaster}`, `api.concertActions.{syncSelectedVenueEvents,discoverTicketmasterEvents,fetchTicketmasterEventsForVenue}`, `api.birthdays.{list,create,update,remove}`; cron: `api.birthdays.{listForReminders,filterUndelivered,recordDeliveries}`. No other convex module is referenced.

## Summary

| Section | Status | # findings |
|---|---|---|
| Stack table | Drift (date-fns absent, Pages Router cron, node:test tests, Radix ui) | 5 |
| UI (shadcn/Base UI) | Drift | 7 |
| React effects | Mostly OK (violations only in dead code; shared hook out of slice) | 2 |
| Forms | Non-conformant (0 of 4 forms use TanStack Form/Zod/Field) | 5 |
| Dark mode | OK (email hex colours = acceptable exception) | 1 |
| Toasts | Partial | 3 |
| Env | OK in Next; Convex uses `process.env` correctly | 1 |
| Auth | Non-conformant: 0 auth in concerts, userId-from-arg everywhere | 6 |
| Convex | Non-conformant (no `returns` in concerts, unbounded collects, public maintenance mutations) | 14 |
| Tests | Weak (tests not runnable by documented command; no coverage of concerts Convex/dedupe) | 4 |
| Code style | Minor (Biome 3 errors, dead code) | 5 |

## Errors & risks (ranked)

1. **Birthday digest: Resend failures are swallowed and then recorded as delivered (correctness, data loss).**
   `resend@^6` `emails.send` returns `{ data, error }` and does NOT throw on API errors (type `CreateEmailResponse`, `node_modules/resend/dist/index.d.mts:275`). `sendBirthdayDigestEmail` (`src/lib/email.tsx:62-84`) only logs `result.data?.id` and returns; `src/pages/api/cron/send-birthday-reminders.ts:95-105` then calls `recordDeliveries` and returns `sent: true`. A bad key, 4xx/422, or rate limit => reminder never sent, marked delivered, and because `getDueReminders` matches a step only on its exact day (`reminders.ts:56-61`) there is no catch-up. Same bug in `sendNewReleasesEmail` (`email.tsx:36-55`, shared). Fix: `if (result.error) throw new Error(result.error.message)`. Effort S.
2. **Birthday reminders have no catch-up and a hidden config coupling (risk).** Missed cron day (Vercel outage, deploy, 500) permanently loses that step. Cron reads `env.SPOTIFY_SYNC_USER_ID` (`send-birthday-reminders.ts:24`) but the page writes under the login username from the session cookie (`/api/auth/status` -> `userId = username` = `AUTH_USERNAME`). If these differ the cron silently returns `nothing_due` forever. Fix: dedicated/verified env or derive from `AUTH_USERNAME`; make "due" = step date <= today and not delivered (within a window), which the `birthdayReminderDeliveries` table already supports. Effort M.
3. **Unauthenticated public Convex surface in concerts (security).** `convex/concerts.ts` never calls `requireAuth` and every function is public with a client-supplied `userId`. Any holder of the public `NEXT_PUBLIC_CONVEX_URL` can: read any user's data by guessing the id (userId = login username); call `getCalendarFeedForUser` (`concerts.ts:489`) and obtain the private iCal `token` (full account feed takeover); write arbitrary events via `upsertEventsFromTicketmaster` (`:254`, taking a client-built payload because `venue-event-query-card.tsx:100-110` round-trips action -> client -> mutation); run the three public Ticketmaster actions (`concertActions.ts:47,73,148`) to burn the API quota. Birthdays at least call `requireAuth`, but it is a no-op (pre-existing), so same exposure; `recordDeliveries` also does not verify the birthday belongs to `userId`. Also pre-existing: session cookie is unsigned base64 `username:timestamp`, so even the Next gate is forgeable - out of slice, noted because every finding here depends on it. Fix: auth-wrapped functions via convex-helpers `customQuery/customMutation` (AGENTS Convex rule), derive userId server-side, make `getCalendarFeedForUser` return only `{hasFeed}`/token to the owner. Effort L (cross-cutting; do once for the repo).
4. **Public destructive/maintenance mutations with unbounded reads (deploy/perf/security).** `collapseDuplicateConcertEvents` (`concerts.ts:312-383`) `.collect()`s the whole `concertEvents` table, does a `db.get` per row, then merges and deletes in one transaction; `backfillUserConcertEventQueryFields` (`:412-454`) `.collect()`s all `userConcertEvents`. Both public; the only guard is the literal `"collapse-duplicates"` which is visible in the bundle/source. They will exceed transaction read/write limits as tables grow and can delete data for any caller. They are one-off migrations: make them `internalMutation` batched with `.take(n)` + `ctx.scheduler.runAfter`, or delete once run. Effort S-M.
5. **`updateEventUserStatus` wipes notes (bug).** `concerts.ts:404-408` always patches `notes: args.notes`; callers never pass notes (`upcoming/page.tsx`, `new/page.tsx`), so every status click sets `notes` to undefined, deleting stored notes (also `mergeUserConcertEventRows` carries notes, so they can exist). Fix: only include `notes` when provided. Effort S. (Write a failing convex-test first per repo rule.)
6. **First sync of a venue can exceed mutation limits (perf/reliability, likely).** `findCanonicalConcertEvent` (`concerts.ts:526-583`) ends with an unbounded `by_venueId` `.collect()` for every incoming event that matched nothing earlier (all brand-new events). `syncSelectedVenueEvents` sends up to 5 pages x 199 = 995 events into ONE `upsertEventsFromTicketmaster` call (`concertActions.ts:112-118`), so a new venue does ~N^2/2 doc reads plus ~6 queries/event in a single transaction; this approaches/exceeds Convex's per-transaction read/time limits. Steady-state syncs are fine because earlier matchers short-circuit. Fix: chunk events (e.g. 25-50/mutation) from the action; replace legacy fallback with an indexed `by_dedupeBaseKey` lookup (backfill baseKey on legacy rows, already supported by `collapse...`). Effort M. (Limit values are from Convex docs, not measured here.)
7. **Calendar feed can never be created from the app.** `upsertCalendarFeed` (`concerts.ts:499`) has zero callers (grep: only the definition); the header shows "No calendar feed yet" (`concerts-header.tsx`) forever unless a row is inserted by hand. Also the token is client-supplied (`args.token`) - weak tokens are possible. Fix: server-generated token (`crypto.randomUUID`/random bytes in a mutation) + a "Create feed / Rotate" menu item; add revoke. Effort S-M.
8. **iCal UID instability => duplicate calendar entries.** UID = `event.tmEventId` (`_ical.ts:~73`) but `buildConcertEventPatch` can change the canonical `tmEventId` when a better/earlier duplicate is merged (`concerts.ts:634-637`, `:842`). Subscribed calendars then show a new event plus the stale one. Use a stable id (Convex `_id` or `dedupeKey`). Also no RFC 5545 75-octet line folding, `URL:` unescaped, no DTEND. Effort S.
9. **Orphaned reminder deliveries.** `birthdays.remove` (`birthdays.ts:126-141`) deletes the birthday but not its `birthdayReminderDeliveries` rows (UI copy: "Delete ... birthday and reminders?"). `update` of month/day keeps old deliveries, which can suppress a legitimately due reminder for the same (year, step). Fix: delete deliveries in `remove` (indexed, `.take` loop); clear current-year deliveries in `update` when date/entryPoint changes. Effort S.
10. **No server validation of `birthYear`/`name` length** (`birthdays.ts` create/update): accepts NaN/negative/future years (age shown negative) - only HTML `min/max` guards it. Effort S.
11. **`fetchTicketmaster*` parse body before checking `response.ok`** (`concertActions.ts:197-202, 224-229`): a non-JSON 429/5xx page throws `SyntaxError` and loses the status; no backoff/retry on 429 (Ticketmaster is rate-limited). Effort S.
12. **Venue-only fetch inconsistent with sync.** `fetchTicketmasterVenueEvents`/`buildTicketmasterVenueEventSearchUrl` omit `classificationName=music`, `startDateTime`, `includeTBA/TBD`, so the "Query a venue" card imports past and non-music events as status `new` while sync does not. Effort S.
13. **Stale `todayDate`.** `getTodayDateKey()` is memoized once per mount (`upcoming/page.tsx`, `new/page.tsx`); a tab open past midnight keeps the old date. Low. Multi-day runs also drop out of "upcoming" once `dateRangeStart` < today although `dateRangeEnd` is still ahead (`by_..._eventDate` keyed on start). Low.
14. **Silent failures in UI mutations.** `handleStatusChange` (`upcoming/page.tsx`, `new/page.tsx`), `handleSaveVenue/Unselect/UpdateLabel` (`venues/page.tsx`) have no try/catch and are invoked with `void` => unhandled rejection, no toast, UI looks unchanged. Effort S.
15. **`useMemo` is a no-op in `BirthdayList`** (`birthday-list.tsx:25-34`): `today` is a fresh object each render so deps always change (intentional per commit b50553f, but then drop `useMemo`). Trivial.

## Convention drift by AGENTS.md section

### Stack table
- **Dates / date-fns: non-conformant.** `date-fns` is NOT in `package.json` (only transitively via react-day-picker in the lockfile) and nothing in the slice imports it. Hand-rolled date math: `src/lib/birthdays/calendar.ts` (`addDays` via UTC ms, `daysUntil`, `isLeapYear`, `clampDay`, Intl-based `calendarDateInTimeZone`), `convex/_utils/concertEventDedupe.ts` (`getDateDeltaDays` via `new Date(y,m,d)`), `concerts/_utils/formatters.ts` (`getTodayDateKey` manual padStart, `formatLocalDate` Intl), `_ical.ts` `formatUtcDateTime`. Change: add `date-fns` (+ `@date-fns/tz` for America/Denver `TZDate`) and replace with `addDays/differenceInCalendarDays/format/parseISO`; keep leap-day clamping logic. Note Convex runs UTC so use explicit date parts there. Effort M. Existing tests cover calendar behaviour so the swap is safe.
- Calendar-date representation: concerts correctly use `YYYY-MM-DD` strings (`localDate`, `eventDate`, `dateRange*`, `eventDates`) and pass `todayDate` into queries (guideline-compliant, no `Date.now()` in queries). Birthdays store `month`/`day`/`birthYear` numbers, not `YYYY-MM-DD` (see AGENTS corrections). `concertEvents.dateTime`/`publicSaleStartDateTime` are ISO strings (instants) rather than Unix ms; `getConcertEventDate` falls back to `dateTime.slice(0,10)` which is the UTC date and can be a day off for evening shows (only when `localDate` is absent).
- **Framework:** birthday cron lives in `src/pages/api/cron/send-birthday-reminders.ts` (Pages Router; stack says "not Pages Router"). Same for all cron handlers (repo-wide pattern, `vercel.json`). It also is a data-shaped job calling public Convex functions over HTTP with a bearer secret instead of a Convex cron; AGENTS says "Actions only for external APIs (Resend)" so the idiomatic design is a `crons.ts` entry -> `internalAction` (Resend over fetch; React Email `render` works in the default runtime or use `"use node"` in a separate actions file) -> internal queries/mutations. Effort M-L. Not urgent; Vercel cron + Next route matches the Folio pattern the spec chose.
- **Cron wiring:** `convex/crons.ts` schedules only ranking snapshots (uses `crons.weekly`, which the Convex guidelines say not to use - use `crons.cron`/`interval`; outside slice). Concerts have no scheduled sync at all - only manual "Sync selected venues" button. Birthdays run daily at `0 18 * * *` UTC (= 12:00 MDT / 11:00 MST; matches spec).
- **Tests:** see Tests section.
- **Icons:** lucide only. OK. **Toasts:** sonner. OK. **Env:** see Env. **Resend:** used correctly except error handling (finding 1); `from` uses `notifications@moooose.dev` hard-coded; `render` imported but unused in `email.tsx:1`.
- **UI components "shadcn on Base UI":** the actual `src/components/ui/*` are Radix (button `asChild`/Slot, dropdown-menu `@radix-ui/react-dropdown-menu`, label, dialog, popover, tooltip...). Only `combobox.tsx` is Base UI. Slice code uses Radix idioms (`<Button asChild>`, `<DropdownMenuTrigger asChild>` in `concerts-header.tsx`, `new-shows-list.tsx`, `upcoming-shows-list.tsx`, `concert-event-card.tsx`). See AGENTS corrections.

### UI rules
- Raw `<select>`: `birthday-form.tsx` (entry point, ~line 120) and dead `event-search-card.tsx`. Use shadcn `Select` (exists in `ui/`).
- Raw `<input type="checkbox">`: `new-shows-list.tsx` ("Show actioned"), `upcoming-shows-list.tsx` ("Show interested"). Use shadcn `Checkbox` + `Label`/`Field`.
- Ad-hoc bordered cards: `venues/page.tsx` `SelectedVenueForm` and `discover-venues-card.tsx` result rows use `div className="rounded-lg border p-3"`; use `Card`/`Item`.
- Raw `<label>` wrapping `Input` (`discover-venues-card.tsx`, `venues/page.tsx`, `new-shows-list.tsx`) instead of `Label`/`Field`.
- **Drawer over Dialog:** birthday add/edit is an inline `Card` form on the page (acceptable but not a Drawer); delete uses `window.confirm` (`birthdays/page.tsx:60`) - should be `AlertDialog`. Venue nickname editing is inline.
- Raw `<img>` in `concert-event-card.tsx` (only used by dead code) violates "Next `Image`".
- `concert-tabs.tsx` builds classes with a template literal, not `cn()` (Biome sorted-class rule not applied) and re-implements shadcn `Tabs` (`ui/tabs.tsx` exists) with raw links - a route-tab nav is a reasonable exception but should use `cn()`.
- Dead code: `event-search-card.tsx` (345 lines), `venue-multiselect.tsx`, `concert-event-card.tsx` are referenced only by each other (grep). Together they carry most of the raw `<select>`/`<img>`/`useEffect` violations. `getCalendarFeedForUser`-adjacent `listUserEvents` (`concerts.ts:78`) also has no caller. Delete.

### React effects
- Slice pages/components are effect-free except dead `event-search-card.tsx:118-143` (two effects that derive/reset state from props; should be derived values or `key`). Active slice code uses `useAuthToken`, whose own `useEffect` + `fetch('/api/auth/status')` (shared hook, outside slice) is the only "fetch in effect" and is called three times on a concerts page (layout + page + each child page). Conformant otherwise: effects are not used for data.

### Forms (TanStack Form + Zod + `Field`)
- `birthday-form.tsx`: `useState` per field, string state, manual `Number()` parsing, HTML `required/min/max` only, no Zod. Server re-validates by hand (`birthdays.ts:28-39`). Convert to `useForm` + shared Zod schema (`name` min 1, `month` 1-12, `day` refined with `isValidBirthdayDate`, `birthYear` optional int range, `entryPoint` enum) and reuse it for the Convex mutation args. Effort M.
- `discover-venues-card.tsx`: `useState` for ZIP/radius, no validation (radius sent as string; ZIP not checked; hard-coded `"80209"` special case in `concertActions.ts:241`).
- `venues/page.tsx` `SelectedVenueForm`: uncontrolled `FormData`; nickname save.
- `new-shows-list.tsx` search box: filter-as-you-type, not a submit form - fine.
- `src/components/ui/` has no `field.tsx` (only `field-group.tsx`), so the mandated `Field` components are not installed; add via `pnpm dlx shadcn@latest add field`. Only `books/page.tsx` uses `useForm` repo-wide.
- Convex args for concerts take unconstrained `v.string()` for `postalCode`, `radius`; `size` unbounded `v.number()` (clamped to 199 in URL builder only).

### Dark mode
- Slice UI uses semantic tokens (`bg-muted`, `text-muted-foreground`, `border-destructive/40`, `bg-background`). OK. Email template `birthday-digest.tsx` uses hex colours; correct for email clients - AGENTS should carve this out.

### Toasts
- `birthdays/page.tsx` toasts success/error properly. `concerts/layout.tsx` and `venues/page.tsx` mix `toast` with persistent inline message/error `Card`s via `useState` (`message`, `error`) and mostly don't toast; mutation failures are not surfaced (finding 14). `concerts-header.tsx` copy-URL uses toast with no catch on `clipboard.writeText`. `<Toaster />` is mounted in root layout. OK.

### Env
- Next side: `send-birthday-reminders.ts` and `email.tsx` use `~/env.js` (`CRON_SECRET`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `NEXT_PUBLIC_CONVEX_URL`, `SPOTIFY_SYNC_USER_ID`). No `process.env` in `src/` for the slice. OK. (`email.tsx` creates `new Resend(env.RESEND_API_KEY)` at module scope, which makes any import require the key at load; acceptable.)
- Convex side: `process.env.TICKETMASTER_API_KEY` (`concertActions.ts:249`) is allowed; the key is not declared in `.env` docs/`convex.config.ts`; guidelines (convex ^1.41) suggest typed `env` in `convex.config.ts`. Env var absent => thrown error string surfaces to the client; fine.
- Semantic mismatch: birthday cron reuses `SPOTIFY_SYNC_USER_ID` as the user (finding 2).

### Auth
- Depends on no-op `requireAuth`: birthdays call it in every function (`birthdays.ts:45,57,76,106,133,155,187`) - dependence only, not re-litigated. Concerts do not call it at all (0 of 14 public queries/mutations, 0 of 3 actions).
- Every function takes `userId` as an argument (explicitly forbidden by the Convex guidelines/auth section) and trusts it; ownership checks exist only in `birthdays.update/remove` (`existing.userId !== args.userId`) and implicitly via index scoping in concerts.
- Pages gated by `middleware.ts` cookie presence + `LoginPrompt`; `/api/concerts/ical` is intentionally outside the matcher (token capability URL) - OK for an external integration, but its token source is item 7 above. Pages do not pass `X-Access-Token` to Convex at all (AGENTS says to), so Convex cannot distinguish callers.
- Cron route: Bearer `CRON_SECRET` check is correct and compared with `!==` (non-constant time; low).

### Convex (apply `convex-expert` + `_generated/ai/guidelines.md`)
Conformant: object-form functions; correct `./_generated/server` / `./_generated/api` imports; `v.literal` union for statuses; `v.id` for ids in args; indexes defined and mostly used via `.withIndex`; no `"use node"` mixing (concertActions has none, uses `fetch`); mutations don't fetch; external IO is in actions; timestamps are Unix ms (`createdAt/updatedAt/sentAt/firstSeenAt`); `todayDate` passed as arg; cron route is not an action-for-CRUD.
Violations:
- **Missing `returns` validators on every concerts function** (all 14 in `concerts.ts`, 3 in `concertActions.ts`); `birthdays.ts` has them for all 7. Several return `undefined` (`setVenueSelected`, `updateUserVenueLabel`) instead of `null`. `listSelectedVenues`/`list*Shows` return `{...row, event, venue}` hydrations - define validators from `doc` shapes (or use convex-helpers `zodOutputToConvex`/typed validators).
- **Unbounded `.collect()`** at `concerts.ts:65, 90, 318, 417, 468, 538, 565, 889, 1020, 1040, 1066` and `birthdays.ts:49, 61` (birthdays tiny but still unbounded). Use `.take(n)`/pagination; `listUpcomingShows`/`listNewShows` (`new` status since today across venues) can grow with every sync; paginate or cap. `getCalendarFeedByToken` loads all of a user's events then JS-filters status at `:471` - use `by_userId_userStatus` for `interested` and `owned`.
- `.filter()`-style JS post-filters instead of index ranges at `concerts.ts:471` (status) and `listUserEvents` sort across mixed `dateTime`/`localDate` strings (`:104-107`, UTC instants vs local dates compared lexicographically).
- **Public vs internal:** `collapseDuplicateConcertEvents`, `backfillUserConcertEventQueryFields` should be `internalMutation`; `listForReminders`, `filterUndelivered`, `recordDeliveries` are only called from a trusted cron with a server secret but are public (spec acknowledged, "follows Folio"); `list` and `listForReminders` are identical (`birthdays.ts:41-63`) - collapse. `upsertEventsFromTicketmaster` / `listSelectedVenues` are called by the action via `makeFunctionReference("concerts:...")` string refs + `as` casts (`concertActions.ts:17-22,79-81,112-118`), losing type safety and forcing them public. Use `internal.concerts.*` (internalQuery/internalMutation) with explicit return annotation to dodge circularity.
- **Client-side orchestration of action + mutation** (`venue-event-query-card.tsx:100-110`): action returns events to browser, browser calls public mutation. Move into one action that calls the internal mutation (as `syncSelectedVenueEvents` does).
- **Actions** missing `returns`; `fetchTicketmasterEventsForVenue` and `discoverTicketmasterEvents` unauthenticated (finding 3).
- **Schema:** 8 concert indexes have zero uses outside schema: `by_userId_eventDate`, `by_userId_venueId_eventDate`, `by_dedupeKey`, `by_venueId_dateTime`, `by_venueId_dateRangeStart`, `by_dateTime`, `by_dateRangeStart`, `concertVenues.by_name` (grep over `convex/`). Drop later (each costs write amplification). Index names do not follow the guideline's "all fields in name" rule (`by_birthday_year_step` should be `by_birthdayId_and_occurrenceYear_and_step`; repo-wide short-name convention - low priority). `userConcertEvents.venueId` and `eventDate` remain `v.optional` after backfill; tighten after confirming backfill.
- `ctx.db.get(id)` / `patch(id, ..)` single-arg form is used throughout; guidelines for ^1.41 show `ctx.db.get("table", id)`. Style only.
- `patch` with spread optionals (`upsertConcertVenue` `...venue`) removes previously stored fields when the new payload omits them (lat/long/address). Low.
- `updateUserVenueLabel` sets `label` undefined to clear - fine; `setVenueSelected` throws if no row.
- Denormalized `userConcertEvents.{venueId,eventDate}` maintained in two places (`ensureUserConcertEvent`, `mergeUserConcertEventRows`, `backfill...`) - OK but only `upsertEventsFromTicketmaster` keeps them current when a later merge changes `dateRangeStart`.

### Tests
- AGENTS says new tests use Vitest; "many existing tests use `node --test path`". In this slice all three test files (`calendar.test.ts`, `reminders.test.ts`, `_ical.test.ts`) are `node:test`, and **`node --test` cannot run them** (Node 22.14 has no TS stripping by default; with `--experimental-strip-types` they fail with `ERR_MODULE_NOT_FOUND` on extension-less imports like `./calendar`). They pass under `pnpm exec tsx --test` (13/13). `vitest.config.ts` only includes `convex/launch-*.test.ts`, so Vitest never sees them either; there is no `test` script in `package.json`. Result: these tests are not run by any documented command or CI.
- No tests at all for: `convex/concerts.ts` (dedupe/upsert/merge logic is the riskiest code in the slice), `convex/_utils/concertEventDedupe.ts`, `ticketmasterConcerts.ts` (normalizer), `convex/birthdays.ts`, `formatters.ts`, the cron route, `birthday-digest.tsx`. `convex-test` is available per AGENTS; edge-runtime config exists. Add: concerts upsert idempotency/merge tests, `updateEventUserStatus` notes regression (finding 5), Resend error path (finding 1, extract a `sendOrThrow`), unauthenticated-caller negative cases once auth lands.
- Covered well: `reminders.ts` (ladder, leap-day, year rollover) and `calendar.ts` (valid dates, MT timezone) have sensible edge cases.

### Code style
- Biome: 3 errors in slice - `reminders.ts:93` `noNonNullAssertion` (`todays[0]!.name`), `reminders.ts` and `reminders.test.ts` format (import line). Run `pnpm check:write`.
- Classic `function` declarations: followed. `type` aliases: followed. Kebab-case files: followed (`_ical.ts` underscore-prefix is the repo's route-private convention).
- Duplicated helper `getVenueDisplayName` x3 and `getErrorMessage` x3, `TICKETMASTER_PAGE_SIZE = 199` duplicated x3 (client x2, `DEFAULT_` in convex); duplicated birthday date validation (`birthdays.ts:26-39` vs `calendar.ts:4-27`) although AGENTS explicitly allows Convex to import relative `src/lib` code.
- `new-shows-list.tsx`/`upcoming-shows-list.tsx` duplicate ~80 lines of status-button row markup that also exists in `concert-event-card.tsx`; extract once.
- `types.ts` in `_utils` re-declares Ticketmaster shapes already in `convex/_utils/ticketmasterConcerts.ts` and the Convex validators (three copies).
- Unused import `render` in `email.tsx:1`; `birthday-digest.tsx` imports `React` (unneeded with modern JSX; fine).

## Suggested changes (ranked)

| # | Change | Effort |
|---|---|---|
| 1 | Throw on `result.error` from Resend (birthday + folio senders) before recording deliveries; add test | S |
| 2 | Fix `updateEventUserStatus` notes clobber (+ regression test) | S |
| 3 | Make `collapseDuplicateConcertEvents`/`backfillUserConcertEventQueryFields` internal and batched, or delete | S-M |
| 4 | Stop returning the calendar token from `getCalendarFeedForUser` to arbitrary callers; server-generate/rotate token; wire UI to create feed | S-M |
| 5 | Birthday cron: resolve user id coupling (`SPOTIFY_SYNC_USER_ID` vs `AUTH_USERNAME`) and add catch-up window using deliveries table | M |
| 6 | Chunk Ticketmaster upserts; replace legacy `by_venueId` collect fallback with indexed lookup | M |
| 7 | Add `returns` validators to all concerts functions/actions; return `null` not `undefined`; convert action->mutation calls to `internal.*` | M |
| 8 | Cascade-delete birthday deliveries; server-validate `birthYear`; dedupe `list`/`listForReminders` | S |
| 9 | Replace unbounded `.collect()` with `.take`/pagination in listed locations; use status index in `getCalendarFeedByToken` | M |
| 10 | Move concerts actions + mutations behind auth-wrapped custom functions (repo-wide `requireAuth` work) | L |
| 11 | Convert BirthdayForm + DiscoverVenues + venue nickname form to TanStack Form + Zod + `Field` (install `field`); swap raw `select`/`checkbox`; `AlertDialog` for delete | M |
| 12 | Add `date-fns` (+`@date-fns/tz`) and replace hand-rolled date math; stable iCal UID | M |
| 13 | Delete dead components (`event-search-card`, `venue-multiselect`, `concert-event-card`, `listUserEvents`) and 8 unused indexes | S |
| 14 | Add error toasts to unhandled mutation handlers; check `response.ok` before `.json()`; align venue-only fetch params | S |
| 15 | Tests: make suite runnable (`tsx --test` script or port to Vitest and add to `vitest.config.ts`), add concerts convex-tests; `pnpm check:write` | M |

## AGENTS.md corrections

1. **"shadcn/ui on Base UI ... not Radix"** is false for the current repo: `src/components/ui/*` are Radix (`button`, `dropdown-menu`, `dialog`, `alert-dialog`, `popover`, `tooltip`, `checkbox`, `label`, `tabs`...) with `asChild`; only `combobox` is Base UI; `package.json` lists many `@radix-ui/*` packages. Either state "migrating to Base UI; existing components are Radix" or run the migrate-radix-to-base skill.
2. **"Dates | date-fns"**: package is not a direct dependency and unused repo-wide in this slice; say "add date-fns" or list `@date-fns/tz` and the Mountain-time requirement (birthdays/cron compute "today" in `America/Denver`).
3. **"Calendar dates (due dates, birthdays) are `YYYY-MM-DD` strings"**: birthdays are recurring month/day (+ optional birth year) stored as numbers, which cannot be a full date; document this exception (and that ISO strings from Ticketmaster `dateTime` are stored as strings, not Unix ms).
4. **Cron/API-route guidance**: "API routes are for external integrations only" and "not Pages Router" conflict with `vercel.json` + `src/pages/api/cron/*` (Pages Router, Bearer `CRON_SECRET`, `ConvexHttpClient` -> public Convex functions). Document the sanctioned cron pattern (or migrate to `convex/crons.ts` + internal actions). Also note the Convex guideline "use `crons.cron`/`interval`, not `weekly`".
5. **Tests**: `node --test path/to/file.test.ts` does not work (extension-less imports; Node 22.14); document `pnpm exec tsx --test <file>` (works) and that `vitest.config.ts` only includes `convex/launch-*.test.ts` - new Vitest tests outside that glob will silently not run, so update the include pattern or the rule.
6. **Auth section**: `requireAuth` is a no-op and the session cookie is unsigned base64; state the actual enforcement boundary (middleware cookie presence + `userId` args) or the convex-helpers custom-function plan, since the Convex rule "Use auth-wrapped queries/mutations" has no implementation to follow. Also "pass the access token via `X-Access-Token`" is not done by any slice page.
7. **Forms**: references shadcn `Field`, but `ui/field.tsx` is not installed (only `field-group.tsx`); add the install step to the Forms rule.
8. **Dark mode**: add an exception for HTML email templates (hex colours required).
9. **Convex "every function has `returns`"** and "never `.collect()` unbounded" are not met by the repo's oldest modules (concerts); add a note on migration order or tag legacy modules so agents don't copy their patterns.

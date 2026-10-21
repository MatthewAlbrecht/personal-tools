# 17: Adaptive timing

**What to build:** After about 4 weeks of listing times, the automated browser checks more often during the hours of the week when sellers usually post new Listings, and less often otherwise.

**Blocked by:** 15 (Automated browser runs)

**Status:** done (deploying is left for Matt)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Hour-of-week distribution of first-seen / listed times
- [x] Schedule switches from fixed 3 hours only once enough data exists
- [x] Never checks less than every 6 hours
- [x] convex-test covers the schedule derived from a fixed distribution (Seam 1)

**Left for you:** deploy, so prod has the `yugiohRunTiming` table, `getRunTiming`, and the new full-run rule. No reinstall: the LaunchAgent already asks every 10 minutes.

## Notes from the build

**Rule** (pure, `src/lib/yugioh/run-timing.ts`, relative imports only):
- `learnRunTiming({ listedTimes, dataSince, timeZone, now })` → `RunTiming { status: "learning" | "learned", dataSince, timeZone, busyHours }`.
  - `learning` until the first capture is 28 days old (`LEARNING_DAYS`).
  - Busy hour: an hour of the week (`hourOfWeek`, 0 = Sunday 12–1am in `timeZone`) with ≥ 3 Listings over the last 28 days and ≥ 2× the average hour. At most the 24 busiest (`MAX_BUSY_HOURS`).
- `fullRunDue({ lastFullRunAt, timing, now })`:
  - learning, or no busy hours: every 3 hours, as before (5 minutes' slack);
  - learned: every hour (`BUSY_RUN_EVERY_MS`) in a busy hour **and the hour after it** (that run catches the busy hour's Listings); otherwise at 6 hours less two ticks (5h40, `MAX_FULL_RUN_GAP_MS`), so neither the wait for the next ask nor an ask that finds a refresh run still open passes 6 hours.
- Hours are wall-clock in the zone, so busy hours keep their local time across DST.
- `scheduledRunDue` (ticket 16's planner) now takes `timing` and calls `fullRunDue` for its full-run rule. The refresh rules, LaunchAgent and script are unchanged. T3 and hand runs are still always full.

**Decision: only eBay's `listedAt` counts, not `firstSeenAt`.** First-seen times follow the run schedule (on the 3-hour cadence they pile up on run hours), so learning from them would only learn the schedule back. TCGplayer Listings and sales without a listing date don't count. The ticket's "first-seen / listed times": first-seen is used only for "days of data" (the first capture).

**Data:**
- `yugiohRunTiming`: one row, `{ ...yugiohRunTimingValidator.fields, learnedAt }`. `yugiohRunTimingValidator` is in `validators.ts`, with a `Same<>` check against `RunTiming`.
- `relearnRunTiming(ctx, now)` (`convex/model/yugioh/runTiming.ts`) runs in `finishRun` whenever a **full** run ends, finished or failed. No new trigger or cron.
  - It reads Listings newest first (default creation order) until the 28-day window's start, up to 2,000 (`MAX_LISTINGS_READ`). It keeps those matched to a Printing (`matchedPrintingId`) that have a `listedAt`.
  - A Listing goes up before it's captured, so all those listed in the window were captured in it.
- `readRunTiming(ctx)`: the stored row, or before the first relearn, `learning` since the first capture.
- My time zone is `userTimeZone` in `pushes.ts`, renamed from the private `quietHoursTimeZone` and exported: the zone of the most recently seen push device, else `America/Denver`.
- **convex-test gotcha:** `.withIndex("by_creationTime", …)` throws in convex-test ("not declared in the schema"). Use the default `.query(table).order("desc")` and stop at the window edge.

**Public:** `api.yugioh.automation.getRunTiming` (`requireAuth`, no args) returns `RunTiming`.

**UI** (Settings → Automated runs):
- A "When it runs" section above the runs list. The card description no longer says "Every 3 hours".
- Copy is `describeRunTiming(timing, now)` in `run-format.ts`, which is tested:
  - "Every 3 hours for now. Still learning when sellers post: 12 days of data so far, of about 28." ("Under a day" before a day; another line before any Listing.)
  - Learned: "Sellers post most at these times (New York time). It runs every hour during them and the hour after, and at least every 6 hours otherwise." Then one secondary `Badge` per stretch of busy hours: "Sun 7–9 PM", "Sat 11 PM–1 AM".
  - Learned with no busy hours: "Every 3 hours. No hours of the week stand out yet for when sellers post."
- No chart: busy stretches as text read better than a 168-cell heatmap at 390px, so `dataviz` wasn't needed.
- Checked on dev with Playwright at 1280px and 390px (the learning state; dev has under a day of data).

**Tests:**
- `convex/yugioh/run-timing.test.ts` (Seam 1, 5 tests), from a fixed distribution of Sunday 7 PM New York plus one Listing a day:
  - 3 hours while learning;
  - Settings shows `busyHours: [19]`;
  - quiet hours spread to 5h40 and no further;
  - a busy hour and the hour after get hourly runs, and 9 PM doesn't;
  - hand runs are always full.
- `src/lib/yugioh/run-timing.test.ts` (8): hour of the week across DST, the 28-day gate, the 3-Listing and 2× thresholds, the window, and the due edges. All but the 5h40 edge were written after the code (code-review asked for a colocated test); the 5h40 change went red first.
- `run-format.test.ts`: the timing copy.
- `automation.test.ts`: `scheduledRunDue` callers pass a learning `timing`.

**Docs:** `docs/yugioh/automation.md` has a new "Run timing" section, and the full-run rule there points to it.

**Review:**
- `code-review` (Standards and Spec) and a `convex-reviewer` pass were run.
- **Fixed:**
  - a colocated unit test;
  - the gap fires two asks early (5h40), so an open refresh run can't push it past 6 hours;
  - the cadence numbers in copy come from the constants;
  - one weekday list, and clock hours through date-fns;
  - an exported `RunTimingLines` type;
  - a wrong comment;
  - the docs now note the 2,000-read cap, that only eBay counts, and the quiet-hours undercount.
- **Left as is:**
  - **A run closed as abandoned doesn't relearn.** Only `finishRun` does, so a string of abandoned runs keeps the last schedule. The next finished full run catches up.
  - **A circular import.** `run-timing.ts` ↔ `automation.ts` only reads constants inside functions, so it's harmless.
  - `dataSince` keeps its name.
  - `getRunTiming` imports `readRunTiming` directly, not through `Automation.*`.
- **Product question for Matt:** the UX discovery doc (`docs/ux-discovery/yugioh-tracker.md` line 105) has the metric "Newest capture < 3 h old". The ticket asks for fewer runs outside busy hours, so with the schedule learned, captures can be up to 6 hours old at quiet times. The Deck's "Last captured" note shows only after 6 hours, so it stays quiet. The metric needs updating, or the gap rule does.
- `ux-superpowers:ux-validate` and `design-superpowers:design-review` weren't run separately. The UI is one text section in an existing card, and I checked it on dev at both widths.

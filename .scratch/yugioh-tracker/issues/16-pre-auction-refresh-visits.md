# 16: Pre-auction refresh visits

**What to build:** When a matched auction is due to end within the next 3 hours, the automated browser makes an extra visit about 20 minutes before it ends so the auction push has a fresh price.

**Blocked by:** 14 (Auction-ending pushes), 15 (Automated browser runs)

**Status:** done (the code, config and docs are built; reinstalling the LaunchAgent and the hand check are left for Matt)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Visit plan includes timed extra visits
- [x] Extra visits only for matched auctions on Cards still needed
- [x] convex-test covers visit-plan output (Seam 1)

**Left for you:**
1. Deploy, so prod has the new `requestRun` answer, the run `kind`, and the `by_marketplace_and_saleAt` index.
2. Run `scripts/yugioh-automation/install.sh` again (docs/yugioh/automation.md → One-time setup, step 3). The installed plist still runs every 3 hours, so you won't get refresh runs until you reinstall. Then check `launchctl print gui/$(id -u)/dev.moooose.yugioh-automation`.
3. Hand check: with a matched, Qualifying auction ending within 3 hours, a run labelled "Before an auction ends" should appear in Settings → Automated runs about 20 minutes before it ends. It visits one "Ending soon" page, and the 15-minute push then shows a price a few minutes old.

## Notes from the build

**How an extra run is triggered** (researched in `docs/yugioh/references/automated-browser.md` §8):
- The LaunchAgent now asks every 10 minutes: six `StartCalendarInterval` dicts with only `Minute`. Missing keys are wildcards, and asks missed in sleep fold into one on wake.
- The app decides what each ask gets:
  - **Rejected: a Convex-scheduled request the extension polls for.** The extension only runs while the automation Chrome is open, and `run.sh` quits it after each run.
  - **Rejected: a T3 task.** Each run is a model turn, and the T3 app has to be open. T3 does have a `webhook` schedule type, which could work as a push channel later.
- `request` (`requestRun` in `convex/model/yugioh/automation.ts`) now returns `{ runId, alreadyOpen, kind }`.
  - With nothing due, `runId` and `kind` are null. `run.sh` exits 0 and logs nothing, since that's most asks.
  - `t3` and `manual` triggers always get a full run. Only `launchAgent` asks are scheduled.

**Rules** (pure, in `src/lib/yugioh/automation.ts`):
- `scheduledRunDue({ lastFullRunAt, lastRunAt, auctions, now })` → `"full" | "refresh" | null`.
  - **Full run:** 3 hours (`FULL_RUN_EVERY_MS`) after the last full run was asked for, less half a tick of slack. Failed full runs count too, so a broken run isn't retried every 10 minutes.
  - **Refresh run:** an auction's window is open, from 28 minutes (`REFRESH_OPENS_BEFORE_END_MS`) down to 17 (`REFRESH_CLOSES_BEFORE_END_MS`) before its end, and no capture has seen it within 45 minutes (`REFRESH_COALESCE_MS`) of its end.
  - The window is 11 minutes wide, wider than the 10-minute tick, so one ask always lands in it. Visits land 18–28 minutes before the end, about 23 on average.
  - **No refresh run within 15 minutes (`REFRESH_MIN_GAP_MS`) of the last run asked for.** That gives one try per window, so a captcha or failed page isn't retried at the next ask.
- `auctionsToRefresh(auctions, now)` gives every auction ending within 45 minutes that still needs a refresh, soonest first. **This is the coalescing:** auctions ending close together ride in one run, and the later ones then count as seen.
- `buildRefreshVisits(searches, setCodes)` gives one page per Search: that Search's keywords, running auctions only, ending soonest first. It uses `ebayEndingSoonUrl` in `searches.ts` (`LH_Auction=1&_sop=1`, the layout of `auctions.html` in the reference fixtures).
  - The visit kind is `ebayEndingSoon`, labelled "Ending soon" in the runs list.
  - It counts as a Search page.
- `buildVisitPlan(searches, products, refreshVisits)` now takes the refresh visits as a third, required argument and puts them first. A full run's plan therefore starts with the pages of auctions ending in the next 45 minutes. A refresh run's plan is only those pages.

**Which auctions** (`awaitsAuctionPush` in `convex/model/yugioh/pushes.ts`, the same selection as `checkAuction`):
- the auction is running and matched;
- a device has push on;
- no auction push has been filed yet;
- it's Qualifying for a Card that still needs Copies and searches its Printing.

`wantingCard` now takes a `QueryCtx`.

**Data:**
- `yugiohListings` gained the index `by_marketplace_and_saleAt`. A running auction's `saleAt` is its end time.
  - `readEndingAuctions` reads eBay Listings with `saleAt` from 17 to 45 minutes ahead (`take(100)`), then filters them.
  - Sold Listings have past `saleAt` values, so they never fall in that range.
- `yugiohAutomationRuns.kind`: `"full" | "refresh"`. It's optional, and a run without one counts as full (`runKind` in the model).
- `yugiohVisitKindValidator` adds `ebayEndingSoon`.

**UI:** two strings.
- A refresh run's row reads "Today, 3:42 PM · Before an auction ends" (`describeRun`).
- The Automated runs card adds: "It looks again about 20 minutes before a matched auction ends, so the alert shows a fresh price."

**Script and config:**
- `run.sh` handles the "nothing due" answer and logs the kind.
- The plist template asks every 10 minutes.
- `install.sh` now describes the new schedule.
- The extension needed no change: the ending-soonest page is a `/sch/` page, so `ebay-content.js` captures it, and the runner passes any visit kind through.

**Tests:**
- `convex/yugioh/refresh-visits.test.ts` has 11 tests:
  - the 3-hour schedule, and T3 and hand runs always being full;
  - the window opening and closing;
  - one page per Search, soonest first;
  - coalescing, and no follow-up for an auction that rode along;
  - selection (unmatched, graded, Korean, a Card that's done, push off);
  - full runs putting the refresh pages first;
  - no retry after a captcha.
- `src/lib/yugioh/automation.test.ts` covers the window edges (28 and 17 minutes, the full-run slack, seen within 45). These were written after the code; they pinned edges the convex tests already exercised.
- `run-format.test.ts` covers the refresh run label.
- Changed in `automation.test.ts`:
  - the `alreadyOpen` reply now has a `kind`;
  - the abandoned-run test asks by hand, because a scheduled ask 2 hours after a full run isn't due.

**Gotchas for 17 (adaptive timing):**
- Change only the full-run rule in `scheduledRunDue`. It already gets `lastFullRunAt`.
- The LaunchAgent, script and refresh logic stay as they are.
- `SCHEDULE_TICK_MS` documents the 10-minute ask. If you change it, keep the refresh window wider than the tick.

**Known gaps (documented in `docs/yugioh/automation.md`):**
- **A full run blocks refreshes.** If a full run is still going when an auction's window opens, that auction gets no refresh. Full runs put the auctions ending in the next 45 minutes first, which narrows the gap.
- **A sleeping Mac.** Asleep through the window means no refresh. Only `pmset schedule wake`, which needs root, could prevent that, and it isn't done.
- **Auctions with no end time** get no refresh.
- **A refresh can be older than 20 minutes.** An auction seen 44 minutes before its end, by a full run or a coalesced refresh, gets no refresh of its own, so its push price can be up to about 30 minutes old.

**Review:**
- `code-review` and a `convex-reviewer` pass were run. These were fixed: clearer names, a `runKind` helper, the read limit raised to 100, the docs' freshness claim corrected, the reinstall step added, and unit tests for the window edges.
- **Left as is:**
  - `awaitsAuctionPush` reads the newest subscription for each Listing (an indexed `.first()`, at most 100 times, and only once a full run isn't due).
  - The new terms "full run" and "refresh run" aren't in the glossary. That's a glossary change for Matt to decide.
  - `ux-superpowers:ux-validate` and the design review weren't run, because the UI change is two strings.
- **Dev:** pushed with `npx convex dev --once`. No dev data was created.

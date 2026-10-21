# 19: Varied run timing

**What to build:** Runs stop looking clockwork: no full runs overnight, no exact 3-hour beat, no start on the 10-minute marks, and no fixed page order or pause length.

**Blocked by:** 18

**Status:** done

- [x] **Overnight pause:** no full runs from 1am to 7am in Matt's time zone (`userTimeZone`). Refresh runs for auctions ending in that window still happen. Busy hours that fall in the window are skipped. The 6-hour cap doesn't force a run in the window; the first ask after 7am starts one.
- [x] **Varied gap:** the gap between full runs varies, picked at random when a run ends and stored (so the rule stays deterministic and testable): the 3-hour fallback becomes 2.5–3.75 hours; busy-hour runs 45–80 minutes; the cap stays under 6 hours.
- [x] **Start jitter:** when launchd starts `run.sh`, it waits a random 0–4 minutes before asking (0–90 seconds when the ask turns out to be a refresh run, so the ~20-minute lead before an auction ends holds). Hand runs don't wait.
- [x] **Page order:** within a run, Search pages are shuffled (refresh visits for auctions about to end still go first).
- [x] **Pauses:** between pages, 20–60 seconds, with about 1 in 6 pauses a longer 1.5–3 minutes. Check the run timeout in `run.sh` (90 min) still fits the largest run, and raise it if not.
- [x] Pure rules in `src/lib/yugioh/` with Vitest tests; convex-test for the stored gap; the runner's shuffle and pause choice tested with an injected random.
- [x] Docs: `docs/yugioh/automation.md` "Run timing" and "Tuning" updated.

## Notes from the build

**Gap (stored draw)** (`src/lib/yugioh/run-timing.ts`):
- `fullRunDue({ lastFullRunAt, gapDraw, timing, now })`; `scheduledRunDue` passes `gapDraw` through. Ranges: `FALLBACK_GAP` 2½–3¾ h (learning, or no busy hours), `BUSY_GAP` 45–80 min (busy hour and the hour after), `CAP_GAP` 5 h–5 h 40 (learned, outside busy hours; top is two ticks under 6 h). `gapWithin(range, draw)` maps one 0–1 draw into whichever range applies at the ask. Half-tick slack still applies to fallback and busy gaps.
- **Decision:** the cap varies too (5 h–5 h 40), not just the two named ranges: a fixed 5 h 40 was the most clockwork gap left. It stays under 6 h.
- `yugiohAutomationRuns.gapDraw` (optional number) is drawn with `Math.random()` when a **full** run ends: `finishRun`, `stopOnCheckPage`, and the abandoned-run closure in `requestRun` (`nextGapDraw` in `convex/model/yugioh/automation.ts`). Runs without one (older, refresh) count as `LEGACY_GAP_DRAW` 0.4 = the old 3 h.
- `SCHEDULE_TICK_MS` moved to `run-timing.ts` (no longer exported from `automation.ts`): `CAP_GAP` reads it at module load, and the old `run-timing.ts` ↔ `automation.ts` cycle made it `undefined` (NaN gaps) in convex-test. `FULL_RUN_EVERY_MS` is gone.

**Overnight pause:** `inOvernightPause(time, timeZone)` (1–7 AM, `OVERNIGHT_FROM_HOUR`/`OVERNIGHT_UNTIL_HOUR`), checked first in `fullRunDue`, after the check-page cool-down in `scheduledRunDue`. The zone is `timing.timeZone` (stored from `userTimeZone` at the last relearn; before one, `userTimeZone` live). Refresh runs, hand and T3 runs are unaffected. **Test gotcha:** with no device the zone is Denver, so a test clock of 12:00 UTC is 6 AM there, inside the pause; `automation.test.ts` moved its `NOW` to 16:00 UTC.

**Start delay:** `startDelay(trigger, kind, draw)` in `src/lib/yugioh/automation.ts` (launchAgent full 0–4 min, refresh 0–90 s, else 0). `requestRun` returns `startDelayMs` (0 when nothing is due or a run is already open); `run.sh` waits it out after the ask, before opening Chrome. **Decision:** the delay comes after the ask, since the kind is only known then; the app doesn't hold the run back, so an automation profile that's already open claims it at once (documented). **Fix found in review:** `claimRun` now builds the plan as of `run.requestedAt`, so the delay can't push an auction asked for at 18 minutes under the 17-minute cutoff (red test in `refresh-visits.test.ts`).

**Extension (0.9.0):** `automation-runner.js` `shuffleVisits` (ending-soon pages first as planned, then Search pages shuffled, then TCGplayer pages shuffled; the product shuffle wasn't asked for but is the same idea) and `pauseLength` (20–60 s; 1 in 6 a 1½–3 min pause; two draws). `MIN_PAUSE_MS`/`MAX_PAUSE_MS` are no longer globals.

**Timeouts:** average pause ≈ 56 s; with TCGplayer loads, the first Deck (60 Cards, 66 Candidates, ~86 pages) is ~2 h. `run.sh` run timeout 90 min → 3 h; `RUN_ABANDONED_AFTER_MS` 2 h → 3½ h. The LaunchAgent plist template is unchanged: no reinstall needed (only `install.sh`'s closing echo changed).

**UI copy:** `describeRunTiming` now says "About every 3 hours … and not from 1 to 7 AM".

**Tests:** `convex/yugioh/varied-run-timing.test.ts` (8; `vi.spyOn(Math, "random")` is the injected draw), `src/lib/yugioh/run-timing.test.ts` and `automation.test.ts` (ranges, overnight, start delay), `automation-runner.test.ts` (shuffle and pauses with a scripted random). `refresh-visits.test.ts` and `run-timing.test.ts` pin `Math.random` to 0.4.

**Review (code-review both axes, convex review):** fixed the refresh-delay bug, the `startDelay` comment, the re-export, duplicated test helpers and arrow helpers. **Left open:**
- **Busy hours vs run length (question for Matt):** a ~2 h full run outlasts the 45–80 min busy gap, so busy-hour full runs go back to back and refresh runs can't start meanwhile. Shorter pauses, or a busy gap measured from the run's end, would fix it.
- The start delay is script-side only (see above).
- "1 to 7 AM" is also written out in `run.sh`, `install.sh` and the docs.
- `ux-superpowers:ux-validate`/design review not run: the UI change is copy only.


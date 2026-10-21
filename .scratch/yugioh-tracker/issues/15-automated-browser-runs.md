# 15: Automated browser runs

**What to build:** A script on my Mac drives Chrome with a dedicated profile that has the extension loaded, asks the app which pages to visit, and opens every Search's Newly Listed and Sold pages. It runs every 3 hours from a macOS LaunchAgent and can also be triggered by a T3 Code scheduled task. TCGplayer product pages join the visit list once TCGplayer capture exists.

**Blocked by:** 02 (eBay Searches and links), 06 (eBay capture into Listings)

**Status:** ready-for-agent (the code, config and docs are built; the setup and the two hand checks below are left for Matt)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] App exposes a visit plan to the script, authenticated with a secret
- [x] Script uses its own Chrome profile with the extension installed (loading the extension into that profile is a one-time manual step, see the docs)
- [x] LaunchAgent install and uninstall documented
- [ ] T3 Code scheduled task set up and verified (exact task in `docs/yugioh/automation.md`; agents were told not to create it)
- [x] Modest pacing between page loads
- [ ] Verified by hand: a run captures Listings end to end (the extension side is verified, see Notes; the real Chrome profile under the LaunchAgent isn't)

**Left for you:**
1. Deploy, so prod has `/api/yugioh/automation` and the Convex functions.
2. Do the one-time setup in `docs/yugioh/automation.md` → "One-time setup":
   - `scripts/yugioh-automation/open-profile.sh`, then Load unpacked `extensions/rym-release-scraper`, set the origin and secret, and tick "Run automated captures in this profile";
   - `scripts/yugioh-automation/install.sh`, then fill `YUGIOH_INGEST_SECRET` in `~/.config/yugioh-automation/config`;
   - `scripts/yugioh-automation/run.sh` by hand, and check Settings → Automated runs;
   - `launchctl kickstart -p gui/$(id -u)/dev.moooose.yugioh-automation`.
3. Create the T3 Code task from the doc's "T3 Code scheduled task" section, and verify it with "Run now".

## Notes from the build

**Flow** (full doc: `docs/yugioh/automation.md`; platform facts with sources: `docs/yugioh/references/automated-browser.md`):
1. `scripts/yugioh-automation/run.sh --trigger launchAgent|t3|manual` posts `{op:"request"}` to `POST /api/yugioh/automation`. The route checks the extension secret (`rejectUnlessExtension`), is allowlisted in `route-access.ts`, and forwards through `callYugiohAutomation` (`src/server/convex-server.ts`) to the Convex HTTP route `/server/yugioh/automation`. That route dispatches one `op` per step to `internal.yugioh.automation.*`.
2. The script opens Chrome with `open -n -g -a "Google Chrome" --args --user-data-dir=<profile> --no-first-run --no-default-browser-check`, but only if that profile isn't already running (it checks the PID in `SingletonLock`).
3. In that profile, the extension's service worker claims the run (`op:"claim"`). It checks on `runtime.onStartup` and on a 1-minute `chrome.alarms` alarm, which exists only while the per-profile `chrome.storage.local.yugiohAutomationEnabled` is on (an options checkbox).
4. It visits each page in its own unfocused window: it opens a tab, waits up to 2 minutes for that tab's capture, closes the tab, reports `op:"visit"`, then waits 15–30 s. At the end it sends `op:"finish"`.
5. The script polls `op:"status"` every 20 s. It quits Chrome with SIGTERM only if it opened Chrome.

**Visit plan** (`readVisitPlan` in `convex/model/yugioh/automation.ts`, then `buildVisitPlan` in `src/lib/yugioh/automation.ts`):
- Order: each Search's Newly Listed page, then its Sold page, then each searched Printing's TCGplayer product page (A–Z).
- Each URL is visited once. A run has at most 300 pages (`MAX_VISITS_PER_RUN`).
- **Decision:** Searches are packed across all Decks together (`buildDeckSearches` over every Deck's Cards). That means fewer page loads, and the same Printing is never visited twice. With more than one Deck, the visited URLs therefore differ from each Deck's Searches tab, though they cover the same set codes.
- The plan is built inside the `claimRun` mutation and reads every Deck (up to `MAX_DECKS`) with `readDeck` without `now`. That's the heaviest transaction here.

**Data model:**
- `yugiohAutomationRuns`:
  - The schema is `yugiohAutomationRunValidator` in `validators.ts`, shared with the functions' `returns`.
  - Fields: `trigger`, `status` (`requested` → `running` → `finished` | `failed`), `requestedAt` / `startedAt` / `endedAt`, page counters (`pagesPlanned`, `pagesVisited`, `searchPagesVisited`, `productPagesVisited`, `failedPages`), `listingsCaptured` / `newListings`, `error`, and `pageErrors` (the first 20).
  - Index `by_status`.
- `yugiohAutomationVisits { runId, visitedAt, url, kind, label, listingsCaptured, newListings, error }`, index `by_runId`. It's the full per-page record; no UI reads it yet. Tickets 16 and 17 may want it.
- `yugiohListings` gained the index `by_lastSeenAt`, for "Last captured".

**Rules** (Seam 1 tests: `convex/yugioh/automation.test.ts`, 11 tests):
- A request while a run is open returns that run (`alreadyOpen`). The script then exits 0.
- An open run older than 2 hours (`RUN_ABANDONED_AFTER_MS`) is closed as failed on the next request.
- A finish on a run that was never claimed fails it ("The run never started.").
- A visit report after the run ended is dropped, and `{running:false}` tells the extension to stop.
- Ending an ended run is a no-op.
- The script gives the extension 3 minutes to claim and the run 90 minutes. The env vars `YUGIOH_PICKUP_TIMEOUT_S`, `YUGIOH_RUN_TIMEOUT_S` and `YUGIOH_POLL_S` override these.

**Functions:**
- Internal: `requestRun`, `claimRun`, `recordVisit`, `finishRun`, `getRun`.
- Public, `requireAuth`: `api.yugioh.automation.listRuns` (newest 20) and `getLastCapturedAt` (the newest `lastSeenAt` across all Listings: global, not per Deck).

**Extension** (manifest 0.7.0, adds the `alarms` permission):
- `automation-runner.js` holds `runAutomatedRun({call, visitPage, pause, random})` and `visitOutcome(response)`. It's pure; tested in `tests/automation-runner.test.ts`.
- The service worker loads it with `importScripts("automation-runner.js", "ingest-errors.js")`.
- The eBay and TCGplayer capture listeners call `settleAutomatedVisit(sender.tab.id, …)`.
- Content scripts send `YUGIOH_CAPTURE_EMPTY` (with an optional `error`) when a page has nothing to send, so empty Searches don't wait for the timeout.
- eBay: a page with no `ul.srp-results` is an error or check page ("eBay showed an error or check page instead of results."). A genuine no-results page still has the list.
- On timeout, a tab at `/splashui/captcha` reports "eBay asked for a captcha…".
- The service worker pings `chrome.runtime.getPlatformInfo()` every 20 s during a run. An idle worker is stopped after 30 s, and plain `setTimeout` pauses don't count as activity.
- Run state is in memory only. If Chrome kills the worker mid-run, the script's timeout ends the run.

**UI:**
- Settings has an "Automated runs" `Card` (`automated-runs.tsx`). Each run shows:
  - when it ran and its trigger;
  - the outcome, with an icon and text;
  - Search pages, TCGplayer pages and Listings;
  - the failed pages with their reasons.
- The text comes from `describeRun` and `captureStaleness` in `src/lib/yugioh/run-format.ts`, which are tested.
- The Deck header shows "Last captured 9h ago" (over 6 h) through `DeckCostHeader`'s new `note` prop (`capture-staleness-note.tsx`). It links to `/yugioh/settings#automated-runs`.
- Checked with Playwright on dev: desktop light and 390px dark.

**Verified:**
- **The real extension end to end, in Playwright's Chromium.** Branded Chrome ignores `--load-extension` since version 137. I loaded `extensions/rym-release-scraper`, pointed it at local `pnpm dev`, which talks to the dev Convex deployment, and asked for a run. It claimed the 5-page plan, visited each page with pacing, and reported and finished the run. The first run captured 60 new Listings on dev.
- **The headless browser got blocked.** eBay then served headless Chromium error pages and a captcha, which is why the error and captcha detection was added. The second run recorded those reasons. Expect far fewer checks in a real, headful Chrome profile, but that's unverified.
- **The script** was smoke-tested against the local app: the pickup timeout and a failed Chrome launch both end the run as failed with a reason.
- **Not done:** the LaunchAgent wasn't installed, the real profile wasn't set up, and no T3 task was created, as instructed.

**Dev data:** on dev, 4 test runs and 10 visit rows, plus 60 eBay Listings from the RA01-EN060 Newly Listed Search.

**Bug fix (coordinator):**
- A failed capture or automation call used to show the whole response body in the dock and the console, for example a 404 HTML page from prod without the route.
- `ingest-errors.js` (`describeFailedResponse(origin, status, body)`) now gives one actionable sentence:
  - 404: "The app at www.moooose.dev doesn't have this capture yet (404). Deploy it, or point the extension at http://localhost:1333 in its options."
  - 401: the secret doesn't match;
  - a JSON `error` is kept;
  - otherwise "answered HTTP n".
- The console gets `HTTP n: <page title or a 120-character text excerpt>`.
- This applies to `postYugiohCapture` (eBay and TCGplayer) and `postAutomationStep`. The dock shows a sentence that already ends in punctuation as is.
- Red-first test: `tests/service-worker-errors.test.ts`, which loads the real service worker with `chrome` and `fetch` stubbed.
- The RYM and Bandcamp senders still show raw bodies. They were out of scope.

**Gotchas for 16 and 17:**
- Today the LaunchAgent decides when a run happens: `StartCalendarInterval` at 00, 03, … 21. That catches up once after sleep, which `StartInterval` doesn't.
- For pre-auction visits and adaptive timing, have the agent fire often (every 10–20 minutes), let `request` answer "not due", and add timed visits in `claimRun`.

**Open review notes (left as is):**
- The Convex automation route answers 400 for any error, including server faults (the same pattern as the 06 capture routes).
- `tellNothingToSend` is repeated in both content scripts, as is the trailing-punctuation check.
- "Search pages" counts pages, so each Search counts twice (Newly Listed and Sold).
- `yugiohAutomationVisits` grows without limit, about 8 runs × the plan size a day. Per the spec, data is kept indefinitely.
- An everyday profile with the automation box ticked would also claim runs. The docs warn against ticking it there.
- `ux-superpowers:ux-validate` wasn't run. The ticket's UI is limited to §5.2's "Last captured" note plus the runs list.

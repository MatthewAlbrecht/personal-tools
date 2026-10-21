# Automated browser runs

Every few hours (about every 3 until it learns when sellers post, never from 1 to 7 AM, see "Run timing") a script on my Mac opens every eBay Search (Newly Listed and Sold) and every TCGplayer product page in a Chrome profile of its own. About 20 minutes before a matched auction ends, it also makes a short refresh run, so the auction push 15 minutes before the end shows a fresh price. The extension there captures each page, exactly as it does when I open one myself. Each run is recorded in the app (Settings → Automated runs), and the Deck page says "Last captured 9h ago" once captures are over 6 hours old.

Platform facts and sources: `references/automated-browser.md` (§8 covers how extra runs get triggered). Tickets: `.scratch/yugioh-tracker/issues/15-automated-browser-runs.md`, `16-pre-auction-refresh-visits.md`, `17-adaptive-timing.md`, `18-stop-on-challenge.md`, `19-varied-run-timing.md`, `20-searches-like-a-person.md`.

## How a run works

1. **Trigger.** The LaunchAgent (every 10 minutes), a T3 Code scheduled task, or I run `scripts/yugioh-automation/run.sh`.
2. **Ask.** The script posts `{ op: "request" }` to `/api/yugioh/automation` with the extension secret. The app answers with a run ID and its kind (`full` or `refresh`), or with `runId: null` when nothing is due, and the script exits quietly. If a run is already open, the script leaves that run alone and exits, so two triggers never overlap. See "When a run is due" below.
3. **Wait a moment.** A scheduled run comes with a start delay the app picks at random (`startDelayMs`): up to 4 minutes for a full run, up to 90 s for a refresh run, so runs don't start on the 10-minute marks. T3 Code and hand runs don't wait.
4. **Open Chrome.** The script opens Chrome with the automation profile (`--user-data-dir`). That profile runs as its own Chrome, beside my everyday one. If the profile is already open, the script leaves it open.
5. **Claim.** In that profile, "Run automated captures" is on in the extension's options. Its service worker checks the app when Chrome starts, and then every minute. It claims the run and gets the visit plan:
   - first, the refresh pages of auctions ending in the next 45 minutes (see below), in every kind of run;
   - for a full run, each Search's Newly Listed page, then its Sold page, with the Searches packed across all Decks;
   - then the TCGplayer product page of every searched Printing that has one.

6. **Visit.** The extension visits the refresh pages first, as planned, then the Search pages in a random order, then the TCGplayer pages in a random order (`shuffleVisits` in `automation-runner.js`). It opens the pages in one window of its own, with one tab per marketplace kept for the whole run (see "Visits like a person" below), and waits up to 2 minutes for each page to capture. Each page is scrolled through before it's read. It reports the page (Listings captured, new ones, any error), and pauses before the next one, with the page still showing: 20–60 s, or about 1 time in 6 a longer 1½–3 minutes (`pauseLength`). Closing the window at the end closes the tabs.
7. **Check page.** If a page is a check page (a captcha or bot challenge), the run stops there. See "Check pages" below.
8. **Finish.** After the last page, the extension ends the run. The script, which checks every 20 s, then quits that Chrome (only if the script opened it) and logs a summary.

## Visits like a person

A run's visits should read like one person browsing, without adding page loads: one page load per page in the plan, as before (ticket 20). Platform facts and sources: `references/navigation-and-scrolling.md`.

- **One tab per marketplace.** The first eBay page opens a new tab in the run's window; so does the first TCGplayer page. Every later page of that marketplace loads in that same tab (`makeVisitTabs` in `automation-runner.js`). A tab that was closed mid-run is opened again.
- **eBay Searches open from the eBay page.** Each next eBay Search (Newly Listed, Sold or Ending soon) is opened by the eBay page already in the tab: the service worker asks the content script (`YUGIOH_NAVIGATE`), and the page sets its own `location`. The request then carries the previous eBay Search as its `Referer` and `Sec-Fetch-Site: same-origin`, the headers of a move inside eBay, not of a fresh load from the extension. Only the run's first eBay page opens without a referrer (`chrome.tabs.create`: `Sec-Fetch-Site: none`, like a bookmark). If the page doesn't answer (no content script there), the tab loads the URL directly instead (`chrome.tabs.update`).
- **TCGplayer product pages load directly**: the first in a new tab, each next one in that same tab (`chrome.tabs.update`), with no referrer. Chromium's source suggests `chrome.tabs.update` marks the load as started by the extension (`Sec-Fetch-Site: cross-site`, not `none`); that hasn't been seen on the wire.
- **A page that sent nothing within 2 minutes has its tab closed**, so a late capture from it can't count for the next page; the next page of that marketplace opens a new tab.
- **Scrolling before reading.** On a run's visit (the content script asks the service worker, `YUGIOH_AUTOMATED_VISIT`), the content script scrolls down in uneven steps (45–105% of a screen), with a 0.35–1.5 s pause after each, to about the end of the results: the results list on eBay, the page on TCGplayer (`scrollThroughPage` in `page-scroll.js`). It measures the end again after each step, so rows that load late are reached, and stops after 30 steps. Pages I open myself aren't scrolled.
- **No typing and no filter clicks.** Decision (Matt, 2026-10-21): typing a Search into eBay's search bar and then clicking Sold or Newly Listed would add a page load per Search. Each Search URL already carries its filters, so it's one page load per Search.

**The limits, honestly.**
- Events a content script dispatches (a `click()`, a key press) have `isTrusted: false`, and pages can check that. The run dispatches none.
- Scrolling is the only genuine browser behaviour here: the content script asks the browser to scroll, and the `scroll` events the page sees come from the browser itself (`isTrusted: true`). No `wheel` or pointer events go with them, which a page could notice.
- No navigation from the extension carries `Sec-Fetch-User: ?1`, which a real click sends, because nobody clicked. So the next eBay Search has an eBay referrer but still isn't a click.
- No `chrome.debugger`, and no fake mouse movement. To a bot check that looks for real input, a run is still not a person: the pacing, the shuffled order, the referrers and the scrolling only make the visits less mechanical.
- eBay's result rows are all in the page's HTML; only thumbnails load late. On TCGplayer the lazy images are in the related-product carousels. So scrolling is mostly for looks, and a safety net for rows that render late.

## When a run is due

T3 Code and hand runs are always full runs. The LaunchAgent asks every 10 minutes, and the app (`scheduledRunDue` in `src/lib/yugioh/automation.ts`) answers:

0. **Nothing, for 6 hours after a run stopped on a check page** (`CHECK_PAGE_COOL_DOWN_MS`), neither full nor refresh runs. Hand and T3 Code runs (started with **Run now**) still start, and the script says the last run hit a check page and when scheduled runs resume. See "Check pages" below.
1. **A full run** when the run timing says one is due (`fullRunDue` in `src/lib/yugioh/run-timing.ts`, see "Run timing" below): 2½–3¾ hours after the last one until posting times are learned, and never from 1 to 7 AM. Any full run counts, failed ones too, so a broken run isn't retried every 10 minutes.
2. **A refresh run** when an auction's refresh window is open and no capture has seen it since, overnight too. See the next section.
3. **Nothing** otherwise.

## Refresh runs before auctions end

The auction push goes out 15 minutes before a matched auction ends (ticket 14) and shows the last captured price. A refresh run visits the auction's page 18–28 minutes before the end (about 23 on average), so that price is 3–13 minutes old at the push. An auction that rode along in an earlier refresh, or that a full run saw, can be up to 30 minutes old (see "Seen already").

- **Which auctions:** the ones that will get an auction push. That means a device has push on, the auction isn't pushed yet, and it's matched and Qualifying for a Card that still needs Copies and searches its Printing (`awaitsAuctionPush` in `convex/model/yugioh/pushes.ts`, the same selection as the push).
- **The window:** it opens 28 minutes before the end and closes 17 minutes before. It's wider than the 10 minutes between asks, so one ask always lands in it. After 17 minutes, a visit would land after the push.
- **Seen already:** an auction a capture saw within 45 minutes of its end needs no refresh.
- **Coalescing:** a run refreshes every such auction ending in the next 45 minutes, not just the one that opened the window. So auctions ending close together share one run, and the later ones count as seen.
- **One page per Search:** the refresh page is the auction's Search, showing running auctions only, ending soonest first (`LH_Auction=1&_sop=1`, kind `ebayEndingSoon`, "Ending soon" in the runs list). It shows the price, bids and time left of every auction in that Search, so auctions in one Search share one page. Pages come soonest-ending first.
- **Full runs too:** a full run puts these pages first.
- **Captchas and errors:** a refresh page goes through the same capture and checks as any other page. A failed page is recorded on the run, and the run shows in Settings as "Before an auction ends". A check page stops the run, and no run starts for 6 hours (see "Check pages"). No refresh run starts within 15 minutes of the last run asked for, so a failed refresh isn't retried at the next ask. The auction push still goes out, with the older price.

**Known gaps:**
- If a full run is still going when an auction's window opens, the ask finds that run open and exits. The full run's plan was made when it started, so that auction gets no refresh. Full runs put the auctions ending in the next 45 minutes first, which narrows the gap.
- A refresh run waits up to 90 s before it opens Chrome (its start delay), so its visits land a little later in the window: still before the push. Which auctions it refreshes is decided as of the ask, so the delay can't drop one that was 18 minutes from its end.
- A Mac asleep through the window gets no refresh. On wake, the missed asks fold into one, and that ask catches up only if the window is still open. Only `pmset schedule wake`, which needs root, could wake the Mac. That isn't done.
- Auctions with no end time (see ticket 14) get no refresh.

The constants are `SCHEDULE_TICK_MS` in `src/lib/yugioh/run-timing.ts`, and in `src/lib/yugioh/automation.ts`: `REFRESH_OPENS_BEFORE_END_MS`, `REFRESH_CLOSES_BEFORE_END_MS`, `REFRESH_COALESCE_MS` and `REFRESH_MIN_GAP_MS`. If you change how often the LaunchAgent asks, keep the window wider than the gap between asks.

## Check pages

When eBay or TCGplayer shows a check page (a captcha, "Pardon Our Interruption", a Cloudflare or Akamai challenge or block) instead of results, the run stops at once, so one check page doesn't turn into a string of them. What the pages look like, with sources: `references/marketplace-check-pages.md`.

- **Spotting one.** eBay sends its browser check and captcha to `/splashui/*`, where no content script runs. The service worker watches the visit tab's URL (`checkPageAt` in `automation-runner.js`) and settles the visit the moment the tab gets there. Akamai's block ("Error Page | eBay") comes at the search URL itself, so the eBay content script spots it (`isEbayCheckPage` in `ebay-reader.js`). A results page always has its results list, even with no results, so it never counts. On TCGplayer, `isTcgplayerCheckPage` in `tcgplayer-reader.js` looks for the Cloudflare, AWS WAF and CloudFront shapes. None has been seen on TCGplayer yet. Every product page mentions hCaptcha for its sign-in form, so that name alone doesn't count.
- **The run ends.** The page is reported as `challenged`, distinct from an empty Search and from a timeout. The app ends the run as `challenged`, with the page (`checkPage`), and answers `running: false`, so the extension visits nothing more. Settings → Automated runs shows "Stopped on a check page at eBay (RA01-EN008)", and until scheduled runs resume, when that is. `run.sh` logs the page and exits with code 2.
- **A push.** Devices with push on get "Run stopped on a check page at eBay" at once, at any hour (quiet hours don't hold it). It opens Settings. One push per run.
- **The cool-down.** For 6 hours after the run stopped, the LaunchAgent's asks get nothing. After that, the first ask gets a full run. A hand or T3 Code run during the cool-down still starts, and doesn't end the cool-down, even when it finishes cleanly.

## Limits

- If the extension hasn't claimed the run within 3 minutes, the script ends it as failed: "The extension didn't start the run…".
- If a run takes over 3 hours, the script ends it as failed. With the varied pauses (about 56 s on average) and TCGplayer pages that take up to 75 s to load, a page takes about 1–2 minutes, so 3 hours fits roughly 110–150 pages. The first Deck's full run (60 Cards, 66 Candidates: about 20 Search pages and 66 product pages) takes about 2 hours. A bigger collection needs a longer timeout.
- In busy hours, a full run that long outlasts the 45–80-minute gap, so busy-hour full runs go back to back, and refresh runs can't start while one is open (see "Known gaps" above).
- If a run stays open for over 3½ hours (say the Mac slept mid-run), the next request closes it as failed.
- A page report that arrives after its run has ended is dropped, and the extension stops.

## Code

| Part | Where |
|---|---|
| Script, plist template, install and uninstall | `scripts/yugioh-automation/` |
| Next route (extension secret) | `src/app/api/yugioh/automation/route.ts` |
| Convex channel (one `op` per step) | `/server/yugioh/automation` in `convex/http.ts` |
| Convex functions | `convex/yugioh/automation.ts`, `convex/model/yugioh/automation.ts` |
| Visit plan | `buildVisitPlan` and `buildRefreshVisits` in `src/lib/yugioh/automation.ts` |
| When a run is due | `scheduledRunDue` and `auctionsToRefresh` in `src/lib/yugioh/automation.ts`; `requestRun` and `readVisitPlan` in `convex/model/yugioh/automation.ts` |
| Extension | `automation-runner.js` (run, order, pauses, tabs), `page-scroll.js` (scrolling), the content scripts' `YUGIOH_NAVIGATE` listener in `ebay-content.js`, plus the end of `service-worker.js`, in `extensions/rym-release-scraper/` |

## One-time setup

Do these in order. Paths are relative to the repo, `~/workspace/personal-tools`.

1. **Deploy.** The app at the extension's origin needs this code: the `/api/yugioh/automation` route and the Convex functions. Until it's deployed, point the origin at `http://localhost:1333` and run `pnpm dev:all`.
2. **Open the automation profile:**

   ```sh
   scripts/yugioh-automation/open-profile.sh
   ```

   This opens Chrome with an empty profile at `~/Library/Application Support/yugioh-automation/chrome-profile`. In that window:
   1. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `extensions/rym-release-scraper`. Branded Chrome ignores `--load-extension`, so this step has to be done by hand. It stays loaded in this profile.
   2. Open the extension's **Details → Extension options**:
      - Set **App origin** (`https://www.moooose.dev`, or `http://localhost:1333`).
      - Set **Ingest secret** (the app's `RYM_EXTENSION_INGEST_SECRET`), then **Save**.
      - Tick **Run automated captures in this profile**. Only tick it here, never in your everyday profile.
   3. Optional: sign in to TCGplayer in this profile. Signed in, each product page loads up to 200 latest sales instead of 5.
   4. Quit this Chrome with **⌘Q**.
3. **Install the LaunchAgent.** If it's already installed from before refresh runs (it ran at 00:00, 03:00 and so on), run this again too: it rewrites the plist to ask every 10 minutes and reloads the agent. Your config is kept.

   ```sh
   scripts/yugioh-automation/install.sh
   ```

   The first time, this creates `~/.config/yugioh-automation/config` (mode 600). Open it and set:
   - `YUGIOH_INGEST_SECRET`: the same secret as in step 2.
   - `YUGIOH_APP_ORIGIN`: the same origin as in step 2.

   It also writes `~/Library/LaunchAgents/dev.moooose.yugioh-automation.plist`, checks it with `plutil -lint`, and loads it with `launchctl bootstrap gui/$(id -u)`. The agent asks the app at :00, :10, :20, :30, :40 and :50 past every hour. Most asks find nothing due and exit in about a second without logging. An ask missed while the Mac slept happens once on wake. To see the plist without installing it, run `install.sh --dry-run`.
4. **Try a run by hand, and watch it:**

   ```sh
   scripts/yugioh-automation/run.sh
   ```

   A Chrome window opens in the background and works through the pages. When it's done, the script prints a summary like `Run … finished: 11 of 11 pages, 340 Listings captured (18 new), 0 pages failed.`, and Settings → Automated runs shows the run.
5. **Run the LaunchAgent now,** to check it works under launchd:

   ```sh
   launchctl kickstart -p gui/$(id -u)/dev.moooose.yugioh-automation
   tail -f ~/Library/Logs/yugioh-automation/run.log
   ```

   macOS may show a "Background Items Added" notice. The agent then appears under System Settings → General → Login Items, and it must stay allowed there.

### Uninstall

```sh
scripts/yugioh-automation/uninstall.sh
```

This boots the agent out and deletes its plist. It keeps the config, the logs and the Chrome profile, and prints their paths so you can delete them by hand.

## T3 Code scheduled task

The task runs the same script, so it can be started and watched from T3 Code. A T3 run is always a full run (its plan still puts any auction about to end first). In the 6 hours after a run stopped on a check page it still starts, and the script says so. The LaunchAgent already asks every 10 minutes, so create the task disabled and start it with **Run now**. Don't make T3 Code the scheduler: refresh runs need an ask every 10 minutes, and each T3 run is a model turn that needs the T3 app open (`references/automated-browser.md` §8). If both fire at once, the second one finds the open run and exits.

Create it from a T3 Code thread in the personal-tools project with the `schedule_task` tool:

- **title:** `Yu-Gi-Oh automated capture run`
- **schedule:** `{ "type": "interval", "everyMs": 10800000 }` (every 3 hours)
- **enabled:** `false` (run on demand with `run_scheduled_task_now`)
- **bindToCurrentThread:** `false` (each run gets a fresh thread)
- **prompt:**

  > Run `scripts/yugioh-automation/run.sh --trigger t3` in the personal-tools repo and wait for it to exit (up to 3 hours; run it in the background and poll if your command timeout is shorter). Then report the script's last lines: pages visited, Listings captured and new, and any errors. Don't edit any files. If it exits with code 78, tell me the setup step it names.

**To verify it:**
1. Run `list_scheduled_tasks` to get the task ID.
2. Run `run_scheduled_task_now` with that ID.
3. Check that a new run appears in Settings with the trigger "From T3 Code".

## Changing things

- **Pacing:** `MIN_PAUSE_MS` and `MAX_PAUSE_MS` (20–60 s), `LONG_PAUSE_CHANCE` (1 in 6), and `MIN_LONG_PAUSE_MS` and `MAX_LONG_PAUSE_MS` (1½–3 minutes) in `automation-runner.js`. Longer pauses make runs longer: keep the run timeout above the biggest run (see "Limits").
- **Page order:** `shuffleVisits` in `automation-runner.js`.
- **Start delay:** `MAX_FULL_START_DELAY_MS` (4 minutes) and `MAX_REFRESH_START_DELAY_MS` (90 s) in `src/lib/yugioh/automation.ts`. Keep the refresh one short: a refresh visit must still land before the push 15 minutes before the end.
- **Gaps and the overnight pause:** `FALLBACK_GAP`, `BUSY_GAP`, `CAP_GAP`, `OVERNIGHT_FROM_HOUR` and `OVERNIGHT_UNTIL_HOUR` in `src/lib/yugioh/run-timing.ts`. Keep `CAP_GAP`'s top two asks short of 6 hours.
- **Timeouts:** the page timeout is `AUTOMATION_VISIT_TIMEOUT_MS` in `service-worker.js` (2 minutes). The pickup and run timeouts are at the top of `run.sh` (3 minutes and 3 hours), and the env vars `YUGIOH_PICKUP_TIMEOUT_S`, `YUGIOH_RUN_TIMEOUT_S` and `YUGIOH_POLL_S` override them. The 3½-hour abandon time is `RUN_ABANDONED_AFTER_MS` in `src/lib/yugioh/automation.ts`; keep it above the run timeout.
- **Schedule:** how often the LaunchAgent asks is the `StartCalendarInterval` entries in the plist template (run `install.sh` again afterwards). When a run is due is the app's call; see "When a run is due".
- **Extension code:** an unpacked extension is re-read from disk each time Chrome starts, so a new extension takes effect at the next run.
- **Adaptive timing** (ticket 17) changes only the full-run rule in `scheduledRunDue`. The LaunchAgent and the script stay as they are.

## Run timing

Once Listings go back about 4 weeks (28 days since the first capture), the app learns the hours of the week when sellers post new Listings for my Printings, and times full runs around them. Settings → Automated runs → "When it runs" shows the busy times, or "still learning" with the days of data so far.

- **What it counts:** eBay's own listing time (`listedAt`) of each Listing matched to a Printing, listed in the last 28 days, by hour of the week in my time zone (the zone of the device I used most recently, as for quiet hours). The first-seen time doesn't count: it follows the run schedule, so it would only learn the schedule back. Up to the 2,000 newest Listings captured in that window are read; past that, the oldest weeks are undercounted. TCGplayer Listings have no listing time, so only eBay counts. A Newly Listed page shows a limited number of results, so a long quiet stretch can miss some Listings, which makes the busy hours look a little busier.
- **Busy hours:** an hour of the week with at least 3 Listings in the 28 days and at least twice the average hour. At most the 24 busiest.
- **The rule:** a full run 45–80 minutes after the last in a busy hour and in the hour after it (that run catches the busy hour's Listings). Otherwise no more than 6 hours apart: an ask 5 hours to 5 hours 40 minutes after the last full run starts one. The top is two asks early, so neither the wait for the next ask nor an ask that finds a refresh run still open passes 6 hours. A sleeping Mac, a full run that's still open, or the overnight pause can still stretch it.
- **Fallback:** 2½–3¾ hours apart while learning, and when no hour stands out.
- **Varied gaps:** where in its range each gap falls is drawn at random when a full run ends (finished, failed, stopped on a check page, or closed as abandoned) and stored on that run (`gapDraw`, 0–1), so every ask until the next full run gets the same answer. One draw places the gap in whichever range applies at the ask (`gapWithin`). A full run from before this has no draw and counts as 0.4: the old 3 hours. Asks come every 10 minutes, so a gap lands on the first ask past it (half an ask's slack applies to the fallback and busy gaps).
- **Overnight pause:** no scheduled full run from 1 to 7 AM in my time zone (`inOvernightPause`). Busy hours in that window are skipped, and the 6-hour cap doesn't force a run there: the first ask after 7 AM starts one if it's due by then. Refresh runs for auctions ending overnight still happen, and hand and T3 Code runs still start. My time zone is the run timing's (`timeZone`); before the first relearn, the zone of the device I used most recently, else Denver.
- **Start delay:** see "How a run works", step 3. It's picked by the app when it asks for a scheduled run (`startDelay`), and the script waits it out before opening Chrome. If the automation profile is already open, its extension claims the run at the next minute anyway.
- **When it relearns:** each time a full run ends (`relearnRunTiming` in `convex/model/yugioh/runTiming.ts`), stored in the one-row `yugiohRunTiming` table. No new trigger.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "The extension didn't start the run within 3 minutes" | "Run automated captures" isn't ticked in the automation profile, or the extension isn't loaded there. Run `open-profile.sh` and check `chrome://extensions`. |
| Exit code 78 | No config, or `YUGIOH_INGEST_SECRET` is empty. Run `install.sh` and fill in the config. |
| "The app at … doesn't have this capture yet (404)" | The origin's app doesn't have the route. Deploy it, or use `http://localhost:1333`. |
| "The ingest secret doesn't match … (401)" | The secret in the extension's options, or in the config, isn't the app's `RYM_EXTENSION_INGEST_SECRET`. |
| A page fails with "The page sent nothing within 2 minutes" | The page didn't load, or it's a check page the extension doesn't know. Open it in the automation profile and look. |
| "Stopped on a check page at eBay" (or TCGplayer), a push saying so, or `run.sh` exit code 2 | The marketplace showed a captcha or bot challenge. Run `open-profile.sh`, open the page the run names, and solve it. Scheduled runs wait 6 hours from the stop. To check sooner, run `run.sh` by hand. If check pages keep coming, run less often (see "Changing things"). |
| Updated the repo, but runs still come only every 3 hours, and no refresh runs | The installed plist is the old one. Run `install.sh` again: it rewrites the plist and reloads the agent. |
| Runs never happen | `launchctl print gui/$(id -u)/dev.moooose.yugioh-automation` shows whether the agent is loaded. Check Login Items, and read `~/Library/Logs/yugioh-automation/run.log`. |
| Chrome stays open after a run | The profile was already open when the run started, so the script left it alone. Quit it with ⌘Q. |

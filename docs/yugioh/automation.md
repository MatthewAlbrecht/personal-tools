# Automated browser runs

Every 3 hours a script on my Mac opens every eBay Search (Newly Listed and Sold) and every TCGplayer product page in a Chrome profile of its own. The extension there captures each page, exactly as it does when I open one myself. Each run is recorded in the app (Settings → Automated runs), and the Deck page says "Last captured 9h ago" once captures are over 6 hours old.

Platform facts and sources: `references/automated-browser.md`. Ticket: `.scratch/yugioh-tracker/issues/15-automated-browser-runs.md`.

## How a run works

1. **Trigger.** The LaunchAgent (every 3 hours), a T3 Code scheduled task, or I run `scripts/yugioh-automation/run.sh`.
2. **Ask.** The script posts `{ op: "request" }` to `/api/yugioh/automation` with the extension secret, and gets a run ID. If a run is already open, it leaves that run alone and exits, so two triggers never overlap.
3. **Open Chrome.** The script opens Chrome with the automation profile (`--user-data-dir`). That profile runs as its own Chrome, beside my everyday one. If the profile is already open, the script leaves it open.
4. **Claim.** In that profile, "Run automated captures" is on in the extension's options. Its service worker checks the app when Chrome starts, and then every minute. It claims the run and gets the visit plan:
   - each Search's Newly Listed page, then its Sold page, with the Searches packed across all Decks;
   - then the TCGplayer product page of every searched Printing that has one.
5. **Visit.** The extension opens each page in a window of its own and waits up to 2 minutes for the page to capture. It closes the tab, reports the page (Listings captured, new ones, any error), and waits 15–30 s before the next one.
6. **Finish.** After the last page, the extension ends the run. The script, which checks every 20 s, then quits that Chrome (only if the script opened it) and logs a summary.

**Limits:**
- If the extension hasn't claimed the run within 3 minutes, the script ends it as failed: "The extension didn't start the run…".
- If a run takes over 90 minutes, the script ends it as failed.
- If a run stays open for over 2 hours (say the Mac slept mid-run), the next request closes it as failed.
- A page report that arrives after its run has ended is dropped, and the extension stops.

**Code:**

| Part | Where |
|---|---|
| Script, plist template, install and uninstall | `scripts/yugioh-automation/` |
| Next route (extension secret) | `src/app/api/yugioh/automation/route.ts` |
| Convex channel (one `op` per step) | `/server/yugioh/automation` in `convex/http.ts` |
| Convex functions | `convex/yugioh/automation.ts`, `convex/model/yugioh/automation.ts` |
| Visit plan | `buildVisitPlan` in `src/lib/yugioh/automation.ts` |
| Extension | `automation-runner.js`, plus the end of `service-worker.js`, in `extensions/rym-release-scraper/` |

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
3. **Install the LaunchAgent:**

   ```sh
   scripts/yugioh-automation/install.sh
   ```

   The first time, this creates `~/.config/yugioh-automation/config` (mode 600). Open it and set:
   - `YUGIOH_INGEST_SECRET`: the same secret as in step 2.
   - `YUGIOH_APP_ORIGIN`: the same origin as in step 2.

   It also writes `~/Library/LaunchAgents/dev.moooose.yugioh-automation.plist`, checks it with `plutil -lint`, and loads it with `launchctl bootstrap gui/$(id -u)`. Runs happen at 00:00, 03:00 and so on to 21:00. A run missed while the Mac slept happens once on wake. To see the plist without installing it, run `install.sh --dry-run`.
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

The task runs the same script, so it can be started and watched from T3 Code. The LaunchAgent already runs every 3 hours, so create the task disabled and start it with **Run now**. If T3 Code replaces the LaunchAgent, enable the task instead. If both fire at once, the second one finds the open run and exits.

Create it from a T3 Code thread in the personal-tools project with the `schedule_task` tool:

- **title:** `Yu-Gi-Oh automated capture run`
- **schedule:** `{ "type": "interval", "everyMs": 10800000 }` (every 3 hours)
- **enabled:** `false` (run on demand with `run_scheduled_task_now`)
- **bindToCurrentThread:** `false` (each run gets a fresh thread)
- **prompt:**

  > Run `scripts/yugioh-automation/run.sh --trigger t3` in the personal-tools repo and wait for it to exit (up to 90 minutes; run it in the background and poll if your command timeout is shorter). Then report the script's last lines: pages visited, Listings captured and new, and any errors. Don't edit any files. If it exits with code 78, tell me the setup step it names.

**To verify it:**
1. Run `list_scheduled_tasks` to get the task ID.
2. Run `run_scheduled_task_now` with that ID.
3. Check that a new run appears in Settings with the trigger "From T3 Code".

## Changing things

- **Pacing:** `MIN_PAUSE_MS` and `MAX_PAUSE_MS` in `automation-runner.js` (15–30 s).
- **Timeouts:** the page timeout is `AUTOMATION_VISIT_TIMEOUT_MS` in `service-worker.js` (2 minutes). The pickup and run timeouts are at the top of `run.sh` (3 and 90 minutes), and the env vars `YUGIOH_PICKUP_TIMEOUT_S`, `YUGIOH_RUN_TIMEOUT_S` and `YUGIOH_POLL_S` override them. The 2-hour abandon time is `RUN_ABANDONED_AFTER_MS` in `src/lib/yugioh/automation.ts`.
- **Schedule:** the `StartCalendarInterval` entries in the plist template. Run `install.sh` again afterwards.
- **Extension code:** an unpacked extension is re-read from disk each time Chrome starts, so a new extension takes effect at the next run.
- **Pre-auction visits and adaptive timing** (tickets 16 and 17) will make the app decide when a run is due. The likely shape:
  - the LaunchAgent fires often (every 10–20 minutes);
  - `request` answers "not due" until the app's schedule says so;
  - `claim` adds the timed visits.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "The extension didn't start the run within 3 minutes" | "Run automated captures" isn't ticked in the automation profile, or the extension isn't loaded there. Run `open-profile.sh` and check `chrome://extensions`. |
| Exit code 78 | No config, or `YUGIOH_INGEST_SECRET` is empty. Run `install.sh` and fill in the config. |
| "The app at … doesn't have this capture yet (404)" | The origin's app doesn't have the route. Deploy it, or use `http://localhost:1333`. |
| "The ingest secret doesn't match … (401)" | The secret in the extension's options, or in the config, isn't the app's `RYM_EXTENSION_INGEST_SECRET`. |
| A page fails with "The page sent nothing within 2 minutes" | eBay sent a check page (a captcha), or the page didn't load. Open it in the automation profile and solve it once. |
| Runs never happen | `launchctl print gui/$(id -u)/dev.moooose.yugioh-automation` shows whether the agent is loaded. Check Login Items, and read `~/Library/Logs/yugioh-automation/run.log`. |
| Chrome stays open after a run | The profile was already open when the run started, so the script left it alone. Quit it with ⌘Q. |

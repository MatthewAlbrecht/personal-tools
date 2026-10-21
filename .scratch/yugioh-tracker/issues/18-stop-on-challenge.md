# 18: Stop on a check page

**What to build:** When eBay or TCGplayer serves a bot check (CAPTCHA, "Pardon our interruption", a Cloudflare or Akamai challenge) instead of results, the automated run stops at once, tells Matt, and the app holds off before the next run, so one check page never turns into a run of them.

**Blocked by:** 15, 16, 17

**Status:** done (deploying, reloading the extension and the hand check are left for Matt)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md; automation: docs/yugioh/automation.md

- [x] The eBay and TCGplayer page readers recognise a check page and report it as its own outcome ("challenged"), distinct from "no results" and from a timeout. Research what eBay's and TCGplayer's check pages look like (URL, title, markers) with `research`; save reconstructed HTML fixtures and say in their header that they're reconstructed.
- [x] A challenged visit ends the run: the runner visits no further pages, the run is finished as stopped by a check page (visible in Settings → Automated runs with the page it hit), and `run.sh` prints that and exits non-zero.
- [x] Matt gets a push saying the run stopped on a check page at <marketplace>, so Matt can open the automation profile and solve it. Not held by quiet hours. One push per run.
- [x] Cool-down: after a challenged run, no run of any kind (full or refresh) is due for 6 hours. The rule is pure logic in `src/lib/yugioh/automation.ts` with Vitest tests, and the planner (`scheduledRunDue`) applies it.
- [x] Hand runs (`run.sh` by hand) still start during the cool-down; they print that the last run hit a check page.
- [x] Tests: reader fixtures (Seam 2) and convex-test for the run ending, push and cool-down (Seam 1).
- [x] Docs: `docs/yugioh/automation.md` troubleshooting row for a check page.

**Left for you:**
1. Deploy, so prod has the `challenged` run status, `checkPage`, the `checkPage` push kind and the new `requestRun` reply.
2. Reload the extension (0.8.0) in the automation profile (`chrome://extensions` → reload).
3. Hand check, when a check page next shows: Settings → Automated runs reads "Stopped on a check page at eBay (…)", a push arrives, `run.sh` exits 2, and no scheduled run starts for 6 hours.

## Notes from the build

**Research:** `docs/yugioh/references/marketplace-check-pages.md`.
- eBay sits behind Akamai. Its browser check ("Pardon Our Interruption...") and captcha ("Security Measure | eBay") **redirect to `/splashui/challenge` and `/splashui/captcha`**, where no content script runs. Akamai's 403 block ("Error Page | eBay", "SORRY Something went wrong on our end") comes at the `/sch/` URL itself.
- TCGplayer is CloudFront + S3, not Cloudflare. No TCGplayer check page has ever been captured, so its detection follows the vendors' documented shapes (Cloudflare, AWS WAF, CloudFront block).
- Every TCGplayer product page mentions hCaptcha for its sign-in form, so that name never counts.
- All five `*-check-*.html` fixtures are **reconstructed** and say so in their header comment.

**Extension (0.8.0):**
- `isEbayCheckPage(doc)` (`ebay-reader.js`): false whenever `ul.srp-results` exists; otherwise a title, selector or text marker.
- `isTcgplayerCheckPage(doc)` (`tcgplayer-reader.js`): false when Listings show.
- The content scripts send `YUGIOH_CAPTURE_EMPTY` with `challenged: true`, and the dock says "eBay is checking for bots". A page with no results list and no check markers is still the old "error page" error.
- `checkPageAt(url)` (`automation-runner.js`): "eBay" for `www.ebay.com/splashui/*`. The service worker's `visitPageInWindow` listens on `chrome.tabs.onUpdated` and settles the visit as challenged the moment the tab gets there, and again on timeout.
- `visitOutcome` passes `challenged` through. `runAutomatedRun` stops after reporting a challenged page and returns `stoppedOnCheckPage: true`. If the app still says `running` (an older app), it finishes the run with the reason.

**App:**
- Runs gain the status `challenged` and the field `checkPage { marketplace, url, kind, label }` (optional, so older rows are untouched).
- Visits gain an optional `challenged`.
- `recordVisit` → `stopOnCheckPage` does the following:
  - ends the run with error "Stopped on a check page at eBay.";
  - queues the push (`queueCheckPagePush` in `model/yugioh/pushes.ts`, kind `checkPage`, sent at once, with a TTL of 6 h and tag `check-page-<runId>`, and only if a device has push on);
  - relearns the run timing for a full run;
  - returns false.
- One push per run holds because a run that isn't `running` drops reports.
- `finishRun` now ignores any run that isn't open, so the script's finish can't overwrite `challenged`.

**Cool-down:** `CHECK_PAGE_COOL_DOWN_MS` (6 h) and `inCheckPageCoolDown` are in `src/lib/yugioh/automation.ts`. `scheduledRunDue` takes a required `lastCheckPageAt` and returns null inside the window.
- `readLastCheckPage` (newest `challenged` run via `by_status`, `.first()`) feeds it.
- `requestRun` also returns `lastCheckPage { marketplace, at, coolDownEndsAt } | null` (`yugiohLastCheckPageValidator`).
- **Decision: T3 runs start during the cool-down, like hand runs.** The T3 task is created disabled and run with "Run now", so it's a run Matt starts. A clean hand run doesn't lift the cool-down.

**Script:** `run.sh` logs the last check page when a run starts during the cool-down. It treats `challenged` as ended, logs the page and URL, and **exits 2**. This was smoke-tested against a stub app.

**UI:** `describeRun` handles `challenged`: "Stopped on a check page at eBay (RA01-EN008). Solve it in the automation Chrome profile. Scheduled runs wait until 8:50 PM." After the cool-down, only the first sentence shows. The page also shows in the failed-pages list. That's a copy change only, so no design review was run.

**Tests:**
- `convex/yugioh/check-pages.test.ts` (9 tests);
- `src/lib/yugioh/automation.test.ts` (cool-down edges);
- `run-format.test.ts`: it now pins the clock, which fixes 5 tests that went red once "today" passed Oct 20;
- in the extension: the reader, content and runner tests.

**Review** (code-review on both axes, plus convex-reviewer).
- **Fixed:**
  - T3 now counts as a hand run;
  - the double cool-down gate and read;
  - the shared `yugiohLastCheckPageValidator`;
  - `visitMarketplace`;
  - naming.
- **Left as is:**
  - eBay's automatic JS check (`/splashui/challenge`) also stops the run. The ticket names "Pardon our interruption", though that check can clear itself.
  - Text markers like "Something went wrong on our end" or "Access Denied" could flag a genuine error page. They only apply without a results list.
  - "6 hours" is written out in `run.sh`'s copy.
  - `recordVisit` patches the run twice on a check page.
  - "Check page" isn't in the glossary yet; that's Matt's call.

**Gotchas for 19/20:** a check page short-circuits `scheduledRunDue` before any timing rule, so keep that first. Ticket 20's search flow must still route `/splashui/*` landings through `checkPageAt`.


# 20: Visits that read like a person

**What to build:** Without adding any page loads, a run's visits look more like one person browsing: each results page is scrolled through before it's read, and each eBay Search is reached from the eBay page already open in the same tab, so eBay sees a normal in-site click path with an eBay referrer instead of a string of fresh URL loads.

**Blocked by:** 19

**Status:** done

Decision (Matt, 2026-10-21): no typing into the search bar and no clicking eBay's Sold / Newly Listed controls. That flow adds a page load per Search, and more page loads is the opposite of the goal. One page load per Search, as today.

- [x] Scrolling: on each results page (eBay and TCGplayer), scroll down in uneven steps with short pauses, to about the end of the results, before reading. This also helps rows that load late.
- [x] Same-tab, in-site navigation: a run reuses one tab per marketplace; each next eBay Search is opened from the current eBay page (navigating the page itself, so the request carries an eBay referrer), not by creating a new tab or loading a fresh URL from the extension. Check with `research` how a content-script navigation vs `chrome.tabs.update` affects the Referer and `Sec-Fetch-Site` headers, and pick the one that looks like an in-site click.
- [x] No extra page loads: the run's page count stays the same as before; a test guards it.
- [x] TCGplayer product visits: same tab reuse; say in the docs they load the product page directly.
- [x] Be honest in the docs about the limits: events sent from a content script are untrusted (`isTrusted: false`); only scrolling produces genuine browser events. No `chrome.debugger`, no fake mouse movement.
- [x] Extension version bump; tests (Seam 2) for the scroll-before-read and navigation choice.
- [x] Docs: `docs/yugioh/automation.md` and `docs/yugioh/references/automated-browser.md` updated.

## Notes from the build

**Research:** `docs/yugioh/references/navigation-and-scrolling.md` (specs + Chromium source; headers not yet seen on the wire).
- Content-script `location.assign` → `Referer` = current eBay URL, `Sec-Fetch-Site: same-origin`. **Chosen** for each next eBay Search.
- `chrome.tabs.create` → no referrer, `Sec-Fetch-Site: none`. `chrome.tabs.update` → no referrer and, by source, `Sec-Fetch-Site: cross-site` (extension initiator). Used for TCGplayer products (as the ticket asks) and as the eBay fallback.
- No path sends `Sec-Fetch-User: ?1` (no user activation). Scroll events from `scrollBy` are genuine (`isTrusted: true`); no wheel/pointer events.
- eBay result rows are all in the server HTML (only thumbnails lazy-load); TCGplayer lazy images are only in carousels.

**Extension (0.10.0):**
- `makeVisitTabs({ createTab, updateTab, navigateFromPage })` in `automation-runner.js` → `openVisit(visit, ready)`: one tab per hostname for the run; a later eBay page goes through `navigateFromPage` (falls back to `updateTab`), TCGplayer through `updateTab`; a gone tab (false) gets a new one. `ready(tabId)` fires *before* navigating a known tab, so the service worker registers the visit before any `/splashui/*` redirect.
- `service-worker.js`: `visitPageInTab(openVisit, visit)` replaces `visitPageInWindow`; `runTabs(runWindow)` wires chrome APIs (re-creates the window if it was closed). Tabs are no longer closed per visit, except **a page that times out has its tab closed**, so its late capture can't settle the next visit (pending visits are keyed by tab ID only). The 2-minute timer now starts before the page is opened.
- New message `YUGIOH_NAVIGATE {url}` (SW → eBay content script; only `https://www.ebay.com/sch/*` accepted, replies `{ok}`, then `location.assign`).
- New message `YUGIOH_AUTOMATED_VISIT` (content script → SW, replies `{automated}` = tab has a pending visit). Pages Matt opens himself aren't scrolled; the dock's rerun button never scrolls (`run*Capture({ scroll })`).
- `page-scroll.js` (new content script, before the readers in the manifest): `scrollThroughPage({ endOf, view?, random?, wait? })` steps 45–105% of a screen, pauses 0.35–1.5 s, re-measures `endOf` each step, stops within 15% of a screen of the end or after 30 steps; `scrollEndOf(view, element)`; `isAutomatedVisit()`. eBay scrolls to the end of `ul.srp-results` (only when the list exists), TCGplayer to the page end, after the check-page check and before opening latest sales.
- Ticket 18 kept: the SW's `onUpdated` watch covers every tab the visit waited on; ticket 19's `shuffleVisits`/`pauseLength` untouched.

**Tests (Seam 2):** `tests/automation-runner.test.ts` ("how a run opens its pages": tab reuse, one page load per visit, fallback, closed tab), `tests/page-scroll.test.ts` (6), `tests/ebay-content.test.ts` (scroll before read on a run, not outside; `YUGIOH_NAVIGATE` accepted/refused), `tests/tcgplayer-content.test.ts` (scroll on a run only). Existing content tests now stub `isAutomatedVisit` and `chrome.runtime.onMessage`.

**Left for Matt:**
- Reload the extension (0.10.0) in the automation profile.
- On the next real run, confirm in DevTools (Network → the second eBay Search) that `Referer` is the previous Search and `Sec-Fetch-Site: same-origin`, and see whether `tabs.update` really sends `cross-site` for TCGplayer. Not checked end to end: no run against live eBay was made.
- ~~Question: TCGplayer product-to-product could also navigate from the page~~ Done in the follow-up below.

**Review (code-review, both axes):** fixed: stale capture in a reused tab (timed-out tab closed), the timeout starting only after the page opened, the run window closed mid-run, the duplicated scroll wiring (defaults moved into `page-scroll.js`), and the docs overclaiming "like a click" (now say `Sec-Fetch-User` is missing). Left as is: tabs are keyed by hostname, and `www.ebay.com` is written in three places (`checkPageAt`, `makeVisitTabs`, `isEbaySearchUrl`); the SW glue (`visitPageInTab`, `runTabs`) has no direct test, since its rules live in the tested `makeVisitTabs`.

**Follow-up (Matt, 2026-10-21): TCGplayer navigates in-site too (extension 0.11.0).**
- **Decision change:** the ticket said TCGplayer products "load the product page directly". They no longer do: like eBay, the run's first TCGplayer product opens in a new tab, and each next product is opened from the TCGplayer page already in the tab (`location.assign`, same-origin referrer), with the same `chrome.tabs.update` fallback when no content script answers. Reference §7 in `navigation-and-scrolling.md`.
- `makeVisitTabs` now tries `navigateFromPage` for every known tab, not only eBay's.
- `marketplaces.js` (new; loaded by the service worker and before the eBay/TCGplayer content scripts): `MARKETPLACES` holds each marketplace's host, run page path (`/sch/`, `/product/`) and check-page path (`/splashui/` on eBay). `checkPageAt` and the navigation check use it; `isEbaySearchUrl` is gone. This closes the review finding about `www.ebay.com` in three places (`ebay-reader.js` still builds `https://www.ebay.com/itm/…` item links; left as is).
- `run-navigation.js` (new content script, both marketplaces): the `YUGIOH_NAVIGATE` listener moved out of `ebay-content.js`; it only opens a run page of the page's own marketplace (`isRunPageOf`).
- Tests (Seam 2): `automation-runner.test.ts` (products open from the page; fallback for both marketplaces; one load per visit unchanged), `tcgplayer-content.test.ts` (the product page opens the next product; refuses eBay, non-product, http and bad URLs). eBay's `YUGIOH_NAVIGATE` tests now load `run-navigation.js`.
- Left for Matt: reload the extension (0.11.0); on the next real run, check in DevTools that the second TCGplayer product has `Sec-Fetch-Site: same-origin` and a TCGplayer `Referer`.

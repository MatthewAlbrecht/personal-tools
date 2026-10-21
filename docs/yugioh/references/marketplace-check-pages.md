# Marketplace bot-check pages

How the extension can tell that eBay or TCGplayer has served a bot check (challenge, captcha or block page) instead of the page it asked for. The content scripts run on `https://www.ebay.com/sch/*` and `https://www.tcgplayer.com/product/*`, and the service worker can read a tab's URL. Checked on 2026-10-21 with a few `curl` requests and DNS lookups, plus vendor docs and user reports. The live eBay check pages were fetched once each and examined in `/tmp` (not saved in the repo). **Verified** means seen in a live response, a saved page in `.scratch/yugioh-tracker/`, or DNS. Anything else names its source or is marked **unverified**.

## eBay

### Vendor

- **Akamai sits at the edge (verified).** `www.ebay.com` → CNAME `www.ebay.com.ebaycdn.net` → `slot88167.ebay.com.edgekey.net` → `e88167.a.akamaiedge.net`. Responses carry `x-akamai-transformed`. A bare `curl` of `https://www.ebay.com/` returned `403` with `server: AkamaiGHost` and set the cookies `bm_s` and `bm_so`, which are Akamai Bot Manager cookies.
- **Every normal page loads an Akamai sensor script from a random-looking same-origin path (verified).** For example `<script src="/WLI4S61Fe9y1h/fmcTYmbY9UF5S/Q/GJL7tDEa7V/dQJedzEC/cw/M4bR41D0UV?v=…">`. It appears once in each of the 8 saved search pages in `ebay-raw/` and on both check pages. **This is not a sign of a check.**
- **The interactive checks are eBay's own "splashui" app, served at `/splashui/*` (verified).** It runs behind `server: ebay-proxy-server`, and its CSP report-uri is `monitor.ebay.com/csp-report/splashui/ChallengeGet` or `…/splashui/Captcha`. The scripts come from `ir.ebaystatic.com/rs/c/challenge-*.js` and `…/captcha-*.js`.
- **Captcha provider: unverified.** `captcha.html` and `captcha-6EPhH5JK.js` contain no `hcaptcha`, `recaptcha`, `arkose` or `turnstile` strings. The widget script URL (`captchaJsUrl`) is fetched at runtime from `captchasvc` (`https://www.ebay.com`). Users describe image puzzles ([eBay community](https://community.ebay.com/t5/Report-eBay-Technical-Issues/Captchas-missing-content/m-p/34450910)). **Don't detect by provider name.**
- **The "Pardon Our Interruption" wording is the old Distil Networks (now Imperva) template** ([python-forum thread](https://python-forum.io/printthread.php?tid=9945) via search snippet). eBay reuses that title on its own splashui challenge page (verified below). No Imperva or Distil markers appeared in either live page.

### Where the checks are served

- **The interactive checks redirect to a different path, not the search URL (verified from user reports plus the page shape).** The URLs look like:
  - `https://www.ebay.com/splashui/challenge?ap=1&appName=orch&ru=<encoded original URL>` ([ungoogled-chromium #3333](https://github.com/ungoogled-software/ungoogled-chromium/issues/3333), 2025-06)
  - `https://www.ebay.com/splashui/captcha?ap=1&appName=orch&ru=…&iid=…&iim=…&iia=…&iiz=…` ([eBay community "capcthas"](https://community.ebay.com/t5/Ask-a-Mentor/capcthas/td-p/34864244/))
  - The `ru` parameter holds the original URL. On the challenge page `form#destForm` has `action=<ru>`, and the page sends the browser back there once it passes (verified).
  - **So a content script that matches only `/sch/*` will not run on these pages.** Either the service worker checks the tab URL, or the manifest also matches `https://www.ebay.com/splashui/*`.
  - **Unverified:** the exact redirect status (302 vs a JS redirect) from `/sch/` to `/splashui/`. No redirect was captured live.
- **The edge block is served at the same URL (verified).** A bare `curl` of `https://www.ebay.com/sch/i.html?_nkw=RA01-EN008` returned `403`, `server: AkamaiGHost`, and a 1.8 KB page at the `/sch/` URL itself. A content script on `/sch/*` would run on it.

### Page shapes (verified, live 2026-10-21)

| Page | URL | Title | Visible text / DOM |
|---|---|---|---|
| JS challenge | `/splashui/challenge?…` | `Pardon Our Interruption...` | "Checking your browser before you access eBay. Your browser will redirect to your requested content shortly. Please wait..." and "Reference ID: …". `form#destForm` with hidden inputs `#_chlghost`, `#_cdetail`, `#_crefId`, `#_iid`, `#_appName`, `#_p`, `#_pvt`. `span.spinner-grow` ×3. Scripts `ir.ebaystatic.com/rs/c/challenge-*.js`. The challenge uses WebAssembly ([#3333](https://github.com/ungoogled-software/ungoogled-chromium/issues/3333)) |
| Captcha | `/splashui/captcha?…` | `Security Measure \| eBay` | `<h1>` "Please verify yourself to continue". "To keep eBay a safe place to buy and sell, we will occasionally ask you to verify yourself…". `form#captcha_form[action=captcha_submit]`, `#captcha_loading`, `#areaTitle`, `#statusError`. Script `ir.ebaystatic.com/rs/c/captcha-*.js` |
| Edge block | the requested URL (403) | `Error Page \| eBay` | "SORRY Something went wrong on our end" plus a reference id, then "Please go back and try again or go to eBay Homepage". Classes `error-header__headline`, `reference-id`, `status--container` |
| Older Distil-style wording | unknown | `Pardon Our Interruption` | "As you were browsing eBay, something about your browser made us think you were a bot", followed by the "super-human speed" and "disabled JavaScript" bullets ([eBay community](https://community.ebay.com/t5/Report-eBay-Technical-Issues/Pardon-the-interruption-message/m-p/34958479)). **Unverified** whether eBay still serves this text |

- **None of these pages has `ul.srp-results` (verified).** There were 0 matches in both splashui pages and in the 403 page, and every saved real search page has it. The global header (`#gh`, `#gh-logo`) and footer (`#glbfooter`) are present on the check pages, so don't treat "has eBay header" as "is a results page".
- **Sign-in redirect is not a check (verified, see [ebay-search-results.md](./ebay-search-results.md)).** Sold searches while signed out `302` to `signin.ebay.com/ws/eBayISAPI.dll?SignIn&…&ru=…`. Treat it as "needs sign-in" and keep it separate from bot checks.

## TCGplayer

### Vendor

- **CloudFront in front of an S3-hosted SPA shell. No sign of Cloudflare or Akamai (verified).** `www.tcgplayer.com` → CNAME `dqu7ks5ms02nr.cloudfront.net`. `GET /product/524817` returned `200`, `server: AmazonS3`, `via: … (CloudFront)`, and a 45 KB static `index.html` shell. It had no `cf-ray`, `cf-mitigated` or `server: cloudflare`, and no `AkamaiGHost`.
- **`x-cache: Error from cloudfront` is normal here (verified).** The shell is returned with status 200 even when the S3 object for the path is missing (SPA fallback). Don't read it as a block.
- **The API (`mp-search-api.tcgplayer.com`) answered `200` with `server: Kestrel` (verified).** It resolves to AWS addresses (`54.235.113.15` etc.).
- **No bot-vendor markers in any saved rendered page (verified).** 0 matches for `awswaf|AwsWafIntegration|cloudflare|cf-chl|turnstile|datadome|perimeterx|_px|akamai|incapsula|imperva` across all 7 files in `tcgplayer-raw/`. Headless Playwright also got no challenge ([tcgplayer-product-page.md](./tcgplayer-product-page.md)).
- **No TCGplayer challenge page has been captured.** Neither these checks nor a web search found a public report or captured HTML of one.

### If CloudFront/AWS WAF did challenge (vendor docs, not seen on TCGplayer)

- **AWS WAF Challenge** returns HTTP `202` with header `x-amzn-waf-action: challenge`, and an HTML interstitial when `Accept: text/html`. **CAPTCHA** returns `405` with `x-amzn-waf-action: captcha`. Both are served in place of the requested resource, at the same URL, and resubmit the original request once solved ([AWS WAF docs](https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge-actions.html)). The header isn't readable from cross-origin JS (same source).
- **A WAF block via CloudFront** is a `403` page "The request could not be satisfied … Request blocked … Generated by cloudfront (CloudFront)" ([AWS re:Post knowledge center](https://repost.aws/knowledge-center/cloudfront-error-request-blocked)). Its title is `ERROR: The request could not be satisfied` (**unverified** for TCGplayer).
- **SPA consequence (inference).** The `/product/*` HTML is a static shell, so a page-level challenge would replace the shell at the same `/product/*` URL, and the content script would run on it but find no Vue app. A block on the data APIs instead would show as the normal shell with listings that never render. That case looks like "no listings loaded within the timeout", not like a recognisable check page.

### Cloudflare (for completeness, not used by TCGplayer)

- Cloudflare challenge responses carry `cf-mitigated: challenge`, and `challenge` is the only value ([Cloudflare docs](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)). The challenge page appears before the visitor reaches the destination URL, and the request continues once it passes ([Cloudflare docs](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/)). The "Just a moment...", `/cdn-cgi/challenge-platform/` and `_cf_chl_opt` markers are well known but don't appear in those docs (**unverified** here).

## Markers to detect

**eBay: treat it as a check page if any of these match**

- URL (service worker or a `/splashui/*` content-script match): pathname starts with `/splashui/challenge` or `/splashui/captcha`. Also match any `/splashui/` path, since users also report "Unknown SplashUI Page" ([community](https://community.ebay.com/t5/Report-eBay-Technical-Issues/Cannot-log-in-to-ebay-ca-consistently-get-quot-Unknown-SplashUI/m-p/31772399)).
- Title: starts with `Pardon Our Interruption`, or equals `Security Measure | eBay`, or equals `Error Page | eBay`.
- DOM: `form#destForm`, `#_chlghost`, `form#captcha_form`, `#captcha_loading`, `.error-header__headline`.
- Text: `Checking your browser before you access eBay`, `Please verify yourself to continue`, `made us think you were a bot`, `SORRY` with `Something went wrong on our end`.
- Then, on a `/sch/*` page, make sure `ul.srp-results` is absent before calling it a check. A check page never has it. A real results page always has it, even with 0 results (**unverified** for 0-result pages).
- Kept separate: host `signin.ebay.com` means "needs sign-in", not a bot check.

**eBay: avoid false positives**

- Don't match `captcha`, `challenge`, `hcaptcha` or `recaptcha` anywhere in the page. All four counted 0 in the saved results pages, but eBay can add scripts at any time, and the provider name isn't in the check page anyway.
- Don't match the Akamai sensor `<script src="/<random>/…?v=…">`, or `bm_*` / `_abck` cookies. They are on every page.
- Don't treat `#gh`, `#gh-logo` or `#glbfooter` as proof of a real page. Check pages have them too.

**TCGplayer: treat it as a check page if any of these match** (none captured, so these come from vendor docs)

- Title: `Just a moment...` (Cloudflare), `ERROR: The request could not be satisfied` (CloudFront/WAF), or `Access Denied` (generic).
- DOM/scripts: `script[src*="challenges.cloudflare.com"]`, `script[src*="/cdn-cgi/challenge-platform/"]`, `script[src*="token.awswaf.com"]` or `[src*="awswaf"]`, `iframe[src*="hcaptcha.com"]`, `iframe[src*="recaptcha"]`, `#px-captcha`.
- Text: `Request blocked`, `Generated by cloudfront`, `Verify you are human`.
- Structure: the Vue app root is present but empty, with no `.product-details__listings-results` and no `No Listings Available` after the timeout. Report this as "page didn't load" (possibly blocked), not as a confirmed check.

**TCGplayer: avoid false positives**

- Every normal product page mentions `hcaptcha`. It appears in the CSP `connect-src https://*.hcaptcha.com` and in a modulepreload `…MpLoginHCaptcha__loadRemote…js` for the sign-in modal (verified, all 7 saved files). Match only an actual `iframe[src*="hcaptcha.com"]`, and even then ignore it inside the sign-in modal.
- `x-cache: Error from cloudfront` is on every normal page load (verified).

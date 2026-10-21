# Navigation and scrolling from the extension (ticket 20)

What the request headers look like when the extension moves a tab to the next marketplace page, and what scrolling from a content script actually triggers. Checked on 2026-10-21 against the HTML Standard, Fetch Metadata, Referrer Policy, CSSOM View, and Chromium source (`chromium.googlesource.com`, `main`). **Verified** means a primary source says it. **From source** means it was read from Chromium code but not seen on the wire. **Unverified** means it's a guess.

## Key facts

- **A content script's `location.assign(url)` / `location.href = url` is a normal same-origin page navigation** (from source + spec). Initiator = the page's origin (`https://www.ebay.com`), `Referer` = the full current eBay URL, `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, and no `Sec-Fetch-User`, because nobody clicked.
- **`chrome.tabs.update(tabId, {url})` sets the initiator to the extension's origin** (`chrome-extension://<id>`) and sends no referrer (from source). Chromium's network code then works out `Sec-Fetch-Site: cross-site`, not `none`. **Neither header looks like an in-site click.**
- **`chrome.tabs.create({url})` is browser-initiated with no initiator** (from source). It sends no `Referer` and `Sec-Fetch-Site: none`, which is what a typed URL or a bookmark sends. It sends no `Sec-Fetch-User`.
- **`element.click()` on a link still navigates, but the click is untrusted** (verified). `isTrusted` is false and the navigation has no user involvement. The headers come out the same as `location.assign`.
- **Scrolling from a content script is a real scroll** (verified). The browser fires the `scroll` event itself (`isTrusted: true`), and IntersectionObserver and `loading="lazy"` respond to the new scroll position. No `wheel`, `pointer` or `touch` events go with it.
- **Decision: use content-script `location.assign` for the next eBay Search** (see §6), **and, since a follow-up to ticket 20, for the next TCGplayer product too** (see §7).

## 1. Content-script `location.assign` / `location.href`

- **What the content script shares with the page (verified, [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).** Content scripts "live in an isolated world" and "share access to the page's DOM". Content-script requests "will be subject to the same request rules as the page they are running within" ([Chromium: content script fetches](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)).
- **Initiator = the page's origin (verified spec + from source).**
  - In the spec, [Location-object navigate](https://html.spec.whatwg.org/multipage/nav-history-apis.html#location-object-navigate) uses "the incumbent global object's associated Document" as sourceDocument. [Beginning navigation](https://html.spec.whatwg.org/multipage/browsing-the-web.html#beginning-navigation) step 6.3 says "Set initiatorOriginSnapshot to sourceDocument's origin".
  - In Blink, [`frame_load_request.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/loader/frame_load_request.cc) calls `SetRequestorOrigin(origin_window->GetSecurityOrigin())`. That is the window's (document's) origin. The isolated world's own origin is only used for the CORS checks on content-script `fetch`/XHR.
  - **So the isolated world does not change the initiator for a navigation.**
- **Referer (verified).**
  - Blink fills in the referrer with `origin_window->OutgoingReferrer()`. When the request has no policy of its own, it uses the window's referrer policy (same file, `SetReferrerForRequest`).
  - The [Referrer Policy spec](https://w3c.github.io/webappsec-referrer-policy/#referrer-policies) says "The default referrer policy is 'strict-origin-when-cross-origin'". Under that policy, [step 1](https://w3c.github.io/webappsec-referrer-policy/#determine-requests-referrer) says "If the origin of referrerURL and the origin of request's current URL are the same, then return referrerURL". So same-origin sends the full URL (fragment, username and password are always stripped, [§8.4](https://w3c.github.io/webappsec-referrer-policy/#strip-url)).
- **eBay's referrer policy.**
  - All 8 saved search pages in `.scratch/yugioh-tracker/ebay-raw/` have `<meta name="referrer" content="unsafe-url" />`. Under `unsafe-url` the full URL is sent everywhere (spec: "Return referrerURL").
  - eBay's `Referrer-Policy` response header is **unverified**. A `curl` today got Akamai's `403`.
  - For an eBay→eBay https navigation, both policies give the same result: the full search URL.
- **`Sec-Fetch-Site` (verified).**
  - [Fetch Metadata §2.3](https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-site-header): `none` only "If r is a navigation request that was explicitly caused by a user's interaction with the user agent". Otherwise the value starts at `same-origin` and is raised for each URL in the redirect chain.
  - Chromium [`sec_header_helpers.cc`](https://chromium.googlesource.com/chromium/src/+/main/services/network/sec_header_helpers.cc) does the same walk (`GetRelationOfURLChainToOrigin`) against the initiator.
  - For `/sch/` → `/sch/`, the result is **`same-origin`**. If eBay redirected to `/splashui/…`, that is still same-origin.
- **`Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document` (verified).**
  - [Create navigation params by fetching](https://html.spec.whatwg.org/multipage/browsing-the-web.html#create-navigation-params-by-fetching) builds the request with mode `navigate` and destination `document`.
  - [Fetch Metadata §2.1/2.2](https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-dest-header) sends those values as the headers.
- **`Sec-Fetch-User`: omitted (verified).** See §3.
- **History (verified, Location-object navigate).** The navigation pushes a normal history entry. One exception: if the document is "not yet completely loaded" and there is no transient activation, it becomes a *replace*. Call it after `load`.

## 2. `chrome.tabs.update` and `chrome.tabs.create` from the service worker

- **`tabs.update` (from source, [`tabs_api.cc` `TabsUpdateFunction::UpdateURL`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/extensions/api/tabs/tabs_api.cc)).** It sets `load_params.is_renderer_initiated = true`, with the comment "All renderer-initiated navigations need to have an initiator origin". It also sets `load_params.initiator_origin = extension()->origin()` and `transition_type = PAGE_TRANSITION_FROM_API`. It sets no `referrer`, and [`LoadURLParams::referrer`](https://chromium.googlesource.com/chromium/src/+/main/content/public/browser/navigation_controller.h) is "Empty if none".
  - **Referer: none.**
  - **`Sec-Fetch-Site`: `cross-site`** (from source, not seen on the wire).
    - `GetInitiatorRelation` returns `none` only when the request has no initiator, or when the URL loader factory has `unsafe_non_webby_initiator` and the extension has access to the target.
    - The navigation loader ([`navigation_url_loader_impl.cc`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/loader/navigation_url_loader_impl.cc)) never sets `unsafe_non_webby_initiator`.
    - So `chrome-extension://<id>` → `https://www.ebay.com` comes out as `cross-site`. Confirm in DevTools (Network → request headers) before relying on this.
- **`tabs.create` (from source, [`open_tab_helper.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/extensions/open_tab_helper.cc)).** It builds `NavigateParams(..., PAGE_TRANSITION_LINK)` with `user_gesture = false`. It sets no initiator and no referrer. The PDF extension is the only exception: `MaybeSetPdfNavigateParams` sets an initiator for it.
  - **Referer: none.**
  - **`Sec-Fetch-Site: none`.** With no initiator, the code comment says "Browser-initiated requests with no initiator origin will send `Sec-Fetch-Site: None`".
  - Cookies: [webextensions#663](https://github.com/w3c/webextensions/issues/663) reports that Chrome sends SameSite=Strict cookies on `tabs.create`.
- **`Sec-Fetch-User` for both: omitted (from source).**
  - The navigation loader sets `has_user_activation = has_possibly_filtered_user_gesture` when the transition is web-triggerable. Otherwise it forces it to `true`.
  - [`PageTransitionIsWebTriggerable`](https://chromium.googlesource.com/chromium/src/+/main/ui/base/page_transition_types.cc) removes qualifiers such as `FROM_API` and returns true for `LINK`. Both APIs use core type `LINK` with no gesture, so the header is omitted.
  - Omnibox typing uses `TYPED`, which is not web-triggerable. That is why a typed URL sends `?1`.

## 3. User activation, `Sec-Fetch-User`, and `element.click()`

- **`Sec-Fetch-User` (verified, [Fetch Metadata §2.4](https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-user-header)).** "If r is not a navigation request, or if r's user-activation is false, return". The header is only ever sent as `?1`. Chromium `SetSecFetchUserHeader` removes the header when there is no activation.
- **Where the activation comes from (verified, [create navigation params by fetching](https://html.spec.whatwg.org/multipage/browsing-the-web.html#create-navigation-params-by-fetching) step 9).** "If sourceSnapshotParams's has transient activation is true, then set request's user-activation to true".
  - Transient activation belongs to the page's `Window`, which content scripts share. Only "an activation triggering input event … whose `isTrusted` attribute is true" (keydown, mousedown, pointerdown/up, touchend) sets it ([HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)).
  - An unattended run has no input, so **no `Sec-Fetch-User`**. A real human click on an eBay link does send `?1`. **This is the one header that still differs from a person's click, and nothing in an extension can fix it** without `chrome.debugger` input, which ticket 20 rules out.
- **`element.click()` (verified).**
  - [`click()`](https://html.spec.whatwg.org/multipage/interaction.html#dom-click) fires "a synthetic pointer event named `click` … with the not trusted flag set", so `isTrusted: false`.
  - The `<a>` activation behavior still runs. [DOM dispatch](https://dom.spec.whatwg.org/#concept-event-dispatch) runs activation behavior for `click` events whether or not they are trusted.
  - The link's [user navigation involvement](https://html.spec.whatwg.org/multipage/browsing-the-web.html#event-uni) is: "If event's isTrusted is initialized to true, then return 'activation'. Return 'none'."
  - The `<a>` element follows the hyperlink "using subject's node document" ([links](https://html.spec.whatwg.org/multipage/links.html)), with the hyperlink's referrer policy (`no-referrer` if `rel=noreferrer`).
  - **Result: the same initiator, `Referer` and `Sec-Fetch-*` as `location.assign`**, unless the anchor has `rel=noreferrer` or `referrerpolicy`. The only difference: page script listening for `click` would see an untrusted event, which is easy to fingerprint. `location.assign` dispatches nothing the page can see.

## 4. Scrolling from a content script

- **The `scroll` event is real (verified, [CSSOM View §13.2](https://drafts.csswg.org/cssom-view/#scrolling-events)).** "Whenever a viewport gets scrolled (whether in response to user interaction or by an API)", the browser appends `(doc, "scroll")` to doc's pending scroll events. [Run the scroll steps](https://drafts.csswg.org/cssom-view/#document-run-the-scroll-steps) then "fire an event named type", once per rendering update. The browser creates events it fires with `isTrusted` true ([DOM create an event](https://dom.spec.whatwg.org/#concept-event-create)). So **`scroll` and `scrollend` are `isTrusted: true`**.
- **What a page can still tell (inferred).** A user's scroll comes with trusted `wheel`, `pointer*` or `keydown` events. A script scroll comes with none. Scripts such as Akamai's sensor (see [marketplace-check-pages.md](./marketplace-check-pages.md)) could notice that.
- **`scrollBy` / `scrollTo` (verified, [CSSOM View](https://drafts.csswg.org/cssom-view/#dom-window-scrollby)).** `behavior: "smooth"` animates over several frames, which gives a series of `scroll` events. `instant` jumps in one step. `scrollend` fires only if the position changed.
- **IntersectionObserver and lazy images (verified).**
  - [HTML lazy loading](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#lazy-load-intersection-observer) uses a per-document "lazy load intersection observer". The load resumes when "entry.isIntersecting is true", whatever caused the scroll.
  - The margin is "implementation-defined" ([`#lazy-load-root-margin`](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#lazy-load-root-margin)). Chrome's defaults in [`settings.json5`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/frame/settings.json5) are `lazyLoadingImageMarginPx4G = 1250` and `3G = 2500`.
  - [Will lazy load element](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#will-lazy-load-element-steps): "If scripting is disabled for element, then return false".
- **Background tabs (unverified).** Intersection and scroll steps run during "update the rendering", which a browser may skip for documents nobody can see. Keep the marketplace tab active in its window if the scrolling has to load anything.

## 5. Lazy content in the saved pages

- **eBay search results (from `.scratch/yugioh-tracker/ebay-raw/active.html`).**
  - **All 62 `li.s-card` rows and their text are in the server HTML**, so scrolling isn't needed to read prices.
  - Images: 11 `loading=eager`, 51 `loading=lazy`. Each has `class=s-card__image` and a `data-defer-load` attribute holding the s-l500 URL, plus an inline `defer-load-images` listener.
  - There are no `data-src` attributes and no `IntersectionObserver` string in the markup. Scrolling only loads thumbnails.
  - The trimmed test fixtures (`extensions/rym-release-scraper/tests/fixtures/ebay-*.html`) show the same `loading="lazy"` / `data-defer-load` pattern.
- **TCGplayer product page (from `tcgplayer-raw/p524817-*.html`).**
  - Listing rows are rendered by the client app. They are text, with no lazy images in the rows.
  - The `loading="lazy"` images (`class="v-lazy-image"`, a 1×1 GIF placeholder until loaded) are in the "related products" carousels. `p524817-listings-page2.html` has 23, of which 5 are `v-lazy-image-loaded`.
  - So scrolling on TCGplayer is for looking human, not for getting data.

## 6. Decision for ticket 20

**Use a content-script `location.assign(nextSearchUrl)` to move from the current eBay results page to the next eBay Search in the same tab. Don't use `chrome.tabs.update`.**

- **Headers like an in-site link.** `location.assign` sends `Referer: https://www.ebay.com/sch/…` (full URL, under both the default policy and eBay's `unsafe-url` meta) and `Sec-Fetch-Site: same-origin`, from initiator `https://www.ebay.com` (§1). `tabs.update` sends no Referer and `Sec-Fetch-Site: cross-site` from a `chrome-extension://` initiator (§2). That is the least person-like combination, and stranger than the `none` a fresh `tabs.create` sends today.
- **Same page count.** It is one navigation per Search, same as now. The first eBay Search of a run can't have an eBay referrer. Open it with `tabs.create` (`Sec-Fetch-Site: none`, like a bookmark).
- **Prefer `location.assign` over a synthetic `a.click()`.** The headers are the same (§3), and it doesn't put an untrusted `click` event where eBay's scripts can see it.
- **Known gap to write in the docs.** `Sec-Fetch-User` will be missing on every navigation, while a person's click sends `?1` (§3). An extension can't produce a trusted activation without `chrome.debugger`, which is ruled out.
- **Wiring.**
  - The service worker sends the next URL to the content script with `tabs.sendMessage`. The content script calls `location.assign` after it has replied with the current page's result and the page has finished loading (§1, history note).
  - The worker waits for `tabs.onUpdated` `status: "complete"` on that tab.
  - If the content script isn't there (for example on a `/splashui/` check page), stop the run as ticket 19 does. Don't fall back to `tabs.update`.
- **Check before shipping.** Open DevTools on the capture tab and confirm `Referer`, `Sec-Fetch-Site: same-origin` and the missing `Sec-Fetch-User` on the second Search. The `tabs.update` `cross-site` value in §2 is read from source and hasn't been seen on the wire.

## 7. Follow-up: TCGplayer products open from the TCGplayer page too

Ticket 20 first loaded each next TCGplayer product with `chrome.tabs.update` (no `Referer`, by source `Sec-Fetch-Site: cross-site`, §2). That was the least person-like way to reach a page, so TCGplayer now works like eBay: the run's first TCGplayer product opens in a new tab (`tabs.create`, `Sec-Fetch-Site: none`), and each next product is opened by the product page already in the tab (`location.assign` from the content script, `run-navigation.js`). `chrome.tabs.update` is only the fallback when no content script answers.

- **Headers (from spec, as §1).** Initiator `https://www.tcgplayer.com`, `Sec-Fetch-Site: same-origin`, no `Sec-Fetch-User`.
- **Referer (inferred).** The saved product pages in `.scratch/yugioh-tracker/tcgplayer-raw/` have no `<meta name="referrer">`. Under the default `strict-origin-when-cross-origin` a same-origin navigation sends the full product URL. TCGplayer's `Referrer-Policy` response header is **unverified**; a stricter one (`same-origin`, `no-referrer`) would trim or drop it.
- **Full page load.** TCGplayer is a client-side app, but `location.assign` to another URL is a normal document navigation, so it is still one page load per product, and the content script runs again on the new page.
- **Which pages.** The page only opens a page a run opens on its own marketplace: `https://www.ebay.com/sch/*` from eBay, `https://www.tcgplayer.com/product/*` from TCGplayer (`MARKETPLACES` in `marketplaces.js`).

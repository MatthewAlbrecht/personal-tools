# Web Push in the iOS home-screen web app

What it takes to send Web Push to personal-tools (Next.js App Router on Vercel) once it's installed on an iPhone home screen (iOS 16.4+), with a hand-written worker at `public/sw.js` and sends coming from a Convex action. Copied from music-and-friendship (researched 2026-10-11 for an Expo web export) and adapted: sections 1-5 and 7 are platform facts and unchanged; section 6 and "For this app" are rewritten for this repo.

Sources: WebKit `main` (fca78fce77), Apple's "Sending web push notifications in web apps and browsers" (https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers, abbreviated **Apple doc** below), the WebKit blog, MDN browser-compat-data, RFC 8030, the `web-push` README, and Vercel's docs. **Confirmed** means a primary source settles it. **Reported** means only developers' reports say so. **Device-only** marks what you have to check on an iPhone from the home screen.

## 1. Which APIs exist where, and how to detect "push possible here"

- **Confirmed (source):** on iOS, `Notification` and `PushManager` are switched off unless the host turns them on. `NotificationsEnabled` defaults to `false` on `PLATFORM(IOS_FAMILY)`, and `PushAPIEnabled` is an `embedder` setting that defaults to `false` (`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`). The interfaces are gated on those settings (`Notification.idl`: `EnabledBySetting=NotificationsEnabled`; `PushManager.idl`: `EnabledBySetting=PushAPIEnabled`). So when a setting is off, the global is `undefined`, not merely non-working.
- **Confirmed (MDN BCD):** Safari iOS `Notification` is 16.4+: "The `Notification` interface is undefined, unless the page is a web app saved to the home screen. The app's manifest must have a non-default `display` value." `PushManager`, `push` and `setAppBadge` are 16.4+, home-screen apps only (https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json, `PushManager.json`, `Navigator.json`). Apple: "Add web push to Home Screen web apps in iOS 16.4 or later" (Apple doc).
- **Service workers** exist in a plain Safari tab too (iOS 11.3+). `navigator.serviceWorker` alone says nothing about push.
- **The table:**

  | | Safari tab | Home-screen app (manifest `display: standalone`) |
  |---|---|---|
  | `navigator.serviceWorker` | yes | yes |
  | `window.PushManager` | no (`undefined`) | yes |
  | `window.Notification` | no (`undefined`) | yes |

- **The manifest matters:** a site saved without a manifest asking for `standalone`/`fullscreen` (or the legacy web-app-capable meta tag) is saved as a bookmark that opens in Safari, which has no push (WebKit blog, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). In iOS 26 every site added to the home screen opens as a web app by default (https://webkit.org/?p=16993).
- **Detection.** WebKit's advice is "feature detection instead of browser detection" (WebKit blog 13878):
  ```ts
  const pushPossible = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const installable = !pushPossible && /iPhone|iPad/.test(navigator.userAgent); // show "Add to Home Screen" steps instead
  ```
  Display mode (`matchMedia('(display-mode: standalone)')`) tells you whether you're installed. It doesn't tell you whether push exists, so use it only to choose which message to show.

## 2. User gesture: is an `await` before the call OK?

- **Apple's instruction:** "Provide a method for the user to grant permission with a gesture … When the user completes the gesture, call the push subscription method immediately from the gesture's event handler code" (Apple doc).
- **Confirmed (source): both calls check transient activation, which is time-based.** Since March 2022, before iOS 16.4 shipped (commit 0abd8ba784, "Only show notification permission prompt on transient activation"):
  - `Notification.requestPermission()` resolves `"denied"` with the console error "Notification prompting can only be done from a user gesture." unless `window->consumeTransientActivation()` succeeds (`Source/WebCore/Modules/notifications/Notification.cpp` ~443-448).
  - `pushManager.subscribe()` only checks the gesture **when permission is still `default`**, in which case it shows the prompt itself. If permission is `denied` it rejects. If permission is already `granted` it subscribes without any gesture (`Source/WebCore/Modules/push-api/PushManager.cpp` ~125-168, "Push notification prompting can only be done from a user gesture.").
  - Transient activation lasts **5 s** after the tap (`defaultTransientActivationDuration { 5_s }`, `Source/WebCore/page/LocalDOMWindow.cpp:201`). It's a timestamp, not a call stack (`hasTransientActivation`, ~1589). So an `await` that settles within 5 s doesn't lose it, but `consumeTransientActivation()` uses it up: after `requestPermission()` you can't prompt again without another tap.
- **What this means for `await navigator.serviceWorker.ready`:** it's safe as long as it resolves quickly, which it does if the worker was registered at app start and not inside the tap. Doing the `register()` call and its first install inside the handler risks the 5 s window. **Device-only:** this source is current `main`. Whether early 16.x builds behaved the same isn't documented.
- **Simplest safe sequence (one tap):** `const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. `subscribe()` prompts if needed (source above), so there's no separate `requestPermission()` call to use up the activation. `userVisibleOnly: true` and `applicationServerKey` are required ("Subscribing for push requires userVisibleOnly to be true", PushManager.cpp ~81-88).

## 3. A push that shows no notification

- **Apple:** "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site" (Apple doc).
- **Confirmed (source): three strikes, never reset.**
  - When the `push` event's `waitUntil` promises settle, WebKit counts the event as failed if no `showNotification()` happened **or** any extend-lifetime promise rejected. It logs "Push event handling completed without showing any notification … This may trigger removal of the push subscription." (`Source/WebCore/workers/service/context/ServiceWorkerThread.cpp` ~314-336).
  - webpushd also starts a **30 s** timer per push (`silentPushTimeoutForProduction { 30_s }`, `Source/WebCore/Modules/notifications/NotificationData.h`; `WebPushDaemon::silentPushTimerFired`).
  - Each failure increments `silentPushCount` for that origin's subscription set. At `maxSilentPushCount = 3` (`Source/WebKit/Shared/WebPushDaemonConstants.h`), webpushd removes **all** that origin's subscriptions: "Removing all subscriptions … since it processed %u silent pushes" (`Source/WebKit/webpushd/PushService.mm` ~653-668).
  - `PushDatabase` only ever increments the count (`Source/WebCore/Modules/push-api/PushDatabase.cpp` ~728-762). That makes it 3 strikes per subscription set for its lifetime, not per day.
  - The count isn't incremented while the worker is being inspected in Web Inspector (`WebPushDaemon.mm` ~712), so debugging over a cable hides the problem.
- **Handler rules this implies:**
  - Call `event.waitUntil(...)` synchronously in the `push` listener, and make the promise end in `self.registration.showNotification(...)`.
  - Never let that promise reject: catch a bad payload and still show a generic notification.
  - Don't skip the notification because the app is in the foreground.
  - Do no slow network work before showing it.
- **Declarative Web Push (iOS 18.4+, home-screen apps):** a payload with `"web_push": 8030`, a `notification` (non-empty `title`) and a `navigate` URL is shown by the browser itself, even with no worker. If the worker's `push` handler doesn't replace it in time, the browser shows the declared notification as a fallback. WebKit: no silent-push penalty applies because one is always visible ("Meet Declarative Web Push", https://webkit.org/blog/16535/meet-declarative-web-push/). That makes it a safety net, but only on 18.4+.

## 4. Sending to `web.push.apple.com` (VAPID, headers, status codes, size)

- **Endpoint host:** subscriptions on Apple devices point at `https://web.push.apple.com/...`. Apple's doc says to allow `https://*.push.apple.com` and requires TLS with SNI.
- **VAPID JWT (Apple's `BadJwtToken` reasons, verbatim):** "The JWT is missing. The JWT is signed with the wrong private key. The JWT subject claim isn't a URL or `mailto:`. The JWT audience claim isn't the origin of the push service where you sent the request. The JWT expiration parameter is more than one day into the future." Also: "Don't refresh your JWT more frequently than once per hour", and the public key in `Authorization` must match the one passed to `subscribe()` (otherwise `VapidPkHashMismatch`). (Apple doc.)
- **Subject:** the `web-push` README says the subject must be "a real, externally valid contact URI rather than a local placeholder such as `mailto:user@localhost`". It also says Safari "rejects the request with a `BadJwtToken` error" for an `https://localhost` subject, and that Apple "may reject localhost-based subjects with `403 BadJwtToken`" (https://github.com/web-push-libs/web-push#readme). **Reported:** a space or angle brackets (`mailto: <a@b.c>`) also gets rejected (Apple forums, https://developer.apple.com/forums/thread/725473). Use a plain `mailto:matt@<real-domain>` or the production `https://` origin.
- **Headers (Apple doc):**
  - `TTL` is **required**: missing or non-positive gives `BadTtl`. Apple stores an undelivered message for up to 30 days, depending on `TTL`, and only a limited number per offline device. The `web-push` default is 4 weeks.
  - `Urgency` is optional: `very-low | low | normal | high`. Anything else gives `BadUrgency`. Use `high` for immediate delivery.
  - `Topic` is optional, ≤ 32 URL-safe base64 characters, and coalesces pending messages with the same topic.
  - `Content-Encoding` names the payload encryption (`aes128gcm`).
- **Status codes (Apple doc):** `201` success. `400` bad request (see `reason`). `403` authentication error (bad JWT/VAPID). `404` "invalid `:path`". `405` non-POST. `410` "The device token has expired." `413` payload too large. `429` too many requests to the same device. `500`/`503` server errors. Error bodies are JSON with a `reason` key.
- **Which codes mean the subscription is gone:** RFC 8030 §7.3: "A push service MUST return a 404 (Not Found) status code if an application server attempts to send a push message to an expired push message subscription" (https://www.rfc-editor.org/rfc/rfc8030#section-7.3). Apple uses `410` for an expired token. **Delete the stored subscription on 404 or 410.** Retry 429/5xx with backoff. Treat 400/403 as our own bug (log the `reason`, keep the subscription).
- **Payload:** Apple caps it at 4 KB ("The payload size is over the limit of 4 KB", `PayloadTooLarge`). RFC 8030 §7.2 forbids rejecting ≤ 4096 bytes. `aes128gcm` adds about 100 bytes of header and tag to the encrypted body, so keep the JSON well under ~3.5 KB: ids and short strings, not Listing data.
- **Connections:** at most 100 unacknowledged requests per HTTP/1.1 connection, and respect `SETTINGS_MAX_CONCURRENT_STREAMS` on HTTP/2 (Apple doc). Irrelevant for one user.

## 5. `notificationclick`: focus, navigate, openWindow

- **Confirmed (source): a notification click gives the worker a 2 s "user gesture".** `notificationclick` calls `recordUserGesture()` (`ServiceWorkerThread.cpp` ~424-428), which lasts `userGestureLifetime { 2_s }` (`ServiceWorkerGlobalScope.h:106`). Both of these reject with `InvalidAccessError` outside that window (`ServiceWorkerClients.cpp` ~102-105, `ServiceWorkerWindowClient.cpp` ~49-52):
  - `clients.openWindow()`: "requires a user gesture"
  - `client.focus()`: "WindowClient focus requires a user gesture"

  Call them early in the handler, not after slow awaits.
- **Confirmed (source): `navigate()` only works on a client this worker controls.** It rejects with `TypeError` "service worker is not the client active service worker" (`Source/WebKit/NetworkProcess/ServiceWorker/WebSWServerToContextConnection.cpp`; spec step 4). So a client found with `includeUncontrolled: true` can be focused but not navigated unless it's controlled. Use `client.postMessage({ url })` and route in the page instead.
- **Fixed:** the window a home-screen app opens to handle a click used to be "inert for a short period" (`focus`/`navigate`/`postMessage` failed). Fixed 2023-04-07 (262711@main) by queuing `postMessage` for a not-yet-active client (https://bugs.webkit.org/show_bug.cgi?id=252544).
- **Open, mixed:** https://bugs.webkit.org/show_bug.cgi?id=263687 (iOS 17), "notificationClick openWindow goes to PWA root instead of url given". When the app was closed, `navigate()` failed and the app opened at its start URL, and behavior varied. As of 2025-12 a WebKit engineer couldn't reproduce it on iOS 26.0 ("both `self.clients.openWindow()` and `client.navigate()` work"). **Reported** on the Apple forums: a backgrounded app resumes on its last page and a killed app opens at the root (https://developer.apple.com/forums/thread/733604).
- **Where `openWindow` opens:** no Apple source says. Reports agree it opens the home-screen app (not Safari) for in-scope URLs. **Device-only.**
- **Pattern that survives all of the above:**
  1. In `notificationclick`, `event.notification.close()`.
  2. `matchAll({ type: 'window', includeUncontrolled: true })`.
  3. If there's a client, `await client.focus()` then `client.postMessage({ type: 'open', url })`, and have the app's router push the URL. Otherwise call `clients.openWindow(url)`.
  4. As a backstop for the cold-start case, also have the app read the pending URL on launch, e.g. from a value the worker stored in IndexedDB/Cache before opening.

## 6. Scope, Next.js and the session middleware

- **Scope:** a worker's maximum scope is its script's directory. `/sw.js` registered with `{ scope: '/' }` controls every page on the origin with no `Service-Worker-Allowed` header (Service Workers spec, https://w3c.github.io/ServiceWorker/#start-register-algorithm; MDN `register()`). Pages loaded before the worker activates are uncontrolled until reload, unless the worker calls `clients.claim()` (relevant to `navigate()` above).
- **Serving:** Next.js serves `public/sw.js` as a static file with `Content-Type: application/javascript`. Vercel's default `cache-control: public, max-age=0, must-revalidate` (https://vercel.com/docs/caching/cache-control-headers) plus the spec's `updateViaCache: 'imports'` means no override is needed. If one is ever added for `/sw.js`, keep it `no-cache`, never `immutable`.
- **Manifest:** use the App Router metadata file `src/app/manifest.ts` (served at `/manifest.webmanifest`) with `display: "standalone"`. `start_url: "/yugioh"`, `scope: "/"` (the login page at `/login` must stay in scope, or signing in from the installed app bounces to Safari).
- **The middleware is default-deny.** `src/middleware.ts` redirects every path not in `src/lib/route-access.ts` to `/login`. A redirected `/sw.js` comes back as HTML, and registration fails with a MIME-type `SecurityError`; that's the failure to recognize. Add `/sw.js`, `/manifest.webmanifest` and the app icons (`/icon-192.png`, `/icon-512.png`, `/apple-icon.png`, or whatever the build names them) to `PUBLIC_EXACT`, and cover them in the route-access test.

## 7. `pushsubscriptionchange` and the app badge

- **`pushsubscriptionchange`: exposed but never fired.**
  - **Confirmed (source):** the event interface exists and `onpushsubscriptionchange` is on `ServiceWorkerGlobalScope` (`LayoutTests/http/wpt/push-api/onpush-enabled.js`).
  - But the only caller of `SWContextManager::firePushSubscriptionChangeEvent` is `ServiceWorkerInternals` (`Source/WebCore/testing/`), a test hook. No `Source/WebKit` IPC path sends it.
  - MDN BCD lists it as unsupported on Safari iOS (`version_added: false`).
  - **What to do instead:** don't rely on it. On every app open where permission is `granted`, call `reg.pushManager.getSubscription()` and upsert it to Convex (re-`subscribe()` if it's null). Prune server-side on 404/410.
- **Badge: yes, including from the worker.**
  - `setAppBadge`/`clearAppBadge` are a `NavigatorBadge` mixin (`Source/WebCore/Modules/badge/NavigatorBadge.idl`) implemented on both `Navigator` and `WorkerNavigator` (`Source/WebCore/page/WorkerNavigator.cpp`, `WorkerBadgeProxy.h`), so `self.navigator.setAppBadge(n)` works in the service worker.
  - WebKit: badges change "while the user has the web app open in the foreground", and also while the app handles push events in the background. A badge can be set "even before permission to display the count has been granted", but it only shows once the user allows it (WebKit blog 13878). Users control badging per app in Settings → Notifications (Apple doc).
  - BCD: passing `0` clears the badge instead of showing a dot.
  - Declarative payloads can carry `app_badge` (WebKit blog 16535).
  - Setting the badge does **not** count as showing a notification: the silent-push rule in §3 still applies.

## For this app (`/yugioh`)

- The "Turn on notifications" control lives at `/yugioh/settings`. Show it only when `PushManager` and `Notification` exist. On an iPhone Safari tab without them, show the add-to-home-screen steps instead.
- Register `/sw.js` at app start (a client component in the `/yugioh` layout). In the button's `onClick`, do one `await navigator.serviceWorker.ready` then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, with no other awaits first. Save the subscription to Convex in the same handler.
- Resync the subscription on every launch. There's no `pushsubscriptionchange` on iOS.
- The worker's `push` handler always calls `event.waitUntil(showNotification(...))` and never rejects. Three misses and iOS drops the subscription for good. Quiet hours are enforced in Convex by **not sending**, never by a worker that receives and stays silent.
- Convex action sends (Node runtime, `web-push`, which is not yet an approved dependency: ask first):
  - VAPID subject is a real `mailto:` or the production `https://` origin, never localhost. VAPID keys are declared in `src/env.js` (public key) and Convex env (both).
  - Always set `TTL`. `urgency: 'high'` for auction-ending pushes; `normal` for deal pushes.
  - Use `Topic` = the Listing id so a re-sent deal coalesces instead of stacking.
  - Keep payloads small: title, body, URL, tag. No Listing data beyond what the banner shows.
  - Delete the subscription on 404/410; log `reason` on 400/403.
- `notificationclick`: close, focus an existing client and `postMessage` the route (don't depend on `navigate()`), else `openWindow(url)`. Do it within 2 s. External URLs (an eBay item) go through `openWindow` directly.
- After deploy, check that `/sw.js` comes back as JavaScript, not the login page.

Check on the iPhone, from the home-screen icon:

1. Safari tab: `PushManager`/`Notification` are `undefined`. Installed app: both present.
2. Tap Turn on: the prompt appears and a `web.push.apple.com` endpoint reaches Convex.
3. A push with the app closed, backgrounded and foregrounded shows a banner each time.
4. Tapping it with the app killed or backgrounded lands on the right screen.
5. Removing the app from the home screen makes the next send return 410. **Device-only:** no Apple source says removal revokes the subscription.

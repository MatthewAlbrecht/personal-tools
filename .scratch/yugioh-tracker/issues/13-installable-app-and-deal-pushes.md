# 13: Installable app and deal pushes

**What to build:** I can install the site to my phone's home screen and turn on push. I get a push for every new Great or Good Qualifying Listing on a Card I still need, held between 11pm and 8am.

**Blocked by:** 09 (eBay Reference price and Deal grades)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Web app manifest and service worker
- [x] VAPID keys declared in src/env.js and Convex env
- [x] Push subscription stored per device; can be turned off
- [x] Quiet hours hold deal pushes and deliver them after 8am
- [x] convex-test covers which deals trigger a push and quiet-hours behaviour (Seam 1)
- [ ] Real delivery checked by hand on my phone

**Left for you:** "Real delivery checked by hand on my phone" (needs prod deploy and prod VAPID keys, below). Status stays until then.

## Notes from the build

**Left for you (prod).** Run these on your Mac. Don't paste the private key anywhere else.
1. Generate a prod key pair (`pnpm exec web-push generate-vapid-keys --json`), or with node: `node -e 'console.log(JSON.stringify(require("web-push").generateVAPIDKeys()))'`.
2. `npx convex env set --prod VAPID_PUBLIC_KEY <publicKey>`
3. `npx convex env set --prod VAPID_PRIVATE_KEY <privateKey>`
4. `npx convex env set --prod VAPID_SUBJECT https://www.moooose.dev`
5. In Vercel, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>` for Production (`vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production`), then redeploy. Both halves must be the same pair.
6. After deploying, check that `https://www.moooose.dev/sw.js` returns JavaScript, not the login page.
7. On the iPhone: open the site in Safari → Share → Add to Home Screen → open it from the home screen → /yugioh/settings → turn on "Deal alerts on this device" → "Send a test alert". Then try the checks at the end of `docs/yugioh/references/ios-web-push.md` (app closed, backgrounded, foregrounded; tapping a deal push lands on the Listing drawer).

**Dependencies:** `web-push` 3.6.7 and `@types/web-push` (approved). It runs only in `convex/yugioh/pushDelivery.ts` (`"use node"`) through the adapter `convex/model/yugioh/webPushSender.ts` (also `"use node"`; tests `vi.mock` it). It bundles without `externalPackages`.

**Import fee default:** `DEFAULT_IMPORT_FEE_PERCENT` is now 15 (approved). The tests, the listing drawer comments, the spec (story 43), the design direction and the research doc are updated. Settings reads the value from the query, so its "Other countries" row shows 15%.

**Data model** (`convex/schema.ts`):
- `yugiohPushSubscriptions { endpoint, p256dh, auth, timeZone, createdAt, lastSeenAt }`, indexes `by_endpoint` and `by_lastSeenAt`. There's one row per device. A row is deleted when push is turned off on that device, or when the push service answers 404 or 410.
- `yugiohPushes { kind: "deal" | "test", listingId | null, title, body, url, tag, createdAt, deliverAt, status: pending | sending | sent | failed | skipped, sentAt, devicesReached, note }`, index `by_listingId_and_kind`.
  - This is the outbox and the send log. It feeds the discovery doc's "deal pushes sent per week" metric.
  - **Ticket 14:** add an `"auction"` kind to `yugiohPushKindValidator`. Dedupe with `by_listingId_and_kind`, and queue with `queuePush` (it's private in `convex/model/yugioh/pushes.ts`; export it) with `deliverAt = now`, so quiet hours don't apply. Use `urgency: "high"`. `claimDelivery` hardcodes `"normal"`, so make it depend on the kind. Also add an entry to `TTL_SECONDS`.

**Deal push rule** (`checkDeal` in `convex/model/yugioh/pushes.ts`). A Listing is pushed **once ever** when all of these hold:
- It's **new**: first seen in the last 24 h, and when eBay gives a listing date, listed in the last 24 h too. That stops a first capture of a new Search from pushing old Listings.
- It's still for sale at a fixed price: not sold, not a sale, not an auction.
- It's matched (`matchedPrintingId` from `deals.ts`, now exported).
- A Card still needs Copies and searches that Printing: the Chosen one, or any Candidate while the Card is undecided.
- At **that Card's own** Lowest acceptable condition, it's Qualifying and graded Great or Good. This uses `loadCardDealGrader(ctx, now)`, new in `convex/model/yugioh/deals.ts`.
- When several Decks qualify, the URL opens the Deck with the latest `yugiohDeckVisits.viewedAt`.

**Triggers:** `queueDealCheck(ctx, listingId)` schedules `internal.yugioh.pushes.checkDeal`. It schedules nothing while no device has push on, so other tests and dev are unaffected. It's called from:
- `saveTitleRead` (`matching.ts`), whenever the result is a match;
- `setMatchOverride`, when I match a Listing to a Printing;
- `ingestTcgplayerProduct`, for new rows that aren't sales, but only if the product page was captured before. The first capture finds Listings that were already there.

`rematchSetCode` (a Printing added later) doesn't trigger a check, on purpose.

**Quiet hours:**
- The rule is `pushDeliveryTime(now, timeZone)` in `src/lib/yugioh/pushes.ts`. It holds deal pushes from 11pm to 8am, uses `Intl` for the time zone, and corrects for a clock change overnight.
- **Decision:** the time zone comes from the most recently seen subscription, which is the phone in practice, since each launch refreshes it. It falls back to `America/Denver`, the zone the birthdays feature uses.
- A held push is scheduled with `ctx.scheduler.runAt(deliverAt, internal.yugioh.pushDelivery.deliver)`, so no cron is needed. `claimDelivery` skips it if the Listing has since sold or ended as a sale. The text is fixed when the deal is found and delivered unchanged (design §9).

**Copy:** `dealPushText`:
- title: "Great deal: Ash Blossom & Joyous Spring QCSR"
- body: "$42.15 a copy, 78% of $54 ref · eBay, buy it now"

The ref shows whole dollars when it is a whole number. The tag is `deal-<listingId>`, and the Topic is the Listing id when it fits in 32 characters.

**Functions:**
- Public (`requireAuth`): `api.yugioh.pushes.savePushSubscription({ endpoint, keys: { p256dh, auth }, timeZone })` (upserts; https endpoints only, with size caps), `removePushSubscription({ endpoint })`, `hasPushSubscription({ endpoint })` and `sendTestPush({})`.
- Internal: `checkDeal`, `claimDelivery` and `recordDelivery` (`convex/yugioh/pushes.ts`), plus `deliver` (`convex/yugioh/pushDelivery.ts`).

**App:**
- `src/app/manifest.ts` serves `/manifest.webmanifest`: `start_url` `/yugioh`, `scope` `/`, `standalone`.
- The icons are `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-icon.png`: a neutral card outline, rendered with sharp.
- `public/sw.js`:
  - Every push shows a notification, with a generic one for a bad payload, and the handler never rejects.
  - On a click it focuses an open window and `postMessage`s `{ type: "yugioh-open", url }`, or else calls `openWindow`.
  - It has `// @ts-nocheck`, because tsc checks `public/*.js` with the DOM lib.
- `/sw.js`, `/manifest.webmanifest` and the 4 icons are in `PUBLIC_EXACT` (`src/lib/route-access.ts`), with tests in `route-access.test.ts` and `middleware.test.ts`.
- `src/app/yugioh/layout.tsx`:
  - It mounts `AppServiceWorker`, which registers `/sw.js` on launch, re-saves an existing subscription (iOS has no `pushsubscriptionchange`) and routes the worker's click messages with `router.push`.
  - It also sets `appleWebApp`, the apple icon and `themeColor`, light only: see the design-direction note.
- Settings has a "Notifications" `Card` (`push-settings.tsx`), first on the page:
  - **Switch:** a base-vega `Switch` (added; `cn` import fixed) in a one-field TanStack form (`pushAlertsSchema`). It subscribes straight from the tap.
  - **Test alert:** "Send a test alert" while it's on.
  - **iPhone Safari tab:** add-to-home-screen steps.
  - **Other states:** "can't show alerts" for other browsers without push, a blocked-permission message, and a missing-key message.
- `src/app/yugioh/_utils/push.ts` holds the browser helpers: `pushSupport`, `currentSubscription`, `subscribeThisDevice` and `subscriptionArgs`.
- **Copy deviation:** the switch reads "Deal alerts on this device" until ticket 14 adds auctions. It's noted in design-direction §5.5.

**Verified:**
- **Seam 1:** `convex/yugioh/pushes.test.ts`, 20 tests. They cover:
  - Great and Good deals sent; Fair and Poor not;
  - the Qualifying rule (graded, JP code, LP);
  - no Reference price, auctions, sales;
  - finished Cards, another Chosen Printing;
  - once per Listing;
  - an override inside and outside 24 h;
  - the most recently viewed Deck;
  - TCGplayer, with the first capture skipped;
  - an old eBay listing date;
  - quiet hours (held to 8am Denver, skipped if sold, sent in the day);
  - devices (none, off, upsert, 410 removal, https only);
  - the test push;
  - internal-only functions.
- **Lib:** `src/lib/yugioh/pushes.test.ts`, 8 tests: quiet hours across time zones and a DST morning, and the push copy.
- **Dev deployment:**
  - A test push to a fake `web.push.apple.com` endpoint came back 400 `BadWebPushToken`. That means Apple accepted the VAPID JWT.
  - In real Chrome (Playwright, persistent profile), turning alerts on, sending a test alert (FCM said sent), the worker showing the notification, and turning alerts off all worked.
  - Screens were checked at desktop light and dark, plus an iPhone Safari tab (the install steps).
- Headless Chromium and incognito contexts have no push service. Use a persistent Chrome profile to test it.
- **VAPID on dev:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`https://www.moooose.dev`) are set on the dev deployment (fantastic-tapir-210). `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is in `.env.local`.

**Open (left as is):**
- A push whose action dies after `claimDelivery` stays `sending` forever, because nothing sweeps it. There's also no retry on 429/5xx; it's recorded as `failed` with the reason.
- A fixed-price Listing that ends unsold overnight is still pushed at 8am. Captures don't record "ended unsold".
- `requireAuth` is still the repo's no-op, so the push mutations are public like every other /yugioh function.
- There's no cold-start backstop (a pending URL stored by the worker) if `openWindow` lands on the start URL on an old iOS. Check this on the phone.
- The "Deal pushes sent per week" figure can be read from `yugiohPushes`, but no UI shows it.

**Dev data:** two `test` rows in `yugiohPushes` on dev (one failed to the fake endpoint, one sent to Chrome). No subscriptions are left.


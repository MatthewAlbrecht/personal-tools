# 14: Auction-ending pushes

**What to build:** 15 minutes before a matched auction for a Card I still need ends, I get a push showing its last seen Per-copy price, how old that price is, the Reference price, and a link, at any hour.

**Blocked by:** 11 (Listings filters and what's new), 13 (Installable app and deal pushes)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Fires once per auction
- [x] Ignores quiet hours
- [x] Only for matched auctions on Cards still needed
- [x] convex-test covers trigger timing and selection (Seam 1)

**Left for you (a decision, then likely a ticket):** automated runs never learn when an auction ends, so in practice these pushes only fire for auctions I've seen on an "ending soonest" eBay page myself. See "Open question" below. Status stays until that's decided. Real delivery on the phone is still ticket 13's hand check.

## Notes from the build

**Open question: auction end times aren't captured by automated runs.**
- On eBay's Newly Listed sort, an auction shows only "N bids", with no time left. This is verified in `docs/yugioh/references/ebay-search-results.md` (line 88), and none of the Newly Listed fixtures has `s-card__time-left`. Only the ending-soonest sort (`_sop=1`) shows it.
- Automated runs (ticket 15) visit only Newly Listed and Sold pages. So `endsAt` stays null and no auction push is scheduled. The same gap affects ticket 11's Ending soon view and ticket 16's pre-auction visits.
- The fix is probably a third page per Search: auctions sorted ending soonest (`LH_Auction=1&_sop=1`), added to the visit plan. But the glossary defines a Search as "viewed as either Newly Listed or Sold", so I didn't add one. It needs your call, and probably a glossary and spec change.
- Once end times arrive, everything here works: each capture re-schedules from the end time it read.
- **Precision:** eBay shows "1d 2h" or "3d" for long auctions, so an early `endsAt` can be off by up to an hour, or by a day for "3d". It's corrected once a capture sees under a day left ("Nh Nm"). With 3-hourly runs, the last capture before the push is precise to the minute.

**Auction push rule** (`checkAuction` in `convex/model/yugioh/pushes.ts`). A running auction is pushed **once ever**, 15 minutes (`AUCTION_PUSH_LEAD_MS`) before `endsAt`, at any hour (`deliverAt = now`), when all of these hold:
- It's matched (`matchedPrintingId`).
- A Card that still needs Copies searches that Printing: the Chosen one, or any Candidate while the Card is undecided.
- It's **Qualifying** at that Card's own Lowest acceptable condition. **Decision:** the spec says "matched auction". I also require Qualifying, as deal pushes do, so a graded or Korean copy doesn't wake me at 3am.

Other cases:
- **Found with under 15 minutes left:** pushed at once, saying the time actually left ("Ending in 8 min").
- **No Reference price:** still pushed, saying "no ref yet".
- **Dedupe:** with `by_listingId_and_kind` (`kind: "auction"`).

**Triggers.** `queueDealCheck` is renamed `queuePushCheck(ctx, listingId)`. It picks the check by Listing type:
- a deal check now for fixed-price Listings;
- `ctx.scheduler.runAt(endsAt - 15 min, checkAuction)` for running auctions (a past time runs at once).

It still schedules nothing while no device has push on. It's called from:
- `saveTitleRead` and `setMatchOverride` (`matching.ts`);
- `ingestTcgplayerProduct`;
- **new:** `ingestEbayListings`, when a matched auction's `endsAt` changes.

**Jitter.** Each capture reads "time left", so `endsAt` moves a little every time, and each move schedules another check (nothing is cancelled).
- A check more than 1 minute (`AUCTION_CHECK_SLACK_MS`) before the current push time is dropped, because a later check exists for the new end time.
- Checks that land together are deduped by `pushFor`.
- About one stale check is left per matched auction per capture. That's cheap; storing and cancelling scheduled ids wasn't worth it.

**Text is built when the push is due, not when it's found.** `auctionPushText` in `src/lib/yugioh/pushes.ts` gives:
- title: "Ending in 15 min: Ash Blossom & Joyous Spring QCSR" (whole minutes, never rounded up);
- body: "Last seen $40.00 a copy (22m ago) · ref $54 · 4 bids".

The age is from `lastSeenAt` ("just now", "22m ago", "3h ago", "2d ago"). Variants: "no ref yet", "no bids yet", "1 bid", "No price seen yet". Ticket 16's refresh visit 20 minutes before the end will make the price about 5 minutes old.

**Delivery:**
- Auction pushes use `urgency: "high"`. Their TTL is the time left, at most 15 minutes. Deal and test pushes keep `normal`.
- **The link opens the eBay Listing directly** (design §3). `public/sw.js` accepts only `https://www.ebay.com/itm/<digits>` besides same-origin paths, and opens it with `clients.openWindow` even when the app is open. Anything else falls back to `/yugioh`.
- Opening a cross-origin URL from the installed iOS app is **unverified on a device**. Check it with ticket 13's phone check.
- Tests: `src/lib/yugioh/service-worker.test.ts` loads the real `sw.js` with stubbed globals.

**Ticket 13 review fixes:**
1. **Stuck "sending":**
   - `claimDelivery` now schedules `internal.yugioh.pushes.expireDelivery` 10 minutes later (`SEND_DEADLINE_MS`, the Node action limit). If the push is still `sending` then, it's marked `failed` ("The send didn't finish…"). It isn't retried, because some devices may already have it.
   - `deliver` also catches a throw per device (`sendSafely`), so one bad device doesn't lose the others' outcomes.
   - `sendWebPush` now passes `timeout: 30s` to web-push.
   - A late `recordDelivery` can still turn `failed` into `sent`. That's truthful, so I left it.
2. **Held deal that ended unsold:** `claimDelivery` now skips via `hasEnded`, which counts a Listing as ended when it is:
   - sold, or a sale;
   - past an end time eBay showed (fixed-price Listings can have one);
   - **TCGplayer:** left out of the latest product-page capture (`goneFromTcgplayerPage`, now exported from `deals.ts`);
   - **eBay:** dropped out of its Search. A later capture saw an older (by `listedAt`, else `firstSeenAt`) fixed-price Listing matched to the same Printing, but not this one. Newly Listed sorts newest first, so that page would have shown it.

   The eBay rule's **known false positive:** a capture overnight of page 2, or of my own filtered search that leaves the deal out, would skip a live deal. Automated runs only open page 1 of the app's Searches, where each Printing sits in exactly one Search.

**Tests:**
- `convex/yugioh/pushes.test.ts`: 32 tests (12 new):
  - auctions: timing in quiet hours, once with the latest price, a moved end time, selection, under 15 minutes left (TTL), and ended, sold or push off;
  - delivery: the dead send, and a throwing device;
  - held deals ending: end time, dropped from the Search and its control, TCGplayer.
- Helpers: `runFor` steps the clock in 10 s steps. **Gotcha:** `settle` (`finishAllScheduledFunctions(vi.runAllTimers)`) fires every timer before any function runs, so `Date.now()` inside them is the last timer's time. Use `runFor` when several checks are due close together. `tcgplayerProduct(t)` is shared.
- `src/lib/yugioh/pushes.test.ts`: `auctionPushText` (4 tests).

**UI:** the Settings switch now reads "Deal and auction alerts on this device", with "Great and Good deals, 8am-11pm. Auctions 15 minutes before they end, any time." (design §5.5, restored; the §5.5 note is updated). The test push says "Deals and auctions will show up here like this."

**Open (left as is):**
- Auctions matched before any device had push on aren't scheduled until a capture moves their end time.
- `ux-superpowers:ux-validate` and the design review weren't run: the only UI change is two strings, restored word for word from design §5.5.

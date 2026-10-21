# Yu-Gi-Oh tracker: left for you

Everything the agents couldn't do, collected from the tickets' notes (`issues/*.md`). Work top to bottom. No secret values are written here: each `<…>` is yours to fill in on your Mac.

## 1. Prod deploy

### Env vars

- [ ] **Convex prod, TypeSafe** (title reading, TCGplayer product lookup; tickets 03, 07):
      `npx convex env set --prod TYPESAFE_API_KEY <key>`
- [ ] **Generate a prod VAPID key pair** on your Mac (ticket 13), and keep the private key there:
      `node -e 'console.log(JSON.stringify(require("web-push").generateVAPIDKeys()))'`
- [ ] **Convex prod, VAPID** (both halves from that one pair):
  - [ ] `npx convex env set --prod VAPID_PUBLIC_KEY <publicKey>`
  - [ ] `npx convex env set --prod VAPID_PRIVATE_KEY <privateKey>`
  - [ ] `npx convex env set --prod VAPID_SUBJECT https://www.moooose.dev`
- [ ] **Vercel Production, VAPID public key** (the same `<publicKey>`):
      `vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production`
- [ ] **Vercel Production, extension secret** (the eBay, TCGplayer and automation routes; ticket 06). It's Next-only, not Convex:
      `vercel env add RYM_EXTENSION_INGEST_SECRET production`
      Use the same value in the extension's options and in the automation config (sections 2 and 3).
- [ ] Check that `CONVEX_SERVER_SECRET` (Next → Convex HTTP routes, from before this work) is still set, with the same value on Vercel Production and Convex prod.

### Deploy

- [ ] Deploy Convex: `npx convex deploy`.
- [ ] Deploy the Next app to Vercel Production (after the env vars, so `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is baked in).
- [ ] Check that `https://www.moooose.dev/sw.js` returns JavaScript, not the login page.

### Backfills and seeds, in this order

- [ ] Import fee table (ticket 08; safe to re-run, keeps edits):
      `npx convex run --prod yugioh/pricing:seedImportFeeRates '{}'`
- [ ] Exchange rates now, rather than waiting for the 06:00 UTC cron (ticket 08):
      `npx convex run --prod yugioh/pricing:refreshExchangeRates '{}'`
- [ ] Title reads for Listings captured before ticket 07 (only if prod has any). Repeat until it returns `{ queued: 0 }`:
      `npx convex run --prod yugioh/titleReading:queueUnreadTitles '{}'`
- [ ] Sale times (ticket 09). Repeat, passing back `cursor`, until `isDone` is true:
      `npx convex run --prod yugioh/deals:backfillSaleTimes '{"paginationOpts":{"numItems":200,"cursor":null}}'`
- [ ] TCGplayer product ids (ticket 12). Repeat, passing back `cursor`, until `isDone` is true:
      `npx convex run --prod yugioh/tcgplayer:backfillTcgplayerProductIds '{"paginationOpts":{"numItems":200,"cursor":null}}'`
- [ ] **Seed the Chaos Lightsworn Deck** (ticket 05). The payload is `/tmp/yugioh-seed/chaos-lightsworn.json` (60 Cards, 66 Candidates; dev already matches it). `/tmp` is cleared on reboot, so copy it somewhere safe first. Follow `docs/yugioh/seeding.md` step 5:
      `npx convex run --prod yugioh/seed:loadDeck "$(cat /tmp/yugioh-seed/chaos-lightsworn.json)"`
      Then check it with `getDeck --prod` and in the app. Note: two rarities are saved as "Secret Rare (pharaoh's Rare)" and "Ultra Rare (pharaoh's Rare)" (lower-case p), as on dev.

## 2. Extension reload and options

- [ ] In your everyday Chrome, reload the unpacked extension `extensions/rym-release-scraper` (now 0.7.3) and accept the new `https://www.ebay.com/*` and `https://www.tcgplayer.com/*` host permissions (tickets 06, 12).
- [ ] In its options, set the app origin and the same `RYM_EXTENSION_INGEST_SECRET` as on Vercel. Leave "Run automated captures in this profile" **unticked** here.
- [ ] Open a Search's Newly listed and Sold links: the dock should say "Captured N Listings", and they should appear on the Deck's Listings tab (ticket 06).
- [ ] Signed in to TCGplayer, open a Printing's product page from its Card drawer: the dock should say "Captured 10 Listings and N sales" and name the Printing, with more than 5 sales ("Load More Sales" clicked). Then check the Card drawer and the Listings tab filtered to TCGplayer (ticket 12).

## 3. Automation install

Full steps: `docs/yugioh/automation.md` → "One-time setup" (tickets 15-17).

- [ ] `scripts/yugioh-automation/open-profile.sh`; in that profile, Load unpacked `extensions/rym-release-scraper`, set the origin and the ingest secret, tick "Run automated captures in this profile", optionally sign in to TCGplayer, then ⌘Q.
- [ ] `scripts/yugioh-automation/install.sh` (run it again if an older plist is installed: it now asks every 10 minutes). Then set `YUGIOH_INGEST_SECRET=<secret>` and `YUGIOH_APP_ORIGIN` in `~/.config/yugioh-automation/config`.
- [ ] `scripts/yugioh-automation/run.sh` by hand: a run captures Listings end to end, and Settings → Automated runs shows it (ticket 15's hand check).
- [ ] `launchctl kickstart -p gui/$(id -u)/dev.moooose.yugioh-automation`, then `launchctl print gui/$(id -u)/dev.moooose.yugioh-automation` and `tail -f ~/Library/Logs/yugioh-automation/run.log`. Keep it allowed in System Settings → General → Login Items.
- [ ] Create the T3 Code task from the doc's "T3 Code scheduled task" section (disabled, run on demand), and verify it with "Run now".
- [ ] Hand check (ticket 16): with a matched, Qualifying auction ending within 3 hours, a run labelled "Before an auction ends" appears in Settings → Automated runs about 20 minutes before it ends, and the 15-minute push shows a price a few minutes old.

## 4. iPhone checks

- [ ] Safari → Share → Add to Home Screen → open from the home screen → /yugioh/settings → turn on "Deal and auction alerts on this device" → "Send a test alert" (ticket 13).
- [ ] The checks at the end of `docs/yugioh/references/ios-web-push.md`: a push with the app closed, backgrounded and foregrounded; tapping a deal push lands on the Listing drawer; the cold-start case on an older iOS (ticket 13).
- [ ] Tapping an auction push opens the eBay Listing from the installed app (cross-origin `openWindow`, unverified on a device; ticket 14).
- [ ] In Custom order, dragging a Card's handle never scrolls the page in Safari (ticket 04).

## 5. Fixtures to save

- [ ] **eBay Sold page** (ticket 06, the only unchecked criterion there): on a Search's Sold page, Save Page As → Webpage, HTML only, and hand it to an agent to replace the reconstructed `extensions/rym-release-scraper/tests/fixtures/ebay-sold.html`.
- [ ] **Signed-in eBay Newly Listed page with auctions** (ticket 14): save it as `.scratch/yugioh-tracker/ebay-raw/newly-listed-signed-in.html`, for an agent to trim into a fixture next to the reconstructed `ebay-time-left-layouts.html`.

## 6. Dev cleanup

On the dev deployment (fantastic-tapir-210), from the Convex dashboard (there's no delete-Deck function):

- [ ] Delete the three "Agent test Deck" Decks, with their Cards, Candidates and visits.
- [ ] Delete the "jd" Deck, if you don't want it.
- [ ] Optional: the agents' test Listings (707000000001-004, 707000000101-103), test pushes and test automation runs on dev. Printings like "Agent test Called by the Grave" and AGT1-EN999 stay unless removed by hand.

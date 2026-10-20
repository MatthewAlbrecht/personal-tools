# 13: Installable app and deal pushes

**What to build:** I can install the site to my phone's home screen and turn on push. I get a push for every new Great or Good Qualifying Listing on a Card I still need, held between 11pm and 8am.

**Blocked by:** 09 (eBay Reference price and Deal grades)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Web app manifest and service worker
- [ ] VAPID keys declared in src/env.js and Convex env
- [ ] Push subscription stored per device; can be turned off
- [ ] Quiet hours hold deal pushes and deliver them after 8am
- [ ] convex-test covers which deals trigger a push and quiet-hours behaviour (Seam 1)
- [ ] Real delivery checked by hand on my phone

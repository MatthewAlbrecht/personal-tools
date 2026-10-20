# 17: Adaptive timing

**What to build:** After about 4 weeks of listing times, the automated browser checks more often during the hours of the week when sellers usually post new Listings, and less often otherwise.

**Blocked by:** 15 (Automated browser runs)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] Hour-of-week distribution of first-seen / listed times
- [ ] Schedule switches from fixed 3 hours only once enough data exists
- [ ] Never checks less than every 6 hours
- [ ] convex-test covers the schedule derived from a fixed distribution (Seam 1)

# 15: Automated browser runs

**What to build:** A script on my Mac drives Chrome with a dedicated profile that has the extension loaded, asks the app which pages to visit, and opens every Search's Newly Listed and Sold pages. It runs every 3 hours from a macOS LaunchAgent and can also be triggered by a T3 Code scheduled task. TCGplayer product pages join the visit list once TCGplayer capture exists.

**Blocked by:** 02 (eBay Searches and links), 06 (eBay capture into Listings)

**Status:** ready-for-agent

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [ ] App exposes a visit plan to the script, authenticated with a secret
- [ ] Script uses its own Chrome profile with the extension installed
- [ ] LaunchAgent install and uninstall documented
- [ ] T3 Code scheduled task set up and verified
- [ ] Modest pacing between page loads
- [ ] Verified by hand: a run captures Listings end to end

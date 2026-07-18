---
title: AI album/artist research enrichment
domain: albums
kind: feature
size: 5
status: done
captured: 2026-07-15
---

## Notes

- Done — shipped on `feat/ai-album-research-enrichment` (enrich pipeline + details dossier + prompt-eval trials/promote). Spec/plan updated with Prompt eval section.
- In progress on `feat/ai-album-research-enrichment` — spec: `docs/superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md`, plan: `docs/superpowers/plans/2026-07-17-ai-album-research-enrichment.md`
- Tasks 10–12 (prompt eval: trial routes, variant agents, compare/promote UI) still remaining
- Cursor Automation not yet created — operator checklist in `.cursor/skills/enrich-for-later-album/SKILL.md`
- Run each album through an AI researcher to collect hard-to-scrape artist/album context (origin, how long they've been making music, Instagram links, band writeup, "listen if you like…")
- Also generate a short "Why you should listen to this album" pitch — a persuasive, specific reason to put it on, not just a plot summary
- Also generate a list of descriptors for the album artwork (colors, subjects, settings, style — e.g. green, flower, live show) so covers can be looked up by keyword from whatever you remember about them
- Also generate situations / contexts the album as a whole is good for (e.g. dinner party, late night, road trip, beach, mountain house, Airbnb breakfast) so albums can be browsed or filtered by vibe/occasion
- Preference for this to be a Cursor automation, since that workflow already does this kind of research well
- Prompt eval: A/B variants under `.cursor/agents/variants/`; trials table + hybrid compare/promote; auto-judge for factual/cover slices, human pick for writing (`whyListen`, occasions, writeups)

## Raw

Send each album through an ai researcher that will grab details about the album and artist that might be hard to scrape.  So like where they're from, maybe how long theyve been making music since, links to instagram, maybe a written description of the band, maybe a 'listen to this if you like...' kind of thing.  It'd be really cool if it could be a cursor automation because i feel like this does a really good job at that kind of shit.

Also create a list of descriptors for the album artwork so I can look up album art by keyword — like green or flower, or live show, or whatever I remember about a cover.

Also a list of situations the album as a whole might be good in — dinner party, late night, road trip, beach, mountain house, Airbnb breakfast, etc.

Also a "Why you should listen to this album" idea — a short pitch for why this one is worth putting on.

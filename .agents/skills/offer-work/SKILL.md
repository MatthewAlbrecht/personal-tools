---
name: offer-work
description: Offer coherent work tracks from docs/ideas so you can pick what to start — no planning or implementing.
disable-model-invocation: true
---

# Offer work

**Offer** — turn startable ideas into a short menu of tracks. Do not plan, spec, or implement until the user picks.

Companion to `harvest-idea` (capture), `offer-spec-work` (spec/plan vs start/build), and `offer-build-path` (domain crush path from planned backlog).

## Idea status

| Status | Meaning | In this skill? |
|--------|---------|----------------|
| `open` | Captured; no plan yet | Yes — optional quick-start tracks |
| `planned` | Spec + plan exist; ready to build | Yes — prefer these |
| `started` | Selected and underway — implementation in progress | No — exclude (already being built) |
| `done` | Shipped (alias: `completed`) | No — exclude |

Treat missing status as `open`. Prefer writing `done` over `completed` when updating files.

**Default pool:** `planned` first (ready to implement). Include `open` when the backlog of planned work is thin, or when the user asks for something small / unplanned. Never include `done` / `completed`, or `started` (already selected/building).

When presenting, note each member’s status if the menu mixes `open` and `planned`.

## Steps

### 1. Load startable ideas

Read `docs/ideas/*.md`. Keep `status: open` or `status: planned` (and missing → open). Skip `done` / `completed`. Skip non-idea files (e.g. `.gitkeep`).

Pull from each file: path, `title`, `domain`, `kind`, `size`, `status`, and a one-line gloss from `## Notes` if present.

Domains may exist only in ideas — that is fine.

**Done when:** every startable idea is listed with title, domain, kind, size, status, and path.

### 2. Note constraints

If the user already named a constraint (domain, size band, “something small”, “new feature”, “only planned”, …), filter or weight offers to match. Do not ask for time budget or preferences by default.

**Done when:** any stated constraints are applied, or none were stated and the default pool is in play.

### 3. Compose offers

Build **2–4 offers** (fewer if the backlog is tiny). An offer is a **track**: one idea, or a domain-coherent bundle that shares context.

Composition rules:

- Prefer bundling related same-domain ideas when they clearly reinforce each other
- Prefer `planned` tracks when offering implementation work
- Include at least one smaller track and one meatier track when both exist
- Do not stuff unrelated domains into one offer
- Rough total size = sum of member sizes (informational; not exact time)
- One-line **why** per offer — why this is a good start now, not how to build it

**Done when:** 2–4 offers exist, each with members, total size, and a why; every startable idea need not appear — omit weak fits rather than pad.

### 4. Present and stop

Show the offers as a short menu. For each:

- Label (e.g. Quick win / Domain bundle / Solo feature / Stretch)
- Domain
- Member titles with individual sizes (and status if mixed)
- Total size
- Why

End by asking which offer (or which subset) to start — then **stop**. No spec, plan, or implementation until they choose.

If the user picks an offer and you go ahead with implementation (not merely presenting the menu), set those ideas to `status: started` and note it briefly in `## Notes` as work begins.

After the user finishes shipping a track (later turn, not this skill), set those ideas to `status: done` and note the ship briefly in `## Notes`.

**Done when:** the menu is shown and no further work was started.

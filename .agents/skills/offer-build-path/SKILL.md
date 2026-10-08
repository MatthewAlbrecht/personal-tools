---
name: offer-build-path
description: >-
  Domain-first build path from planned ideas — overview by domain, then crush
  orders; stop before coding.
disable-model-invocation: true
---

# Offer build path

**Crush** — clear a domain’s planned work in a recommended order. Lead with a domain overview, then path offers whose **outcomes** name what ships. Do not implement until the user picks.

Companion to `offer-work` (light start menu — no plan dig), `offer-spec-work` (plan open ideas), `harvest-idea` (capture). Prefer this skill when the question is what to build *next* and in what order across a domain; prefer `offer-work` for a quick unanalyzed menu.

## Idea status

| Status | Meaning | In this skill? |
|--------|---------|----------------|
| `planned` | Spec + plan exist; ready to build | Yes — the pool |
| `open` | Captured; no plan yet | Downstream only — never a crush member |
| `started` | Selected and underway | No — exclude |
| `done` | Shipped (alias: `completed`) | No — exclude |

Treat missing status as `open`. Prefer writing `done` over `completed` when updating files.

**Default pool:** `planned` only. If empty, say so and point at `offer-spec-work` — do not invent a path from open ideas.

## Edges (agent-only)

Use edges to **order** work inside a crush and across domains. Do not show edge jargon, sizes, or idea file paths in the user-facing menu.

| Kind | Meaning |
|------|---------|
| **pairs** | Same context; ship back-to-back (shared surface, shared plan, or tight domain reinforcement) |
| **blocks** | A before B; B is harder or wrong if A is unfinished |
| **independent** | No order coupling |

Infer from evidence, not vibes — in order:

1. Idea `## Notes` — depends / after / blocked by / complements / shared Planned links
2. Linked plan — Goal, out-of-scope, “reuse X”, File Structure coupling
3. Linked spec — only when the plan is thin
4. Same `domain` alone is a **hint to check**, not an automatic pair

Ideas that already share one plan path are **one outcome step** in the crush — do not list them as separate “paired” menu rows.

**Done-shaped rule:** every planned item is on an edge or marked independent; no silent orphans.

## Outcomes

An **outcome** is a short headline for what the user gets when the work ships — verb + result (“Expand timeline syncs and add one-off playlist sources”), not meta (“Quick win”, “Domain bundle”, “Solo feature”, size, kind).

Shared-plan ideas → one outcome. Separate ideas in a crush → separate numbered outcomes in order.

## Steps

### 1. Load the planned backlog

Read `docs/ideas/*.md`. Keep `status: planned`. Skip `open`, `done`, `completed`, `started`, and non-idea files.

For each kept idea, pull (agent use): path, `title`, `domain`, Planned plan/spec links. Read each linked **plan** enough for Goal (1–2 lines) and coupling cues. Skim the **spec** only when the plan lacks those signals.

Skim `open` ideas in domains that appear in the planned pool — titles only as **downstream** (not crush members).

**Done when:** every planned idea has title, domain, plan (or “plan link missing”), a draft outcome line, and same-domain open titles are listed as downstream.

### 2. Note constraints

If the user already named a constraint (domain, “something small”, “only albums”, …), filter or weight crushes to match. Do not ask for time budget or preferences by default.

**Done when:** any stated constraints are applied, or none were stated and the full planned pool is in play.

### 3. Map domains and edges

Group planned ideas by `domain`. Within each domain, order with edges (`blocks` wins over `pairs`). Flag missing plan links (low order confidence).

**Done when:** every planned item sits in a domain group, has an outcome line, and is ordered or marked independent — each edge cites a Note/plan/spec cue (one short phrase, agent-only).

### 4. Compose crushes

Build **2–4 domain crushes** (fewer if the backlog is tiny). A **crush** is one domain’s planned work in ship order — prefer clearing a whole domain when it has multiple planned items.

Composition rules:

- Lead with a **recommended crush** (or a short sequence of domain crushes when a `blocks` edge crosses domains)
- Prefer full-domain clearance over cherry-picking one idea from a busy domain
- Never put a blocked item before its blocker
- Omit weak/lonely domains rather than pad — every planned item need not appear
- Downstream open ideas: one line under that domain’s crush, not members

**Done when:** 2–4 crushes exist; the recommended crush (or cross-domain sequence) reflects every `blocks` edge that affects the menu.

### 5. Present and stop

Show, in this order:

1. **Domains** — every domain in the planned pool (or the constrained subset). Under each: semicolon-separated **outcomes** for its planned items (no paths, no sizes, no kind labels). Optional: one line of same-domain open downstream titles.
2. **Crush** — recommended domain first. Headline = domain name or a single outcome phrase for that domain’s thrust. Then a numbered order of **outcomes** (what ships at each step). One short clause only when order needs a reason (blocker / shared surface) — not edge vocabulary.
3. Other crush options the same way (outcome headlines + ordered outcomes), if more than one domain is worth offering.

Do **not** show: idea file paths, spec/plan links, size numbers, kind, or labels like Quick win / Bundle / Solo / Stretch / Unblocker.

End by asking which domain (or which step in a crush) to start — then **stop**. No implementation until they choose.

If the user picks and you go ahead with implementation, set those ideas to `status: started` and note it briefly in `## Notes`.

After shipping (later turn), set those ideas to `status: done` and note the ship in `## Notes`.

**Done when:** domain overview + crush menu are shown and no further work was started.

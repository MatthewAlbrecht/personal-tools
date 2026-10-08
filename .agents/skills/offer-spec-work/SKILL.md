---
name: offer-spec-work
description: >-
  Offer open docs/ideas as tracks to take through design specs and
  implementation plans (not code). Use when the user wants to pick ideas to
  spec/plan, asks for /offer-spec-work, or wants a planning backlog menu from
  harvested ideas.
disable-model-invocation: true
---

# Offer spec work

**Offer for planning** — turn open ideas into a **detailed** menu of tracks meant for **design specs + implementation plans**. Do not brainstorm, write the spec, write the plan, or implement until the user picks.

Companion to `offer-work` (start/build vs spec/plan), `offer-build-path` (ordered build from planned work), and `harvest-idea` (capture).

Downstream after a pick (next turn, not during this skill): `brainstorming` → spec in `docs/superpowers/specs/` → `writing-plans` → plan in `docs/superpowers/plans/`. Stop at the plan unless the user explicitly asks to implement.

## Idea status

| Status | Meaning | In this skill? |
|--------|---------|----------------|
| `open` | Captured; needs / ready for planning | Yes — only these |
| `planned` | Spec + plan already exist | No — exclude (don’t re-offer) |
| `started` | Selected and underway — implementation in progress | No — exclude (already building) |
| `done` | Shipped (alias: `completed`) | No — exclude |

Treat missing status as `open`. Prefer writing `done` over `completed` when updating files.

**After a successful plan (downstream, not during the menu):** set each member idea to `status: planned` and add a `## Notes` bullet linking the spec and plan paths. Do not set `done` until the work ships.

## Steps

### 1. Load open ideas

Read `docs/ideas/*.md`. Keep only `status: open` (treat missing status as open). Skip `planned`, `done`, and `completed`. Skip non-idea files (e.g. `.gitkeep`).

Pull from each file: path, `title`, `domain`, `kind`, `size`, `status`, `## Notes`, and enough of `## Raw` to explain intent if Notes are thin.

Domains may exist only in ideas — that is fine.

**Done when:** every open idea is listed internally with title, domain, kind, size, path, and enough substance to describe it.

### 2. Note constraints

If the user already named a constraint (domain, size band, “something small”, “new feature”, …), filter or weight offers to match. Do not ask for time budget or preferences by default.

**Done when:** any stated constraints are applied, or none were stated and the full open set is in play.

### 3. Compose offers

Build **5–8 offers** when the open backlog supports it (fewer only if fewer open ideas exist). Prefer covering most open ideas rather than a tight curated shortlist.

An offer is a **track**: one idea, or a domain-coherent bundle that shares context.

Composition rules:

- Prefer bundling related same-domain ideas when they clearly reinforce each other
- Include a mix of smaller and meatier tracks when both exist
- Do not stuff unrelated domains into one offer
- Rough total size = sum of member sizes (informational; not exact time)
- One-line **why** per offer — why this is a good planning target now, not how to build it
- Omit only clear duplicates or ideas that cannot be described yet; do not pad

**Done when:** 5–8 offers exist (or one per open idea if the backlog is smaller), each with members, total size, what, and why.

### 4. Present and stop

Show the offers as a numbered menu. Titles alone are not enough — each offer needs enough detail to choose without opening the idea file.

For each offer:

- Label (e.g. Quick win / Domain bundle / Solo feature / Stretch)
- Domain
- Member titles with individual sizes (and paths)
- **What** — 2–4 sentences or short bullets: the actual problem/outcome from Notes/Raw (surfaces, user-visible behavior, constraints called out in the idea). Do not invent scope beyond the idea file.
- Total size
- Why (one line — good to spec/plan now)

End by asking which offer (or which subset) to take through **spec + implementation plan** — then **stop**. No brainstorming, spec, plan, or implementation until they choose.

**Done when:** the detailed menu is shown and no further work was started.

### 5. Status update after planning (later turn)

When the implementation plan is written and the user is satisfied, update each included idea file:

- Set `status: planned`
- Add a Notes bullet: `Planned — spec: \`…\`, plan: \`…\``

Do not mark `done` until implementation ships (then prefer `done`; accept `completed` as equivalent when reading).

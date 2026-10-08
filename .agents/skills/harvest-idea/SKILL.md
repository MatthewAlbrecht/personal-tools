---
name: harvest-idea
description: Harvest rough feature/enhancement/fix ideas into docs/ideas without planning or implementing them.
disable-model-invocation: true
---

# Harvest idea

**Harvest** — take a rough dump, extract durable idea files, stop. Do not plan, design, or implement.

## Idea status

Every idea file **must** include a `status` frontmatter field. Allowed values:

| Status | Meaning |
|--------|---------|
| `open` | Captured; available to offer for planning or casual start |
| `planned` | Spec + implementation plan exist; ready to build, not for re-planning |
| `started` | Selected and underway — implementation in progress |
| `done` | Shipped / finished (alias: `completed` — prefer writing `done`) |

**On harvest:** always set `status: open`. Do not invent `planned`, `started`, or `done` here — those are set later when a plan is written, work begins, or the work ships.

Missing `status` on old files: treat as `open` when reading elsewhere; when you touch a file, add `status: open` if absent.

## Steps

### 1. Split the dump

Break the user's message into distinct ideas (separate intents, surfaces, or outcomes). One dump may yield many harvests.

One vague paragraph that is clearly one intent stays one idea.

**Done when:** every distinct idea in the dump is listed, and nothing from the dump is left unassigned.

### 2. Resolve home (ask rarely)

Domains are not limited to shipped code. Valid sources, in order:

1. Existing `domain:` values in `docs/ideas/` (skim frontmatter — idea-only domains like `birthdays` are real)
2. App routes/features (`music-funnel`, `albums`, `concerts`, …)
3. A new kebab-case domain when the dump clearly names a new place

Reuse an existing domain string when it matches. Do not reject or rename a domain because it has no route yet.

Ask **one** short question only if you cannot tell which domain it belongs to. Never ask to flesh out UX, scope, or approach.

**Done when:** every idea has a `domain`, or one blocking question is asked and the run waits.

### 3. Classify and size

For each idea, set:

- `kind`: `feature` (new capability), `enhancement` (improve existing), or `fix` (change/correct existing behavior)
- `size`: Fibonacci `1 | 2 | 3 | 5 | 8` — stakes are low; **bias low** (when between rungs, pick the smaller):
  - **1** — tiny UI/behavior tweak in an existing surface
  - **2** — small localized change (one component or flow, no new systems)
  - **3** — meaningful change in one area (new capability inside an existing feature)
  - **5** — cross-cutting or several moving parts across a feature
  - **8** — big new surface (likely new route, multiple views/systems)
- `status`: always `open` for new harvests

Write a short `title` and a few clarifying `## Notes` bullets. Preserve the idea's slice of the dump under `## Raw` verbatim.

**Done when:** every idea has kind, size, status, title, notes, and raw text.

### 4. Write files

Create `docs/ideas/` if missing. Write one file per idea:

`docs/ideas/YYYY-MM-DD-kebab-slug.md`

Use today's date. Slug from the title. If a filename collides, append `-2`, `-3`, …

Frontmatter + body:

```markdown
---
title: Short descriptive title
domain: music-funnel
kind: enhancement
size: 3
status: open
captured: YYYY-MM-DD
---

## Notes

- Clarifying bullet(s) — what it is, not how to build it

## Raw

verbatim slice from the user's dump for this idea
```

`status` is required. New files always use `open`. Reuse existing `domain:` values in `docs/ideas/` when they match.

**Done when:** every idea from step 1 has a file on disk matching this shape, including `status: open`.

### 5. Confirm and stop

Reply with a short list: path, title, kind, size, status for each file written. Then **stop** — no implementation, no plan, no follow-up design unless the user asks.

**Done when:** the confirmation list matches the files written and no further work was started.

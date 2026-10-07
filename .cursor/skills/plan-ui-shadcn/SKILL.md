---
name: plan-ui-shadcn
description: >-
  Reminds agents to load and follow the shadcn skill when implementing plans
  that touch UI. Use when kicking off plan implementation, executing-plans,
  subagent-driven-development, implementing a plan Task, writing pages or
  components under src/, or building admin/app surfaces.
---

# Plan UI → shadcn

When this work includes **any UI** (pages, forms, tables, filters, nav, empty/loading states):

1. **Load `/shadcn`** — Read and follow the shadcn skill before writing UI code (CLI add/docs patterns, composition recipes).
2. **Prefer `~/components/ui/*`** when a matching primitive already exists or can be added with `pnpm dlx shadcn@latest add …`.
3. **Base HTML is fine** for layout (`div`, `section`, `main`, headings, links) and when no shadcn primitive fits. Do not invent wrappers just to avoid a native tag.
4. If a needed primitive is missing, add it via the CLI rather than hand-rolling a one-off lookalike.

This skill does not replace `/shadcn` — it only ensures you open it when plan implementation starts building UI.

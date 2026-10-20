---
name: implementor-advisor
description: Implement tickets test-first, loading the advisor skill each part of the work and each mid-ticket situation calls for. Use when asked to implement or pick up a ticket, or a spec's tickets.
---

# Implementor advisor

Implement the tickets the user names, in this checkout (the current branch and worktree), test-first, with each part's **advisors** loaded before the code they govern.

An **advisor** is a skill loaded before writing, or judging, the part of the work it governs. Two tables pick them: one by what a ticket touches, read up front; one by what happens mid-ticket, read the moment its row fires. A ticket that hits no row runs without one.

## Advisors by what the ticket touches

| The ticket touches | Advisor |
|---|---|
| Pure logic in `convex/model/` or `src/lib/` | `tdd` at the seams the spec agreed; `codebase-design` when choosing a module's interface or where a seam goes |
| Convex functions, schema or indexes | `convex-expert`, after reading `convex/_generated/ai/guidelines.md`; `convex-docs` before any Convex API written from memory |
| Convex tests | `convex-test`, following the existing convex-test setup (`// @vitest-environment edge-runtime`) |
| Crons or scheduled functions | `convex-crons` |
| Public queries, mutations or actions | `convex-authz`, checked against `requireAuth` / `validateSessionToken` in `convex/auth.ts` and `convex/public-surface-lockdown.test.ts` |
| A schema change or backfill over production data | `convex-migrate` for the widen–backfill–narrow pattern. It brings `@convex-dev/migrations`, a new dependency: ask the user first, or backfill with bounded internal mutations |
| AI judgments: reading listing titles, matching, extraction | `typesafe-ai` |
| Screens, layout, components | `frontend-design`; `shadcn` for every component (Base UI, per `AGENTS.md`), built custom only where none fits |
| Motion, drawers, transitions, delight | `frontend-design`, plus the Family Values rule in `AGENTS.md`; `animate` for easing, timing and interruptibility, and `animation-accessibility` for reduced motion |
| Words on screen: labels, empty states, errors, toasts | `copywriting` |
| `AGENTS.md`, `CLAUDE.md` or a skill | `writing-for-agents` |
| `GLOSSARY.md` or an ADR | `domain-modeling` |

## Advisors by situation

| When | Advisor |
|---|---|
| A test goes red for a reason that isn't obvious, or the app misbehaves where tests pass | `diagnosing-bugs`; a bug becomes a red test before any fix |
| A fact the repo can't show: a marketplace page shape, a Chrome extension or Web Push behaviour | `research` (Convex facts: `convex-docs`; Next.js: `vercel:nextjs`) |
| The ticket disagrees with the spec, `GLOSSARY.md` or an ADR, or a rule needs to change | Stop and ask the user; record their answer with `domain-modeling` |
| Any command against the production Convex deployment (data, run, deploy, env) | `convex-deploy-guard`, plus the user's explicit go-ahead for that specific action |
| The change needs seeing in the running app | `run` |
| A ticket's code under `convex/` is ready for review | `convex-reviewer`, alongside `code-review` |

## Steps

### 1. Fetch the tickets

Read each named ticket from its local file (e.g. `.scratch/<feature>/issues/NN-*.md`) and state its title. Check its **Blocked by** tickets are done. Order the work blockers first, then by number. Ask when a reference is ambiguous.

**Done when:** every ticket's title is stated, and each is either unblocked and queued or reported as blocked and set aside.

### 2. Map advisors

For each ticket, list its advisors from the first table, by the files and behaviour its criteria name.

**Done when:** every queued ticket has its advisor list (empty is allowed), and every ticket with UI includes `shadcn`.

### 3. Build

Load the ticket's advisors, then build test-first with `tdd` at the spec's seams. Load a situational advisor as soon as its row fires. Run `pnpm typecheck` and the single test file you're working in (`pnpm exec vitest run <file>`) after each change.

With several tickets, give each a fresh subagent, run one after another, since they share the schema and the working tree. Brief each with its ticket, its advisor list and the situation table above.

**Done when:** every acceptance criterion Claude can complete is checked off and the ticket's tests and typecheck pass. Criteria that need the user (a production run, a check in the real app, a review of real data) stay unchecked and are listed for them.

### 4. Review

Run `code-review` over the ticket's changes, plus `convex-reviewer` when `convex/` changed. Fix each finding.

**Done when:** every finding is fixed, or reported to the user with the reason it stays.

### 5. Close out

Update the ticket file: tick its criteria, set **Status: done** when nothing is left (otherwise keep the status and say what's left), and add "Notes from the build" with anything a later ticket needs. Commit the ticket's changes to the current branch, staging only files the ticket touched.

**Done when:** the ticket is committed and its file matches what was built. Steps 3–5 repeat for the next ticket.

### 6. Finish

Run the full suite (`pnpm exec vitest run`), `pnpm typecheck` and Biome on the touched files (`pnpm exec biome check <files>`). Report per ticket: done, what's left for the user, and any finding left open. Push and deploy when the user says to.

**Done when:** all three are green and the report is delivered.

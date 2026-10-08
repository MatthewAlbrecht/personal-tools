---
name: executor-advisor
description: Execute a written implementation plan in place (current branch and worktree) through subagent-driven development, briefing each task with its advisor skills. Use when asked to execute, build or implement a plan.
---

# Executor advisor

Execute the plan **in place**, through subagents, with each task's **advisors** briefed in.

## In place

The work happens in this checkout: the current branch and the current worktree. This is a hard guardrail: the plan never gets a new branch or worktree, and creating one is never offered. `using-git-worktrees` stays unloaded.

## Advisors

An **advisor** is a skill the implementer loads before writing the part of a task it governs, and the reviewer loads before judging it. Match by what the task touches; one task can need several.

| The task touches | Advisor |
|---|---|
| UX decisions: flows, states, what the user sees when, how they recover | the `ux-superpowers` skills (`user-journey` for flows and friction, `ux-validate` against a discovery doc, `jobs-to-be-done` for what the user is trying to get done) |
| UI design: layout, hierarchy, visual detail, interaction | `frontend-design` |
| Any UI built from components | `shadcn`: use the shadcn component whenever one exists; build custom only where none fits |
| UI copy: labels, buttons, empty states, errors, toasts | `copywriting` |
| Database or backend: schema, queries, mutations, migrations | `convex-expert` |

Use the advisors installed in this environment; a task that touches none of these rows runs without one.

## Steps

### 1. Announce

State the current branch and that execution stays in place.

**Done when:** stated before the first task starts.

### 2. Load subagent-driven development

Load and follow `superpowers:subagent-driven-development` for the plan: a fresh implementer per task, a review after each, a final whole-branch review. It is the execution path whenever subagents are available.

**Done when:** the skill is loaded and its process drives execution.

### 3. Map advisors

For every task, list the advisors its files and deliverable call for, from the table above.

**Done when:** every task has its advisor list (empty is allowed), and every task with UI includes `shadcn`.

### 4. Execute

Run the loop continuously: implementer, review, next task. Every implementer and reviewer brief names that task's advisors and says to load them before writing or judging the code they govern; reviewers check the work against those advisors as well as the plan. Stop only for a blocker, a genuine ambiguity, or the end of the plan.

**Done when:** every task is implemented and reviewed, or execution stopped on a real blocker that is reported to the user.

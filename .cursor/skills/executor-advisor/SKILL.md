---
name: executor-advisor
description: Stay on the current branch and worktree; run plan execution via Subagent-driven development.
disable-model-invocation: true
---

# Executor advisor

**Stay put. Drive with subagents.**

## Hard rules

1. **DO THIS WORK IN THIS BRANCH AND THIS WORKTREE. DO NOT CREATE A NEW BRANCH OR NEW WORKTREE.**
2. Do **not** ask whether to create a worktree or branch. Stay where the session already is.
3. Execute with **Subagent-driven development** — load and follow `superpowers:subagent-driven-development` (fresh implementer per task, task review after each, final branch review). Do **not** use `using-git-worktrees` for isolation, and do **not** default to solo `executing-plans` when subagents are available.

## Steps

### 1. Announce stay-put

State the current branch and that work continues **in this checkout** (no new branch, no new worktree).

**Done when:** that constraint is stated before any plan task starts.

### 2. Load Subagent-driven development

Read and follow `superpowers:subagent-driven-development` for the plan in scope. Also load sibling advisors the plan needs (e.g. `plan-ui-shadcn` when UI is involved).

**Done when:** the SDD skill is loaded and its process is the execution path.

### 3. Execute the plan

Run SDD continuously: implementer → review → next task. Stop only for BLOCKED, genuine ambiguity, or all tasks complete.

**Done when:** the plan’s tasks are complete under SDD, or execution stopped for a real blocker.

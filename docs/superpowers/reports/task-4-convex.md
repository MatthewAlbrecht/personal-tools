# Task 4: Convex CRUD + cron helpers

## Status

Implemented the birthday Convex module and generated its typed API entry.

## Changes

- Added authenticated `list`, `create`, `update`, and `remove` functions.
- Added `listForReminders`, `filterUndelivered`, and idempotent `recordDeliveries` helpers.
- Added explicit argument and return validators to every public function.
- Duplicated the small birthday date assertion in Convex, including February 29 support, without importing from `src/`.
- Updated `convex/_generated/api.d.ts` with the `birthdays` module.

## Verification

- `npx convex codegen` — passed; Convex's TypeScript check completed.
- `pnpm exec biome check convex/birthdays.ts` — passed, one file checked with no fixes.
- `git diff --check -- convex/birthdays.ts` — passed.
- `pnpm typecheck` — failed on existing Smart Playlist filter type mismatches; no errors referenced `convex/birthdays.ts`, generated birthday API types, or the birthday schema.

## Self-review

The implementation matches the brief's API names, ownership checks, validators, indexes, and duplicate-delivery behavior. No new authentication pattern was introduced; all functions use the repository's existing `requireAuth`.

## Concerns

The repository-wide typecheck remains red because of unrelated Smart Playlist errors. The existing `requireAuth` helper is intentionally a no-op, so this task preserves the repository's current trust model for string `userId` arguments.

# Agent Guidelines

Personal tools app: one Next.js + Convex app hosting a set of personal tools (see [Features](#features)).

## Stack

Use these. Ask before adding any dependency not listed here.

Dependencies installed by shadcn components (recharts, react-day-picker, embla-carousel-react, vaul, cmdk, input-otp, etc.) are allowed. The shadcn `form` component (react-hook-form) is not used — use TanStack Form with `Field`.

| Concern | Use | Not |
|---------|-----|-----|
| Framework | Next.js App Router, TypeScript strict | Pages Router |
| Package manager | pnpm | npm, yarn |
| Styling | Tailwind CSS v4 | CSS modules, styled-components |
| UI components | shadcn/ui on **Base UI** | Radix, hand-rolled primitives |
| Icons | lucide-react | Hugeicons, inline SVG |
| Forms | TanStack Form + Zod | react-hook-form, `useState`-driven forms |
| Toasts | sonner (via shadcn) | other toast libs, `alert()` |
| Theming | next-themes (light + dark) | hand-rolled theme toggles |
| Backend / data | Convex | tRPC, API routes for data, ORMs, other DBs |
| Convex utilities | convex-helpers | hand-rolled wrappers it already provides |
| Dates | date-fns | moment, dayjs, manual date math |
| Env | `@t3-oss/env-nextjs` + Zod (`src/env.js`) | `process.env` |
| Email | Resend | |
| AI | Vercel AI SDK (`ai`) | |
| Tests | Vitest | Jest |
| Lint / format | Biome | ESLint, Prettier |

tRPC (`src/server/api/`) and the data-shaped API routes are legacy — don't extend them. API routes are for external integrations only (Spotify OAuth, scraping, webhooks).

## Commands

- `pnpm dev` — Next.js on port 1333 (Turbo); does not start Convex
- `npx convex dev` — Convex alone; `pnpm dev:all` — both
- `pnpm typecheck` — TypeScript
- `pnpm check` / `pnpm check:write` — Biome
- `pnpm exec vitest run` — Vitest (Convex tests use `convex-test` with `// @vitest-environment edge-runtime`)
- `pnpm test:launch-browser` — Playwright
- `pnpm infra:*` — Pulumi; one-off data scripts live in `scripts/` (see `package.json`)

## Rules

### UI (shadcn on Base UI)

- Add primitives with `pnpm dlx shadcn@latest add …` — don't hand-roll a `table`, `select`, `dialog`, etc.
- Never use raw `<table>`, `<select>`, `<button>`, or ad-hoc bordered cards when a shadcn component exists. Plain layout tags (`div`, `section`, `main`, headings, links) are fine.
- Don't edit `src/components/ui/` by hand beyond what the shadcn CLI generates.
- **Drawer over Dialog.** Use the shadcn `Drawer` for any substantial form or informational view (creating or editing a record, details, multi-field settings). Keep `Dialog` / `AlertDialog` for quick confirmations, optionally with a minimal choice — a checkbox or a pick between a few options.
- Use `cn()` from `~/lib/utils` for conditional classes; Biome enforces sorted classes in `cn`/`clsx`/`cva`.
- Images use Next.js `Image` from `next/image`.

### React effects

**`useEffect` is a last resort.** Use it only to sync with something outside React: a browser API, a subscription, a timer, focus or scroll, a third-party widget. If nothing outside React is involved, you don't need an effect.

- Derive values during render instead of copying them into state with an effect.
- Do work caused by a user action in that action's event handler, not in an effect that watches for the state change.
- Reset a component's state when an input changes by giving it a `key`, not with an effect.
- Data comes from Convex hooks (`useQuery`, `usePaginatedQuery`); never fetch in an effect.
- When an effect is genuinely needed, add a one-line comment naming the outside system it syncs with.

See React's "You Might Not Need an Effect".

### Forms

**Every form uses TanStack Form with a Zod schema — including single-input forms** (search boxes that submit, inline renames, settings toggles that save).

- Define the Zod schema first; use it as the form's validator.
- Render fields with shadcn `Field` components and show field errors from the form state.
- Don't manage input values with `useState` and validate by hand.
- Reuse the same Zod schema (or a shared one) for the Convex mutation's input where practical.

### Dark mode

- `next-themes` `ThemeProvider` with `attribute="class"` in the root layout; every screen must look right in both themes.
- Use shadcn semantic tokens (`bg-background`, `text-muted-foreground`, `border`, …). Don't hardcode colors like `bg-white` or `text-gray-900`. Exception: the `/bookcase` hex palette is deliberate (book spine colors).

### Toasts

- Mount the shadcn `<Toaster />` once in the root layout; call `toast` from `sonner` for user-facing success/errors.

### Env

- All Next app env vars are declared and validated in `src/env.js` with `@t3-oss/env-nextjs`. Import `env` from `~/env.js` — never read `process.env` directly in `src/` (`src/env.js` itself maps `process.env` in `runtimeEnv` — that is the only exception in `src/`).
- Code under `convex/` runs on Convex and reads deployment env (set with `npx convex env set`) via `process.env`. That is the only other place `process.env` is allowed.

### Auth

- Single-user session auth: `src/middleware.ts` checks the session cookie; `~/lib/auth-context.tsx` and `useAuthToken()` expose it on the client.
- Pass the access token to API routes / Convex via the `X-Access-Token` header; validate with `validateSessionToken` in `convex/auth.ts`.
- Don't add another auth system without asking.

### Convex

- Always use argument validators.
- Thin public functions; reusable business logic lives in `convex/model/`.
- Use auth-wrapped queries/mutations (built with `convex-helpers` custom functions) for user-scoped data.
- Actions are only for external APIs (Spotify, Resend, scraping, AI); they call queries/mutations for data. Never call actions for plain reads/writes.
- Use indexes (`.withIndex`), not `.filter`.
- Timestamps are Unix ms (`number`); format with date-fns on display.
- Every registered function has `args` **and** `returns` validators. Return `null`, never `undefined`; nullable fields are `v.union(v.string(), v.null())`.
- Reads are always bounded (`.take(n)` or pagination) — never an unbounded `.collect()` on a table that can grow.
- Calendar dates (due dates, birthdays) are `YYYY-MM-DD` strings, not Unix ms.
- On the client use `useQuery()`, `useMutation()`, `useAction()` from `convex/react`.

When present, read `convex/_generated/ai/guidelines.md` before Convex work.

### Tests

- Pure logic goes in `src/lib/` with a colocated `*.test.ts` (Vitest).
- Code in `src/lib/` that Convex imports uses relative imports only — no `~/` alias, React, Next, or browser APIs.
- Many existing tests use `node:test` (`node --test path/to/file.test.ts`); new tests use Vitest.
- Bugs: write a failing test that reproduces it before fixing.

## Code style

- Classic `function` declarations for named functions; arrows only for inline callbacks.
- `type` aliases, not `interface` (unless declaration merging is needed).
- Inline component prop types; extract only when reused.
- Main exported component first; helpers and `ComponentNameSkeleton` after, in the same file.
- Kebab-case file names. Prefer `const`. No `any`. Explicit return types on exported functions.
- `~/*` imports for `src/`; third-party imports first, then local.
- Tab indentation (Biome).

Also follow the behavioral guidelines in `.cursor/rules/karpathy-guidelines.mdc`.

## Layout

- `convex/` — schema, queries, mutations, actions, crons
- `src/app/<feature>/` — feature pages with colocated `_components/` and `_utils/` (types in `_utils/types.ts`)
- `src/app/api/` — API routes for external integrations
- `src/components/ui/` — shadcn primitives
- `src/lib/` — shared logic; `src/lib/hooks/` — hooks (`use-` prefix)
- `infra/` — Pulumi; `scripts/` — one-off data scripts; `docs/ideas/` — idea backlog

## Features

- `/albums` — Spotify album tracking and rating
- `/for-later-albums`, `/music-funnel`, `/album-enrichment` — album discovery backlog and enrichment
- `/spotify-playlister`, `/smart-playlists`, `/playlist-lyrics` — Spotify playlist tools
- `/robs-rankings` — album ranking game
- `/lyrics` — Genius lyrics scraper
- `/articles` — article reader/saver
- `/folio-society`, `/books`, `/bookcase` — book release tracking and library
- `/concerts`, `/birthdays`, `/rooleases` — other personal trackers

## Idea workflow

| Skill | Purpose |
|-------|---------|
| `harvest-idea` | Dump → `docs/ideas/*.md` (`status: open`) |
| `offer-spec-work` | Menu of open ideas → spec + plan |
| `offer-work` | Menu of startable (prefer `planned`) ideas |
| `offer-build-path` | Ordered build path from planned work in a domain |
| `executor-advisor` | Execute a plan in place via subagents |
| `plan-ui-shadcn` | Load the shadcn skill whenever plan work touches UI |

Statuses: `open` → `planned` → `started` → `done`. Don't invent scope — use these skills.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

<!-- convex-ai-end -->

Do not run `convex ai-files install` here: Convex skills are installed globally, and a project-level install re-adds duplicate skills and a duplicate block in `CLAUDE.md`.

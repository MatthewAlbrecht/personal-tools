# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Lint/Test Commands

- `pnpm dev` - Start dev server on port 1333 with Turbo
- `pnpm build` - Production build
- `pnpm typecheck` - TypeScript type checking (`tsc --noEmit`)
- `pnpm check` - Run Biome linter (check only)
- `pnpm check:write` - Run Biome linter with auto-fix

No test framework is configured.

## Architecture

This is a T3 Stack personal tools app using **Next.js 15** (App Router) with **Convex** as the primary backend.

### Tech Stack
- **Frontend**: Next.js 15, React 19, Tailwind CSS v4
- **Backend**: Convex (primary), tRPC (minimal usage)
- **Linting**: Biome (formatting + linting)
- **Package Manager**: pnpm

### Data Flow
1. **Convex** handles database, real-time subscriptions, and backend logic (`convex/` directory)
2. **Next.js API routes** (`src/app/api/`) handle external integrations (Spotify OAuth, web scraping)
3. **tRPC** exists but is minimally used (placeholder router in `src/server/api/root.ts`)

### Key Directories
- `convex/` - Convex schema, queries, mutations, and actions
- `src/app/[feature]/` - Feature pages with colocated `_components/` and `_utils/`
- `src/app/api/` - Next.js API routes for external services
- `src/components/ui/` - Reusable shadcn/ui components
- `src/lib/hooks/` - Custom hooks (prefixed with `use-`)

### Main Features (by route)
- `/albums` - Spotify album tracking and rating
- `/spotify-playlister` - AI-powered playlist categorization
- `/folio-society` - Book release tracking
- `/lyrics` - Genius lyrics scraper
- `/articles` - Article reader/saver
- `/robs-rankings` - Album ranking game

## Code Style

### Functions
- Classic function declarations for named functions: `function myFunction() {}`
- Arrow functions only for callbacks and inline anonymous functions

### Types
- Use `type` aliases, not `interface`
- Inline component props: `function MyComponent({ prop }: { prop: string })`

### Components
- Main component first, helpers/skeletons AFTER
- Skeleton components named `ComponentNameSkeleton`
- Use `'use client'` directive for client components

### Imports
- `~/*` for src imports: `import { env } from '~/env.js'`
- Environment variables via `~/env.js`, never `process.env` directly

### Files
- Kebab-case filenames: `album-card.tsx`
- Tab indentation (enforced by Biome)

## Convex Patterns

```typescript
// Queries
export const myQuery = query({
  args: { id: v.id("tableName") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// With index
const items = await ctx.db
  .query("tableName")
  .withIndex("by_field", (q) => q.eq("field", value))
  .collect();

// Mutations
export const myMutation = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tableName", { name: args.name });
  },
});
```

Use `useQuery()`, `useMutation()`, `useAction()` from `convex/react` on the client.

## API Routes

```typescript
export async function GET(request: NextRequest) {
  return NextResponse.json({ data }, { status: 200 });
}
```

## Common Utilities
- `cn()` from `~/lib/utils` for className merging
- `toast` from `sonner` for notifications
- Icons from `lucide-react`
- Timestamps stored as Unix ms (`number`), format with `new Date(timestamp).toLocaleDateString()`

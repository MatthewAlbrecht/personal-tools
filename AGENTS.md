# Agent Guidelines

## Build/Lint/Test Commands

- `pnpm dev` - Start dev server on port 1333 with Turbo
- `pnpm build` - Production build
- `pnpm typecheck` - Run TypeScript type checking (`tsc --noEmit`)
- `pnpm check` - Run Biome linter (check only)
- `pnpm check:write` - Run Biome linter with auto-fix
- `pnpm check:unsafe` - Run Biome with unsafe fixes
- `pnpm start` - Start production server on port 1333
- `pnpm preview` - Build and start production server

No test framework is configured in this project.

## Code Style Guidelines

### Function Definitions

- Use classic function declarations for named functions: `function myFunction() {}`
- Arrow functions only for inline callbacks and short anonymous functions
- React components use classic syntax: `export function MyComponent() {}`

### Type Definitions

- Use type aliases (`type`) instead of interfaces by default
- Interfaces only when declaration merging or extending from classes is needed
- Declare component props inline: `function MyComponent({ prop }: { prop: string }) {}`
- Separate prop types only when reused across multiple components

### Component Structure

- Helper/skeleton components placed AFTER the main exported component
- Skeleton components named `ComponentNameSkeleton` (e.g., `ReleaseItemSkeleton`)
- Colocate skeletons with their component in the same file
- Use `'use client'` directive for client components
- Use `forwardRef` for components that need ref forwarding

### Imports & Path Aliases

- Use `~/*` for src directory imports: `import { env } from '~/env.js'`
- Environment variables accessed via `~/env.js`, never `process.env` directly
- Third-party imports first, then local imports with `~/` prefix

### File Organization

- Kebab-case for file names: `album-card.tsx`, `formatters.ts`
- Components in `src/components/ui/` for reusable UI primitives
- Feature components in `src/app/[feature]/_components/`
- Utilities in `src/lib/` and `src/[feature]/_utils/`
- Server code in `src/server/` and `convex/`

### Formatting & Linting

- Biome handles formatting and linting
- Sorted class names for `clsx`, `cva`, `cn` functions (enforced)
- Use `cn()` utility from `~/lib/utils` for conditional class merging
- Tab indentation (enforced by Biome)

### TypeScript

- Strict mode enabled with `noUncheckedIndexedAccess`
- Prefer explicit return types on exported functions
- Use `v.string()`, `v.number()`, etc. for Convex validation
- Use Zod for environment variable and input validation

### Naming Conventions

- Components: PascalCase (`AlbumCard`, `ReleaseItem`)
- Functions: camelCase (`formatDate`, `getRatingColors`)
- Constants: UPPER_SNAKE_CASE for env/schema values
- File names: kebab-case (`album-card.tsx`)

### Error Handling

- Use `try/catch` for async operations
- Return proper HTTP status codes in API routes (401, 500, etc.)
- Log errors with `console.error()`
- Use toast notifications (`sonner`) for user-facing errors

### Backend Patterns

#### Convex
- Use `query` for reads, `mutation` for writes, `action` for side effects
- Call `requireAuth(ctx)` in authenticated handlers
- Use indexes: `.withIndex('by_field', (q) => q.eq('field', value))`
- Return explicit typed objects from functions

#### tRPC
- Use `publicProcedure` for unauthenticated endpoints
- Use `.query()` for reads, `.mutation()` for writes
- Procedures defined in `src/server/api/routers/`

#### API Routes
- Named export for HTTP methods: `export async function GET(request: NextRequest)`
- Use `NextResponse.json()` for JSON responses
- Return error objects with status codes

### Common Patterns

- State hooks in `src/lib/hooks/` (prefixed with `use-`)
- Types exported from `_utils/types.ts` in feature directories
- Use Convex React hooks: `useQuery()`, `useMutation()`, `useAction()`
- Image components use Next.js `Image` from `next/image`
- Icons from `lucide-react`
- Toasts via `toast` from `sonner`

### Timestamps

- Unix timestamps (ms) stored as `number` in database/Convex
- Format for display: `new Date(timestamp).toLocaleDateString(...)`

### Authentication

- Auth status via `useAuthToken()` hook
- Pass access tokens via headers: `X-Access-Token`
- Session managed through `~/lib/auth-context.tsx`

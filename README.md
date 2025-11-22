# Next.js Boilerplate

A modern, full-stack Next.js boilerplate with tRPC, Convex, and authentication ready to go.

## Stack

- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[tRPC](https://trpc.io)** - End-to-end typesafe APIs
- **[Convex](https://convex.dev)** - Realtime backend with auth
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Beautiful UI components
- **[Pulumi](https://pulumi.com)** - Infrastructure as code
- **[React Email](https://react.email)** - Email templates with React
- **[Resend](https://resend.com)** - Email API

## Features

- ✅ Authentication with Convex Auth
- ✅ tRPC API setup with example router
- ✅ Convex backend with example schema
- ✅ Cron job example (Vercel)
- ✅ Email infrastructure ready
- ✅ Pulumi infrastructure configuration
- ✅ Tailwind CSS + shadcn/ui components
- ✅ TypeScript throughout

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Convex account (free tier available)

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd personal-tools
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=your_convex_url

# Cron Secret (for Vercel cron jobs)
CRON_SECRET=your_secret_here

# Email (Resend)
RESEND_API_KEY=your_resend_api_key
```

4. Start Convex development:

```bash
npx convex dev
```

5. Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
├── convex/              # Convex backend functions
│   ├── schema.ts        # Database schema
│   ├── todos.ts         # Example CRUD operations
│   └── auth.ts          # Authentication config
├── src/
│   ├── app/             # Next.js app router pages
│   │   ├── api/         # API routes
│   │   │   ├── auth/    # Auth endpoints
│   │   │   └── trpc/    # tRPC endpoint
│   │   ├── login/       # Login page
│   │   └── page.tsx     # Home page
│   ├── components/      # React components
│   │   └── ui/          # shadcn/ui components
│   ├── server/          # Server-side code
│   │   └── api/         # tRPC routers
│   ├── lib/             # Utilities
│   └── env.js           # Environment variable validation
├── infra/               # Pulumi infrastructure
└── docs/                # Documentation
```

## Example Usage

### tRPC

The boilerplate includes an example tRPC router at `src/server/api/routers/example.ts`:

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const exampleRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return { greeting: `Hello ${input.name ?? "World"}!` };
    }),
});
```

Use it in your components:

```typescript
const { data } = api.example.hello.useQuery({ name: "John" });
```

### Convex

Example Convex query/mutation in `convex/todos.ts`:

```typescript
export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('todos').order('desc').collect();
  },
});
```

### Cron Jobs

Example cron job at `src/pages/api/cron/hello-world.ts` that runs daily. Configure schedule in `vercel.json`.

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables
4. Deploy!

The cron job will automatically be configured based on `vercel.json`.

### Convex

Convex automatically deploys when you run `npx convex deploy` or when you push to your connected git branch.

## Documentation

- [Pulumi Setup Guide](./docs/pulumi-setup.md)

## License

MIT

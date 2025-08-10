import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const bookSearchRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        title: z.string().default(''),
        author: z.string().default(''),
        isbn: z.string().optional(),
        hardcover: z.boolean().default(true),
        firstEdition: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const titleNorm = normalize(input.title);
      const authorNorm = normalize(input.author);
      const isbnRaw = input.isbn?.trim() ?? '';
      const isbnNorm = isbnRaw.replace(/[^0-9Xx]/g, '').toUpperCase();
      return ctx.db.bookSearch.upsert({
        where: {
          titleNorm_authorNorm_isbnNorm: {
            titleNorm,
            authorNorm,
            isbnNorm,
          },
        },
        create: {
          title: input.title,
          author: input.author,
          hardcover: input.hardcover,
          firstEdition: input.firstEdition,
          titleNorm,
          authorNorm,
          isbn: isbnRaw || null,
          isbnNorm,
        },
        update: {
          title: input.title,
          author: input.author,
          hardcover: input.hardcover,
          firstEdition: input.firstEdition,
          isbn: isbnRaw || null,
          isbnNorm,
        },
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.bookSearch.delete({ where: { id: input.id } });
      return { success: true } as const;
    }),

  listRecent: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).default(10) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      return ctx.db.bookSearch.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
    }),
});

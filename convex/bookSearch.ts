import { v } from 'convex/values';
import { query, mutation } from './_generated/server';

// Normalize text for search comparison
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Create or update a book search
export const create = mutation({
  args: {
    title: v.string(),
    author: v.string(),
    isbn: v.optional(v.string()),
    hardcover: v.boolean(),
    firstEdition: v.boolean(),
    folioSociety: v.boolean(),
  },
  handler: async (ctx, args) => {
    const titleNorm = normalize(args.title);
    const authorNorm = normalize(args.author);
    const isbnRaw = args.isbn?.trim() ?? '';
    const isbnNorm = isbnRaw.replace(/[^0-9Xx]/g, '').toUpperCase();
    const now = Date.now();

    // Check if a search with the same normalized values already exists
    const existing = await ctx.db
      .query('bookSearch')
      .withIndex('by_search_key', (q) =>
        q
          .eq('titleNorm', titleNorm)
          .eq('authorNorm', authorNorm)
          .eq('isbnNorm', isbnNorm)
      )
      .first();

    if (existing) {
      // Update existing search
      await ctx.db.patch(existing._id, {
        title: args.title,
        author: args.author,
        hardcover: args.hardcover,
        firstEdition: args.firstEdition,
        folioSociety: args.folioSociety,
        isbn: isbnRaw || undefined,
        isbnNorm,
        updatedAt: now,
      });
      return { ...existing, updatedAt: now };
    }

    // Create new search
    return await ctx.db.insert('bookSearch', {
      title: args.title,
      author: args.author,
      hardcover: args.hardcover,
      firstEdition: args.firstEdition,
      folioSociety: args.folioSociety,
      titleNorm,
      authorNorm,
      isbn: isbnRaw || undefined,
      isbnNorm,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Delete a book search
export const deleteSearch = mutation({
  args: { id: v.id('bookSearch') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true } as const;
  },
});

// List recent book searches
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    return await ctx.db
      .query('bookSearch')
      .withIndex('by_updatedAt')
      .order('desc')
      .take(limit);
  },
});

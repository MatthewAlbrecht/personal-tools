import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// Get current configuration
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('folioSocietyConfig').first();

    // Return existing config or null if none exists
    // The frontend will handle creating a default config via the updateConfig mutation
    return (
      config || {
        startId: 5130,
        endId: 5300,
        updatedAt: Date.now(),
      }
    );
  },
});

// Update configuration
export const updateConfig = mutation({
  args: {
    startId: v.number(),
    endId: v.number(),
  },
  handler: async (ctx, { startId, endId }) => {
    if (startId >= endId) {
      throw new Error('Start ID must be less than end ID');
    }

    const existing = await ctx.db.query('folioSocietyConfig').first();

    const updatedConfig = {
      startId,
      endId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, updatedConfig);
      return { ...updatedConfig, _id: existing._id };
    }

    const id = await ctx.db.insert('folioSocietyConfig', updatedConfig);
    return { ...updatedConfig, _id: id };
  },
});

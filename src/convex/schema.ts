import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  folioSocietyConfig: defineTable({
    startId: v.number(),
    endId: v.number(),
    updatedAt: v.number(), // Unix timestamp - more efficient for database operations
  }),
});

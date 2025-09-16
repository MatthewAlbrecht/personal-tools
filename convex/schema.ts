import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  folioSocietyConfig: defineTable({
    startId: v.number(),
    endId: v.number(),
    updatedAt: v.number(), // Unix timestamp - more efficient for database operations
  }),

  folioSocietyReleases: defineTable({
    id: v.number(), // External ID from Folio Society API
    sku: v.string(),
    name: v.string(),
    url: v.string(),
    visibility: v.any(), // JSON data from API
    image: v.optional(v.string()),
    price: v.optional(v.number()),
    isActive: v.boolean(),
    firstSeenAt: v.number(), // Unix timestamp
    lastSeenAt: v.number(), // Unix timestamp
    lastUpdatedAt: v.number(), // Unix timestamp
  })
    .index('by_external_id', ['id']) // For unique lookups by external ID
    .index('by_firstSeenAt', ['firstSeenAt']) // For date range queries
    .index('by_lastSeenAt', ['lastSeenAt']) // For recent activity
    .index('by_isActive', ['isActive']), // For filtering active/inactive
});

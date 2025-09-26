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

  folioSocietyProductDetails: defineTable({
    productId: v.number(), // Maps to folioSocietyReleases.id
    slug: v.string(),
    sku: v.string(),
    name: v.string(),

    price: v.optional(v.number()),
    availability: v.optional(v.string()),
    isInStock: v.optional(v.boolean()),

    publicationDateText: v.optional(v.string()),
    publicationDateISO: v.optional(v.string()),
    pages: v.optional(v.number()),
    dimensions: v.optional(v.string()),
    font: v.optional(v.string()),
    illustration: v.optional(v.string()),
    presentation: v.optional(v.string()), // presentation_box_binding
    printing: v.optional(v.string()),

    authorIds: v.optional(v.array(v.number())),
    illustratorIds: v.optional(v.array(v.number())),
    translatorIds: v.optional(v.array(v.number())),

    heroImage: v.optional(v.string()),
    galleryImages: v.optional(v.array(v.string())),

    canonical: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    store: v.optional(v.number()),

    lastFetchedAt: v.number(),
    fetchStatus: v.string(), // 'ok' | 'error' | 'stale'
    errorCount: v.number(),
    lastError: v.optional(v.string()),

    raw: v.any(),
  })
    .index('by_productId', ['productId'])
    .index('by_slug', ['slug'])
    .index('by_lastFetchedAt', ['lastFetchedAt'])
    .index('by_fetchStatus', ['fetchStatus']),

  bookSearch: defineTable({
    title: v.string(),
    author: v.string(),
    hardcover: v.boolean(),
    firstEdition: v.boolean(),
    folioSociety: v.boolean(),
    titleNorm: v.string(),
    authorNorm: v.string(),
    isbn: v.optional(v.string()),
    isbnNorm: v.string(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(), // Unix timestamp
  })
    .index('by_createdAt', ['createdAt']) // For date range queries
    .index('by_updatedAt', ['updatedAt']) // For recent searches
    .index('by_search_key', ['titleNorm', 'authorNorm', 'isbnNorm']), // For unique lookups
});

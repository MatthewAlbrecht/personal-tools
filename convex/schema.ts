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

  folioSocietyImages: defineTable({
    productId: v.number(),
    blobUrl: v.string(), // S3/CloudFront CDN URL
    originalUrl: v.string(), // Original Folio image URL
    originalFilename: v.string(), // Original filename from Folio API (e.g., "1q84_01_base_1.jpg")
    imageType: v.union(
      v.literal('hero'),
      v.literal('gallery'),
      v.literal('thumbnail')
    ),
    position: v.optional(v.number()), // For gallery ordering
    imageHash: v.string(), // SHA-256 hash for deduplication
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isActive: v.boolean(),
    metadata: v.optional(v.any()), // width, height, fileSize, contentType, etc.
  })
    .index('by_productId', ['productId'])
    .index('by_imageHash', ['imageHash'])
    .index('by_originalFilename', ['originalFilename'])
    .index('by_productId_originalFilename', ['productId', 'originalFilename'])
    .index('by_isActive', ['isActive']),

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

  geniusAlbums: defineTable({
    albumTitle: v.string(),
    artistName: v.string(),
    albumSlug: v.string(),
    geniusAlbumUrl: v.string(),
    totalSongs: v.number(),
    createdAt: v.number(), // Unix timestamp
    updatedAt: v.number(), // Unix timestamp
  })
    .index('by_albumSlug', ['albumSlug']) // For slug-based lookups
    .index('by_updatedAt', ['updatedAt']), // For recent albums

  geniusSongs: defineTable({
    albumId: v.id('geniusAlbums'),
    songTitle: v.string(),
    geniusSongUrl: v.string(),
    trackNumber: v.number(),
    lyrics: v.string(),
    about: v.optional(v.string()),
    createdAt: v.number(), // Unix timestamp
  })
    .index('by_albumId', ['albumId']) // For fetching songs by album
    .index('by_trackNumber', ['trackNumber']), // For ordering songs
});

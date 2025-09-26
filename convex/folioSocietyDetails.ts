import { v } from 'convex/values';
import { query, mutation, action } from './_generated/server';
import { api } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { requireAuth } from './auth';

type NormalizeResult = {
  productId: number;
  slug: string;
  sku: string;
  name: string;
  price?: number;
  availability?: string;
  isInStock?: boolean;
  publicationDateText?: string;
  publicationDateISO?: string;
  pages?: number;
  dimensions?: string;
  font?: string;
  illustration?: string;
  presentation?: string;
  printing?: string;
  authorIds?: number[];
  illustratorIds?: number[];
  translatorIds?: number[];
  heroImage?: string;
  galleryImages?: string[];
  canonical?: string;
  ogImage?: string;
  store?: number;
  lastFetchedAt: number;
  fetchStatus: 'ok' | 'error' | 'stale';
  errorCount: number;
  lastError?: string;
  raw: unknown;
};

type EnrichDetailsResult = {
  attempted: number;
  ttlHours: number;
  maxConcurrent: number;
};

export const getDetailsByProductId = query({
  args: { productId: v.number() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    const existing = await ctx.db
      .query('folioSocietyProductDetails')
      .withIndex('by_productId', (q) => q.eq('productId', args.productId))
      .first();
    return existing ?? null;
  },
});

export const getAllDetails = query({
  args: {},
  handler: async (ctx) => {
    requireAuth(ctx);
    return await ctx.db.query('folioSocietyProductDetails').collect();
  },
});

export const upsertDetails = mutation({
  args: {
    productId: v.number(),
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
    presentation: v.optional(v.string()),
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
    fetchStatus: v.string(),
    errorCount: v.number(),
    lastError: v.optional(v.string()),

    raw: v.any(),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    const existing = await ctx.db
      .query('folioSocietyProductDetails')
      .withIndex('by_productId', (q) => q.eq('productId', args.productId))
      .first();

    if (existing) {
      const { _id } = existing as Doc<'folioSocietyProductDetails'>;

      // Only update fields that are present in args (not undefined)
      const updates: Partial<typeof args> = {};
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) {
          updates[key as keyof typeof args] = value;
        }
      }

      await ctx.db.patch(_id, updates);
      return _id;
    }
    return await ctx.db.insert('folioSocietyProductDetails', { ...args });
  },
});

export const enrichDetails = action({
  args: {
    productIds: v.optional(v.array(v.number())),
    detailsTtlHours: v.optional(v.number()),
    maxConcurrent: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<EnrichDetailsResult> => {
    requireAuth(ctx);
    const now = Date.now();
    const ttlMs = (args.detailsTtlHours ?? 24) * 60 * 60 * 1000;
    const maxConcurrent = Math.max(1, Math.min(args.maxConcurrent ?? 3, 10));
    const limit = args.limit ?? 50;

    console.log('🚀 Starting enrichment process...');
    console.log(
      `📊 Enrichment params: TTL=${args.detailsTtlHours ?? 24}h, maxConcurrent=${maxConcurrent}, limit=${limit}`
    );
    if (args.detailsTtlHours === 0) {
      console.log(
        '🔥 FORCE REFRESH MODE: Will process ALL products regardless of existing data'
      );
    }
    if (args.productIds) {
      console.log(
        `🎯 Checking specific product IDs: ${args.productIds.join(', ')}`
      );
    } else {
      console.log('🔍 Will check all products for missing/stale details');
    }

    const releases = await ctx.runQuery(
      api.folioSocietyReleases.getAllReleases
    );
    console.log(`📦 Found ${releases.length} total releases in database`);

    const existingDetails = await ctx.runQuery(
      api.folioSocietyDetails.getAllDetails
    );
    const byProductId = new Map<number, Doc<'folioSocietyProductDetails'>>();
    for (const d of existingDetails) {
      byProductId.set(
        d.productId as number,
        d as Doc<'folioSocietyProductDetails'>
      );
    }
    console.log(`📋 Found ${existingDetails.length} existing details records`);

    function shouldFetch(productId: number): boolean {
      // If TTL is 0, force refresh all products
      if (ttlMs === 0) return true;

      const d = byProductId.get(productId);
      if (!d) return true;
      if (d.fetchStatus !== 'ok') return true;
      return now - (d.lastFetchedAt as number) > ttlMs;
    }

    // Filter to only the products we want to check
    const targetReleases = args.productIds
      ? releases.filter((r) => args.productIds?.includes(r.id as number))
      : releases;

    console.log(`🎯 Checking ${targetReleases.length} target products`);

    const candidates = targetReleases
      .filter((r) => shouldFetch(r.id as number))
      .slice(0, limit)
      .map((r) => ({
        productId: r.id as number,
        slug: (r.url as string).replace(/^\//, ''),
        sku: r.sku as string,
        name: r.name as string,
      }));

    console.log(`🔍 Found ${candidates.length} products that need enrichment`);

    // Break down what needs enrichment
    const missingDetails = candidates.filter(
      (c) => !byProductId.has(c.productId)
    );
    const staleDetails = candidates.filter((c) => {
      const existing = byProductId.get(c.productId);
      return existing && existing.fetchStatus !== 'ok';
    });
    const expiredDetails = candidates.filter((c) => {
      const existing = byProductId.get(c.productId);
      return (
        existing &&
        existing.fetchStatus === 'ok' &&
        now - (existing.lastFetchedAt as number) > ttlMs
      );
    });

    console.log('📊 Enrichment breakdown:');
    console.log(`   - Missing details: ${missingDetails.length}`);
    console.log(`   - Stale details (errors): ${staleDetails.length}`);
    console.log(`   - Expired details (TTL): ${expiredDetails.length}`);

    if (candidates.length > 0) {
      console.log(
        `📝 Products to enrich: ${candidates.map((c) => `${c.name} (${c.sku})`).join(', ')}`
      );
    } else {
      console.log(
        '✅ All target products have fresh details - nothing to enrich'
      );
    }

    async function fetchWithRetry(
      url: string,
      options: { method: string; headers: Record<string, string> },
      retries = 2
    ): Promise<Response> {
      try {
        const res = await fetch(url, options);
        if (
          !res.ok &&
          retries > 0 &&
          (res.status >= 500 || res.status === 429)
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, (3 - retries) * 500)
          );
          return await fetchWithRetry(url, options, retries - 1);
        }
        return res;
      } catch (e) {
        if (retries > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, (3 - retries) * 500)
          );
          return await fetchWithRetry(url, options, retries - 1);
        }
        throw e;
      }
    }

    function parsePublicationDate(dateText?: string): string | undefined {
      if (!dateText) return undefined;
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText.trim());
      if (!match) return undefined;
      const [, dd, mm, yyyy] = match;
      try {
        const iso = new Date(
          Number(yyyy),
          Number(mm) - 1,
          Number(dd)
        ).toISOString();
        return iso;
      } catch {
        return undefined;
      }
    }

    type MediaItem = { image?: string; labels?: string[] };
    function pickHeroImage(
      media: MediaItem[],
      smallImage?: string,
      thumbnail?: string
    ): string | undefined {
      if (Array.isArray(media)) {
        const base = media.find(
          (m: MediaItem) => Array.isArray(m.labels) && m.labels.includes('base')
        );
        if (base?.image) return base.image as string;
        const first = media[0] as MediaItem;
        if (first?.image) return first.image as string;
      }
      return smallImage || thumbnail;
    }

    async function enrichOne(task: {
      productId: number;
      slug: string;
      sku: string;
      name: string;
    }): Promise<void> {
      console.log(
        `🔄 Enriching: ${task.name} (${task.sku}) - ID: ${task.productId}`
      );
      const url = `https://www.foliosociety.com/usa/api/n/route/${encodeURIComponent(task.slug)}?pushDeps=true`;
      console.log(`🌐 Fetching: ${url}`);
      const headers: HeadersInit = {
        Accept: 'application/json, text/plain, */*',
        'sec-ch-ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'X-Store-Id': '2',
        Referer: `https://www.foliosociety.com/usa/${task.slug}`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      };

      try {
        const res = await fetchWithRetry(url, { method: 'GET', headers });
        if (!res.ok) {
          const message = `${res.status} ${res.statusText}`;
          console.log(`❌ HTTP Error for ${task.name}: ${message}`);
          await ctx.runMutation(api.folioSocietyDetails.upsertDetails, {
            productId: task.productId,
            slug: task.slug,
            sku: task.sku,
            name: task.name,
            lastFetchedAt: Date.now(),
            fetchStatus: 'error',
            errorCount: (byProductId.get(task.productId)?.errorCount ?? 0) + 1,
            lastError: message,
            raw: null,
          });
          return;
        }
        console.log(`✅ Successfully fetched data for ${task.name}`);
        const data = await res.json();
        const catalog = Array.isArray(data.catalog)
          ? data.catalog[0]
          : undefined;
        if (!catalog || typeof catalog !== 'object') {
          console.log(`❌ Invalid catalog payload for ${task.name}`);
          await ctx.runMutation(api.folioSocietyDetails.upsertDetails, {
            productId: task.productId,
            slug: task.slug,
            sku: task.sku,
            name: task.name,
            lastFetchedAt: Date.now(),
            fetchStatus: 'error',
            errorCount: (byProductId.get(task.productId)?.errorCount ?? 0) + 1,
            lastError: 'Invalid catalog payload',
            raw: data,
          });
          return;
        }

        const price =
          typeof catalog.price === 'number'
            ? (catalog.price as number)
            : undefined;
        const availability = catalog.meta?.availability as string | undefined;
        const isInStock = availability
          ? availability === 'in_stock'
          : undefined;

        const publicationDateText =
          typeof catalog.publication_date === 'string'
            ? (catalog.publication_date as string)
            : undefined;
        const publicationDateISO = parsePublicationDate(publicationDateText);
        const pages =
          typeof catalog.pages === 'number'
            ? (catalog.pages as number)
            : undefined;
        const dimensions =
          typeof catalog.dimensions === 'string'
            ? (catalog.dimensions as string)
            : undefined;
        const font =
          typeof catalog.font === 'string'
            ? (catalog.font as string)
            : undefined;
        const illustration =
          typeof catalog.illustration === 'string'
            ? (catalog.illustration as string)
            : undefined;
        const presentation =
          typeof catalog.presentation_box_binding === 'string'
            ? (catalog.presentation_box_binding as string)
            : undefined;
        const printing =
          typeof catalog.printing === 'string'
            ? (catalog.printing as string)
            : undefined;

        const authorIds = Array.isArray(catalog.author)
          ? (catalog.author as number[])
          : undefined;
        const illustratorIds = Array.isArray(catalog.illustrator)
          ? (catalog.illustrator as number[])
          : undefined;
        const translatorIds = Array.isArray(catalog.translated_by)
          ? (catalog.translated_by as number[])
          : undefined;

        const media: MediaItem[] = Array.isArray(catalog.media)
          ? (catalog.media as MediaItem[])
          : [];
        const heroImage = pickHeroImage(
          media,
          catalog.small_image as string | undefined,
          catalog.thumbnail as string | undefined
        );
        const galleryImages = media
          .map((m: MediaItem) => m.image)
          .filter((s: unknown) => typeof s === 'string') as string[];

        const canonical =
          typeof catalog.meta?.canonical === 'string'
            ? (catalog.meta.canonical as string)
            : undefined;
        const ogImage =
          typeof catalog.meta?.ogimage === 'string'
            ? (catalog.meta.ogimage as string)
            : undefined;
        const store =
          typeof catalog.store === 'number'
            ? (catalog.store as number)
            : undefined;

        const payload: NormalizeResult = {
          productId: task.productId,
          slug: task.slug,
          sku: task.sku,
          name: task.name,
          price,
          availability,
          isInStock,
          publicationDateText,
          publicationDateISO,
          pages,
          dimensions,
          font,
          illustration,
          presentation,
          printing,
          authorIds,
          illustratorIds,
          translatorIds,
          heroImage,
          galleryImages,
          canonical,
          ogImage,
          store,
          lastFetchedAt: Date.now(),
          fetchStatus: 'ok',
          errorCount: 0,
          raw: catalog,
        };

        await ctx.runMutation(api.folioSocietyDetails.upsertDetails, payload);
        console.log(
          `✅ Successfully enriched ${task.name} with ${galleryImages.length} gallery images`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.log(`❌ Error enriching ${task.name}: ${message}`);
        await ctx.runMutation(api.folioSocietyDetails.upsertDetails, {
          productId: task.productId,
          slug: task.slug,
          sku: task.sku,
          name: task.name,
          lastFetchedAt: Date.now(),
          fetchStatus: 'error',
          errorCount: (byProductId.get(task.productId)?.errorCount ?? 0) + 1,
          lastError: message,
          raw: null,
        });
      }
    }

    async function processInBatches<T>(
      items: T[],
      batchSize: number,
      worker: (item: T) => Promise<void>
    ): Promise<void> {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map((item) => worker(item)));
      }
    }

    console.log(
      `🚀 Starting batch processing with ${maxConcurrent} concurrent workers...`
    );
    await processInBatches(candidates, maxConcurrent, enrichOne);

    console.log(
      `🎉 Enrichment completed! Processed ${candidates.length} products`
    );
    return {
      attempted: candidates.length,
      ttlHours: args.detailsTtlHours ?? 24,
      maxConcurrent,
    };
  },
});

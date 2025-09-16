import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

const FolioSocietyProductSchema = z.object({
  id: z.number(),
  sku: z.string(),
  name: z.string(),
  url: z.string(),
  visibility: z.object({
    catalog: z.boolean(),
    search: z.boolean(),
  }),
  image: z.string().optional(),
  price: z.number().optional(),
  verbosity: z.number(),
  type: z.string(),
  store: z.number(),
});

type FolioSocietyProduct = z.infer<typeof FolioSocietyProductSchema>;

export const folioSocietyRouter = createTRPCRouter({
  // Get current configuration
  getConfig: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.folioSocietyConfig.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
  }),

  // Update configuration
  updateConfig: publicProcedure
    .input(
      z.object({
        startId: z.number().min(1),
        endId: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { startId, endId } = input;
      if (startId >= endId) {
        throw new Error('Start ID must be less than end ID');
      }

      return ctx.db.folioSocietyConfig.upsert({
        where: { id: 'default' },
        create: {
          startId,
          endId,
        },
        update: {
          startId,
          endId,
        },
      });
    }),

  // Fetch and sync data from Folio Society API
  syncReleases: publicProcedure
    .input(
      z.object({
        startId: z.number().optional(),
        endId: z.number().optional(),
        autoExpand: z.boolean().default(true), // Auto-expand range if no new products found
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current config or use defaults
      const config = await ctx.db.folioSocietyConfig.upsert({
        where: { id: 'default' },
        create: {},
        update: {},
      });

      let { startId, endId } = input;
      startId = startId ?? config.startId;
      endId = endId ?? config.endId;

      // Generate ID range
      const ids = Array.from(
        { length: (endId ?? config.endId) - (startId ?? config.startId) + 1 },
        (_, i) => (startId ?? config.startId) + i
      );

      try {
        // Make API call to Folio Society
        const apiUrl = `https://www.foliosociety.com/usa/api/n/load?type=product&verbosity=1&ids=${ids.join(
          ','
        )}&pushDeps=false`;

        console.log(`🌐 Making API call to: ${apiUrl.substring(0, 100)}...`);
        console.log(
          `📊 Checking ID range: ${ids[0]} to ${ids[ids.length - 1]} (${
            ids.length
          } total)`
        );

        const response = await fetch(apiUrl, {
          headers: {
            'sec-ch-ua-platform': '"macOS"',
            Referer: 'https://www.foliosociety.com/usa/the-complete-collection',
            'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'X-Store-Id': '2',
            DNT: '1',
          },
        });

        if (!response.ok) {
          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        console.log(
          `📥 API Response: ${JSON.stringify(data, null, 2).substring(
            0,
            500
          )}...`
        );

        if (!data.result || !Array.isArray(data.result)) {
          console.error('❌ Invalid API response format:', data);
          throw new Error('Invalid API response format');
        }

        console.log(`📦 Raw products from API: ${data.result.length}`);

        // Validate and filter products
        const validProducts = data.result
          .map((product: unknown) => {
            const result = FolioSocietyProductSchema.safeParse(product);
            return result.success ? result.data : null;
          })
          .filter(
            (product: unknown): product is FolioSocietyProduct =>
              product !== null
          );

        // Get existing release IDs to track new ones
        const existingIds = await ctx.db.folioSocietyRelease
          .findMany({
            select: { id: true },
          })
          .then((releases) => new Set(releases.map((r) => r.id)));

        console.log(
          `📋 Found ${existingIds.size} existing releases in database`
        );
        console.log(
          `🔍 Processing ${validProducts.length} products from API...`
        );

        const newReleases: FolioSocietyProduct[] = [];

        // Update database with new/changed products
        const updatePromises = validProducts.map(
          async (product: FolioSocietyProduct) => {
            const isNew = !existingIds.has(product.id);
            if (isNew) {
              console.log(
                `🆕 NEW RELEASE FOUND: ${product.name} (ID: ${product.id}, SKU: ${product.sku})`
              );
              newReleases.push(product);
            }

            return ctx.db.folioSocietyRelease.upsert({
              where: { id: product.id },
              create: {
                id: product.id,
                sku: product.sku,
                name: product.name,
                url: product.url,
                visibility: product.visibility,
                image: product.image,
                price: product.price,
                isActive: true,
                lastSeenAt: new Date(),
              },
              update: {
                sku: product.sku,
                name: product.name,
                url: product.url,
                visibility: product.visibility,
                image: product.image,
                price: product.price,
                isActive: true,
                lastSeenAt: new Date(),
              },
            });
          }
        );

        await Promise.all(updatePromises);

        console.log(
          `✅ Database update completed. Found ${newReleases.length} new releases.`
        );

        // Mark products not seen in this sync as inactive (if they were previously active)
        await ctx.db.folioSocietyRelease.updateMany({
          where: {
            id: {
              notIn: validProducts.map(
                (product: FolioSocietyProduct) => product.id
              ),
            },
            isActive: true,
            lastSeenAt: {
              lt: new Date(), // Products not seen in this sync
            },
          },
          data: {
            isActive: true,
          },
        });

        // Auto-expand range if enabled and we found products near the end
        let newConfig = null;
        if (input.autoExpand && validProducts.length > 0) {
          const maxFoundId = Math.max(
            ...validProducts.map((product: FolioSocietyProduct) => product.id)
          );
          const currentRangeSize =
            (endId ?? config.endId) - (startId ?? config.startId);

          // If we found products within 10% of the end of our range, expand it
          if (maxFoundId > (endId ?? config.endId) - currentRangeSize * 0.1) {
            const newEndId = (endId ?? config.endId) + 100; // Add 100 more IDs
            newConfig = await ctx.db.folioSocietyConfig.update({
              where: { id: 'default' },
              data: { endId: newEndId },
            });
          }
        }

        return {
          success: true,
          syncedCount: validProducts.length,
          totalIds: ids.length,
          rangeExpanded: newConfig !== null,
          newEndId: newConfig?.endId,
          newReleases,
          newReleasesCount: newReleases.length,
        };
      } catch (error) {
        console.error('Error syncing Folio Society releases:', error);
        throw new Error(
          `Failed to sync releases: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }),

  // Get all releases
  getReleases: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(50),
        sortBy: z
          .enum(['firstSeenAt', 'lastSeenAt', 'name', 'price', 'id'])
          .default('id'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, sortBy, sortOrder, search } = input;

      return ctx.db.folioSocietyRelease.findMany({
        orderBy: {
          [sortBy]: sortOrder,
        },
        take: limit,
        where: {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
      });
    }),

  // Get a specific release by ID
  getRelease: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.folioSocietyRelease.findUnique({
        where: { id: input.id },
      });
    }),

  // Get statistics about releases
  getStats: publicProcedure.query(async ({ ctx }) => {
    const [total, recent] = await Promise.all([
      ctx.db.folioSocietyRelease.count(),
      ctx.db.folioSocietyRelease.count({
        where: {
          firstSeenAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
    ]);

    return {
      total,
      recent,
      lastSync: await ctx.db.folioSocietyRelease
        .findFirst({
          orderBy: { lastSeenAt: 'desc' },
          select: { lastSeenAt: true },
        })
        .then((result) => result?.lastSeenAt),
    };
  }),
});

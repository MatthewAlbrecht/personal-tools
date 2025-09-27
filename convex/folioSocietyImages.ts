import { v } from 'convex/values';
import { query, mutation, action } from './_generated/server';
import { api } from './_generated/api';
import { requireAuth } from './auth';
import { put } from '@vercel/blob';

// Helper functions for image processing
async function fetchImageWithRetry(
  url: string,
  options: { method: string; headers: Record<string, string> },
  retries = 2
): Promise<{ response: Response; content: Uint8Array }> {
  try {
    const res = await fetch(url, options);
    if (!res.ok && retries > 0 && (res.status >= 500 || res.status === 429)) {
      await new Promise((resolve) => setTimeout(resolve, (3 - retries) * 500));
      return await fetchImageWithRetry(url, options, retries - 1);
    }

    // Read the response content for hashing
    const content = new Uint8Array(await res.clone().arrayBuffer());
    return { response: res, content };
  } catch (e) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, (3 - retries) * 500));
      return await fetchImageWithRetry(url, options, retries - 1);
    }
    throw e;
  }
}

async function calculateImageHash(content: Uint8Array): Promise<string> {
  // Use Web Crypto API for proper SHA-256 hashing
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    content.buffer as ArrayBuffer
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

type ImageMetadata = {
  width?: number;
  height?: number;
  fileSize?: number;
  contentType?: string;
};

// Get all images for a product
export const getImagesByProduct = query({
  args: { productId: v.number() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    return await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_productId', (q) => q.eq('productId', args.productId))
      .collect();
  },
});

// Get active images for a product
export const getActiveImagesByProduct = query({
  args: { productId: v.number() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    return await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_productId', (q) => q.eq('productId', args.productId))
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

// Get image by hash (for deduplication)
export const getImageByHash = query({
  args: { imageHash: v.string() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    return await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_imageHash', (q) => q.eq('imageHash', args.imageHash))
      .first();
  },
});

// Get image by original filename (global deduplication)
export const getImageByOriginalFilename = query({
  args: { originalFilename: v.string() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    return await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_originalFilename', (q) =>
        q.eq('originalFilename', args.originalFilename)
      )
      .first();
  },
});

// Get image by productId and original filename (product-specific)
export const getImageByProductAndOriginalFilename = query({
  args: { productId: v.number(), originalFilename: v.string() },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    return await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_productId_originalFilename', (q) =>
        q
          .eq('productId', args.productId)
          .eq('originalFilename', args.originalFilename)
      )
      .first();
  },
});

// Enrich images for a specific product
export const enrichImages = action({
  args: { productId: v.number() },
  handler: async (ctx, args): Promise<{ processed: number; total: number }> => {
    requireAuth(ctx);

    console.log(`🖼️ Starting image enrichment for product ${args.productId}`);

    // Get product details
    const details = await ctx.runQuery(
      api.folioSocietyDetails.getDetailsByProductId,
      {
        productId: args.productId,
      }
    );

    if (!details) {
      throw new Error(
        `Product details not found for product ${args.productId}`
      );
    }

    console.log(
      `📸 Found details with hero: ${details.heroImage || 'none'}, gallery: ${details.galleryImages?.length || 0} images`
    );

    // Prepare images to process
    const imagesToProcess = [];
    if (details.heroImage) {
      imagesToProcess.push({
        url: details.heroImage,
        type: 'hero' as const,
      });
    }
    if (details.galleryImages && details.galleryImages.length > 0) {
      details.galleryImages.forEach((img: string, index: number) => {
        imagesToProcess.push({
          url: img,
          type: 'gallery' as const,
          position: index + 1,
        });
      });
    }

    if (imagesToProcess.length === 0) {
      console.log('⚠️ No images to process for this product');
      return { processed: 0, total: 0 };
    }

    console.log(
      `🚀 Processing ${imagesToProcess.length} images:`,
      imagesToProcess.map((img) => `${img.type}: ${img.url}`).join(', ')
    );

    try {
      console.log('🔄 Calling processProductImages action...');
      // Process the images
      const result = await ctx.runAction(
        api.folioSocietyImages.processProductImages,
        {
          productId: args.productId,
          images: imagesToProcess,
          now: Date.now(),
        }
      );

      console.log(
        `✅ Image enrichment completed: ${result.processed}/${result.total} images processed`
      );
      return result;
    } catch (error) {
      console.error('❌ Error calling processProductImages:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        productId: args.productId,
        imagesCount: imagesToProcess.length,
      });
      throw error;
    }
  },
});

// Process images for all releases that have details but no images
export const processAllImages = action({
  args: {
    batchSize: v.optional(v.number()), // How many releases to process at once
    maxConcurrent: v.optional(v.number()), // How many concurrent image processing operations
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    processed: number;
    total: number;
    skipped: number;
  }> => {
    const batchSize = args.batchSize ?? 10;
    const maxConcurrent = args.maxConcurrent ?? 3;

    console.log(
      `🖼️ Starting batch image processing for all releases (batchSize: ${batchSize}, maxConcurrent: ${maxConcurrent})`
    );

    // Get all releases that have details
    const releasesWithDetails = await ctx.runQuery(
      api.folioSocietyDetails.getAllDetails
    );
    console.log(`📊 Found ${releasesWithDetails.length} releases with details`);

    // Filter to releases that don't have active images
    const releasesNeedingImages = [];

    for (const release of releasesWithDetails) {
      const activeImages = await ctx.runQuery(
        api.folioSocietyImages.getActiveImagesByProduct,
        {
          productId: release.productId,
        }
      );

      if (!activeImages || activeImages.length === 0) {
        releasesNeedingImages.push(release);
      }
    }

    console.log(
      `🎯 Found ${releasesNeedingImages.length} releases that need image processing`
    );

    if (releasesNeedingImages.length === 0) {
      console.log('✅ All releases already have images processed');
      return { processed: 0, total: 0, skipped: releasesWithDetails.length };
    }

    // Process in batches
    let totalProcessed = 0;
    let totalImages = 0;

    for (let i = 0; i < releasesNeedingImages.length; i += batchSize) {
      const batch = releasesNeedingImages.slice(i, i + batchSize);
      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(releasesNeedingImages.length / batchSize)} (${batch.length} releases)`
      );

      // Process batch with concurrency control
      const batchPromises = batch.map(async (release) => {
        try {
          console.log(
            `🖼️ Processing images for ${release.name} (ID: ${release.productId})`
          );
          const result = await ctx.runAction(
            api.folioSocietyImages.enrichImages,
            {
              productId: release.productId,
            }
          );
          console.log(
            `✅ Processed ${result.processed}/${result.total} images for ${release.name}`
          );
          return { success: true, result, release };
        } catch (error) {
          console.error(
            `❌ Failed to process images for ${release.name}:`,
            error
          );
          return { success: false, error, release };
        }
      });

      // Wait for the current batch to complete before starting the next
      const batchResults = await Promise.all(batchPromises);

      for (const batchResult of batchResults) {
        if (batchResult.success) {
          totalProcessed += 1;
          totalImages += batchResult?.result?.processed ?? 0;
        }
      }

      console.log(
        `📊 Batch completed: ${totalProcessed}/${releasesNeedingImages.length} releases processed so far`
      );

      // Small delay between batches to be gentle on the API
      if (i + batchSize < releasesNeedingImages.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `🎉 Image backfill completed: ${totalProcessed}/${releasesNeedingImages.length} releases processed, ${totalImages} total images`
    );
    return {
      processed: totalProcessed,
      total: releasesNeedingImages.length,
      skipped: releasesWithDetails.length - releasesNeedingImages.length,
    };
  },
});

// Helper function to extract filename from URL
function extractFilename(url: string): string {
  // Extract filename from URL like "/product/1/q/1q84_01_base_1.jpg" -> "1q84_01_base_1.jpg"
  const parts = url.split('/');
  return parts[parts.length - 1] || '';
}

// Upsert image record (product-specific)
export const upsertImage = mutation({
  args: {
    productId: v.number(),
    blobUrl: v.string(),
    originalUrl: v.string(),
    originalFilename: v.string(),
    imageType: v.union(
      v.literal('hero'),
      v.literal('gallery'),
      v.literal('thumbnail')
    ),
    position: v.optional(v.number()),
    imageHash: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isActive: v.boolean(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx);

    // Check if this product already has an image with this original filename
    const existingImage = await ctx.db
      .query('folioSocietyImages')
      .withIndex('by_productId_originalFilename', (q) =>
        q
          .eq('productId', args.productId)
          .eq('originalFilename', args.originalFilename)
      )
      .first();

    if (existingImage) {
      // Update the existing record for this product
      await ctx.db.patch(existingImage._id, {
        blobUrl: args.blobUrl,
        originalUrl: args.originalUrl,
        imageType: args.imageType,
        position: args.position,
        imageHash: args.imageHash,
        lastSeenAt: args.lastSeenAt,
        isActive: args.isActive,
        metadata: args.metadata,
        // Keep original firstSeenAt
      });
      return existingImage._id;
    }

    // Create new record for this product
    return await ctx.db.insert('folioSocietyImages', args);
  },
});

// Process images during enrichment
export const processProductImages = action({
  args: {
    productId: v.number(),
    images: v.array(
      v.object({
        url: v.string(),
        type: v.union(
          v.literal('hero'),
          v.literal('gallery'),
          v.literal('thumbnail')
        ),
        position: v.optional(v.number()),
      })
    ),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    const timestamp = args.now ?? Date.now();

    console.log(`🔄 Starting image processing for product ${args.productId}`);
    console.log(`📊 Input: ${args.images?.length || 0} images to process`);

    // Check if we have images to process
    if (!args.images || args.images.length === 0) {
      console.log('⚠️ No images provided to process');
      return { processed: 0, total: 0, imageIds: [] };
    }

    console.log('📋 Images to process:');
    args.images.forEach((img, index) => {
      console.log(
        `  ${index + 1}. ${img.type}: ${img.url}${img.position ? ` (position: ${img.position})` : ''}`
      );
    });

    const processedImages: string[] = [];

    console.log(`🔄 About to process ${args.images.length} images in loop`);
    for (const [index, imageData] of args.images.entries()) {
      console.log(
        `🔄 Starting loop iteration ${index + 1}/${args.images.length}`
      );
      try {
        console.log(
          `\n🔍 Processing image ${index + 1}/${args.images.length}: ${imageData.type} - ${imageData.url}`
        );

        const originalFilename = extractFilename(imageData.url);
        console.log(`📁 Original filename: ${originalFilename}`);

        // FIRST: Check if this product already has an image with this original filename
        // If it does, we don't need to fetch the image at all
        console.log('🔍 Checking if this product already has this image...');
        const existingImage = await ctx.runQuery(
          api.folioSocietyImages.getImageByProductAndOriginalFilename,
          {
            productId: args.productId,
            originalFilename,
          }
        );

        if (existingImage) {
          console.log(
            '✅ Found existing image for this product, updating record (no fetch needed)...'
          );

          // Update the existing record for this product (no image fetch required)
          const upsertResult = await ctx.runMutation(
            api.folioSocietyImages.upsertImage,
            {
              productId: args.productId,
              blobUrl: existingImage.blobUrl, // Keep existing blob URL
              originalUrl: imageData.url,
              originalFilename,
              imageType: imageData.type,
              position: imageData.position,
              imageHash: existingImage.imageHash, // Keep existing hash
              firstSeenAt: existingImage.firstSeenAt, // Keep original first seen time
              lastSeenAt: timestamp,
              isActive: true,
              metadata: existingImage.metadata, // Keep existing metadata
            }
          );

          processedImages.push(imageData.url);
          console.log(`✅ Updated existing product record: ${imageData.url}`);
          console.log(`✅ Database record updated: ${upsertResult}`);
          continue; // Skip to next image
        }

        // If we get here, the product doesn't have this filename yet, so we need to fetch and process
        console.log(
          '🔍 Product does not have this image, fetching and processing...'
        );

        // Construct full URL
        const fullUrl = `https://www.foliosociety.com/static/media/catalog${imageData.url}`;
        console.log(`🌐 Full URL: ${fullUrl}`);

        // Fetch image to get content hash
        console.log('📥 Fetching image content...');
        const { content, response } = await fetchImageWithRetry(fullUrl, {
          method: 'GET',
          headers: {
            Accept: 'image/*,*/*',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'X-Store-Id': '2',
            Referer: 'https://www.foliosociety.com/usa/',
          },
        });

        console.log(`📊 Image content size: ${content.length} bytes`);
        console.log(`📊 Response status: ${response.status}`);
        console.log(
          `📊 Response content-type: ${response.headers.get('content-type')}`
        );

        if (content.length === 0) {
          console.error(`❌ Empty content received for ${imageData.url}`);
          continue;
        }

        const imageHash = await calculateImageHash(content);
        console.log(`🔐 Image hash: ${imageHash}`);

        // Check globally by hash for blob deduplication
        console.log('🔍 Checking for global hash match...');
        const globalHashMatch = await ctx.runQuery(
          api.folioSocietyImages.getImageByHash,
          {
            imageHash,
          }
        );

        if (globalHashMatch) {
          console.log(
            `♻️ Found identical image globally, reusing blob URL: ${globalHashMatch.blobUrl}`
          );

          // Create new record for this product with reused blob
          const upsertResult = await ctx.runMutation(
            api.folioSocietyImages.upsertImage,
            {
              productId: args.productId,
              blobUrl: globalHashMatch.blobUrl, // Reuse existing blob URL
              originalUrl: imageData.url,
              originalFilename,
              imageType: imageData.type,
              position: imageData.position,
              imageHash,
              firstSeenAt: timestamp,
              lastSeenAt: timestamp,
              isActive: true,
              metadata: {
                fileSize: content.length,
                // Could add width/height detection here later
              },
            }
          );

          processedImages.push(imageData.url);
          console.log(
            `✅ Created new product record with reused blob: ${imageData.url}`
          );
          console.log(`✅ Database record created: ${upsertResult}`);
        } else {
          // If we get here, the image hash wasn't found globally, so upload new
          console.log('🆕 New image, uploading to blob storage...');

          // Upload to Vercel Blob Storage
          const blobFilename = `${imageHash}.jpg`;
          console.log(`📤 Uploading to blob storage: ${blobFilename}`);

          try {
            // @ts-ignore
            const blob = await put(blobFilename, content, {
              access: 'public',
              contentType: 'image/jpeg',
              token: process.env.BLOB_READ_WRITE_TOKEN,
              addRandomSuffix: true, // Avoid filename conflicts in blob storage
            });

            const blobUrl = blob.url;
            console.log(`✅ Blob upload successful: ${blobUrl}`);

            // Create new record for this product
            const upsertResult = await ctx.runMutation(
              api.folioSocietyImages.upsertImage,
              {
                productId: args.productId,
                blobUrl,
                originalUrl: imageData.url,
                originalFilename,
                imageType: imageData.type,
                position: imageData.position,
                imageHash,
                firstSeenAt: timestamp,
                lastSeenAt: timestamp,
                isActive: true,
                metadata: {
                  fileSize: content.length,
                  // Could add width/height detection here later
                },
              }
            );

            processedImages.push(imageData.url);
            console.log(
              `✅ Uploaded and processed new image: ${imageData.url}`
            );
            console.log(`✅ Database record created: ${upsertResult}`);
          } catch (blobError) {
            console.error(
              `❌ Blob upload failed for ${imageData.url}:`,
              blobError
            );
            console.error('Blob error details:', {
              blobFilename,
              contentLength: content.length,
              error:
                blobError instanceof Error
                  ? blobError.message
                  : String(blobError),
            });
          }
        }
      } catch (error) {
        console.error(`❌ Failed to process image ${imageData.url}:`, error);
      }
    }

    console.log('\n🎉 Image processing completed:');
    console.log(
      `📊 Processed: ${processedImages.length}/${args.images.length} images`
    );
    console.log(`🏷️ Product ID: ${args.productId}`);
    console.log(`⏰ Timestamp: ${new Date(timestamp).toISOString()}`);
    return {
      processed: processedImages.length,
      total: args.images.length,
      imageIds: processedImages,
    };
  },
});

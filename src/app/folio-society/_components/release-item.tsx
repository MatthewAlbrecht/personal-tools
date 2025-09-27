import { ExternalLink, Image } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { ImageGallery } from "~/components/ImageGallery";
import { useQuery, useAction } from "convex/react";
import { api as convexApi } from "../../../../convex/_generated/api";
import type { ConvexRelease } from "../_utils/types";
import { generateImageUrls } from "../_utils/image-utils";
import { formatPrice, formatDate } from "../_utils/formatters";

export function ReleaseItem({
  release,
}: {
  release: ConvexRelease;
}) {
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  // Query for enriched image data
  const images = useQuery(convexApi.folioSocietyImages.getActiveImagesByProduct, {
    productId: release.id,
  });

  // Action for enriching images for this specific product
  const enrichImagesAction = useAction(convexApi.folioSocietyImages.enrichImages);

  const handleProcessImages = async () => {
    setIsProcessingImages(true);
    try {
      console.log(`🚀 Starting image enrichment for ${release.name}`);

      const result = await enrichImagesAction({
        productId: release.id,
      });

      toast.success(`Processed ${result.processed} images for ${release.name}`);
    } catch (error) {
      console.error('Image enrichment failed:', error);
      toast.error('Failed to process images. Check console for details.');
    } finally {
      setIsProcessingImages(false);
    }
  };

  return (
    <div
      key={release.id}
      className="flex items-start justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="truncate font-semibold text-lg">
            {release.name}
          </h3>
        </div>

        <div className="mb-2 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <span className="font-medium">ID:</span> {release.id}
          </span>
          <span className="flex items-center gap-1">
            <span className="font-medium">SKU:</span> {release.sku}
          </span>
          <span className="flex items-center gap-1">
            <span className="font-medium">Price:</span>{" "}
            {formatPrice(release.price)}
          </span>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground text-xs">
          <span>First seen: {formatDate(release.firstSeenAt)}</span>
          <span>Last seen: {formatDate(release.lastSeenAt)}</span>
        </div>

        <ImageGallery
          images={images}
          fallbackImageUrls={generateImageUrls(release.sku, release.image)}
        />
      </div>

      <div className="ml-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(
              `https://www.foliosociety.com/usa${release.url}`,
              "_blank"
            );
          }}
          className="flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleProcessImages}
          disabled={isProcessingImages}
          className="flex items-center gap-1"
        >
          <Image className={`h-3 w-3 ${isProcessingImages ? "animate-spin" : ""}`} />
          {isProcessingImages ? "Processing..." : "Process Images"}
        </Button>
      </div>
    </div>
  );
}

export function ReleaseItemSkeleton() {
  return (
    <div className="flex items-start justify-between rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-2">
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="mb-2 flex items-center gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mb-3 flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-20 w-20 rounded" />
          <Skeleton className="h-20 w-20 rounded" />
          <Skeleton className="h-20 w-20 rounded" />
        </div>
      </div>
      <div className="ml-4 flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

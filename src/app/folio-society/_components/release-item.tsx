import { ExternalLink } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { ImageGallery } from "~/components/ImageGallery";
import type { Release } from "../_utils/types";
import { generateImageUrls } from "../_utils/image-utils";
import { formatPrice, formatDate } from "../_utils/formatters";

export function ReleaseItem({
  release,
}: {
  release: Release;
}) {
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
          imageUrls={generateImageUrls(release.sku, release.image)}
        />
      </div>

      <div className="ml-4">
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
      <div className="ml-4">
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

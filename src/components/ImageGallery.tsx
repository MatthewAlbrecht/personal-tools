import { useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import type { Doc } from "../../convex/_generated/dataModel";

// Use the actual Convex-generated type for images
type FolioImage = Doc<"folioSocietyImages">;

interface ImageGalleryProps {
	images?: FolioImage[]; // Use the actual Convex type
	fallbackImageUrls?: string[]; // Legacy support
}

function ImageTooltip({
	imageUrl,
	filename,
}: { imageUrl: string; filename?: string }) {
	const [imageLoaded, setImageLoaded] = useState(false);
	const [imageDimensions, setImageDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);

	const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		const img = e.currentTarget;
		setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
		setImageLoaded(true);
	};

	// Calculate container dimensions based on image aspect ratio
	const getContainerDimensions = () => {
		if (!imageDimensions) return { width: 384, height: 384 };

		const maxSize = 384;
		const { width, height } = imageDimensions;
		const aspectRatio = width / height;

		if (aspectRatio > 1) {
			// Landscape: constrain by width
			return { width: maxSize, height: maxSize / aspectRatio };
		}

		// Portrait or square: constrain by height
		return { width: maxSize * aspectRatio, height: maxSize };
	};

	const containerDims = getContainerDimensions();
	const displayFilename =
		filename || imageUrl.split("/").pop()?.split("?")[0] || imageUrl;

	return (
		<TooltipContent side="top" sideOffset={10} className="max-w-none p-2">
			<div
				className="relative"
				style={{ width: containerDims.width, height: containerDims.height }}
			>
				{!imageLoaded && <Skeleton className="h-full w-full rounded" />}
				<img
					src={imageUrl}
					alt="Large preview"
					className={`h-full w-full rounded object-contain ${
						imageLoaded ? "opacity-100" : "opacity-0"
					} transition-opacity duration-200`}
					onLoad={handleImageLoad}
					onError={() => setImageLoaded(false)}
				/>
				{imageLoaded && (
					<div className="absolute bottom-0 left-0 rounded-tr rounded-bl bg-black/70 px-2 py-1 text-white text-xs">
						{displayFilename}
					</div>
				)}
			</div>
		</TooltipContent>
	);
}

function ImageThumbnail({
	imageUrl,
	filename,
}: { imageUrl: string; filename?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<a
					href={imageUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="relative block"
				>
					<img
						src={imageUrl}
						alt={imageUrl}
						className="h-20 w-auto rounded border transition-all duration-200 hover:ring-2 hover:ring-primary"
						loading="lazy"
					/>
				</a>
			</TooltipTrigger>
			<ImageTooltip imageUrl={imageUrl} filename={filename} />
		</Tooltip>
	);
}

export function ImageGallery({ images, fallbackImageUrls }: ImageGalleryProps) {
	// Use new image data structure if available, otherwise fall back to legacy URLs
	const displayImages =
		images?.map((img) => ({
			displayUrl: img.blobUrl || img.originalUrl,
			filename:
				img.originalFilename ||
				img.originalUrl.split("/").pop()?.split("?")[0] ||
				img.originalUrl,
		})) ||
		fallbackImageUrls?.map((url) => ({
			displayUrl: url,
			filename: url.split("/").pop()?.split("?")[0] || url,
		})) ||
		[];

	return (
		<TooltipProvider delayDuration={300}>
			<div className="mt-3">
				<div className="flex flex-wrap gap-2">
					{displayImages.map((image) => (
						<ImageThumbnail
							key={image.displayUrl + image.filename}
							imageUrl={image.displayUrl}
							filename={image.filename}
						/>
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

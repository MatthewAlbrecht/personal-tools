import { useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";

interface ImageGalleryProps {
	imageUrls: string[];
}

function ImageTooltip({ imageUrl }: { imageUrl: string }) {
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
						{imageUrl.split("/").pop()?.split("?")[0]}
					</div>
				)}
			</div>
		</TooltipContent>
	);
}

function ImageThumbnail({ imageUrl }: { imageUrl: string }) {
	const [isValidImage, setIsValidImage] = useState(false);

	const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		const img = e.currentTarget;

		// Filter out the Folio Society backup logo (262x262)
		if (img.naturalWidth === 262 && img.naturalHeight === 262) {
			setIsValidImage(false);
		} else {
			setIsValidImage(true);
		}
	};

	const handleError = () => {
		setIsValidImage(false);
	};

	if (!isValidImage) {
		return (
			<img
				src={imageUrl}
				alt={imageUrl}
				className="hidden" // Hidden until we determine if it's valid
				loading="eager" // Must be eager for hidden images to load
				onLoad={handleLoad}
				onError={handleError}
			/>
		);
	}

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
			<ImageTooltip imageUrl={imageUrl} />
		</Tooltip>
	);
}

export function ImageGallery({ imageUrls }: ImageGalleryProps) {
	return (
		<TooltipProvider delayDuration={300}>
			<div className="mt-3">
				<div className="flex flex-wrap gap-2">
					{imageUrls.map((imageUrl) => (
						<ImageThumbnail key={imageUrl} imageUrl={imageUrl} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

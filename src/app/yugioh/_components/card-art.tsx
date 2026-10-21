import Image from "next/image";
import type * as React from "react";
import { cn } from "~/lib/utils";

const SIZES = {
	row: { width: 48, height: 70, className: "w-10 md:w-12", sizes: "48px" },
	drawer: {
		width: 120,
		height: 175,
		className: "w-24 md:w-[120px]",
		sizes: "120px",
	},
} as const;

/**
 * A Card's image at the real 59:86 card ratio: the TCGplayer product image,
 * or a muted tile with the set code's prefix until there is one.
 */
export function CardArt({
	setCode,
	imageUrl,
	alt,
	size = "row",
}: {
	setCode: string | null;
	imageUrl: string | null;
	/** "<Card name>, <rarity>" */
	alt: string;
	size?: "row" | "drawer";
}): React.ReactElement {
	const { width, height, className, sizes } = SIZES[size];
	const frame = cn(
		"aspect-[59/86] shrink-0 rounded-[3px] bg-muted ring-1 ring-border",
		className,
	);
	if (imageUrl) {
		return (
			<Image
				src={imageUrl}
				alt={alt}
				width={width}
				height={height}
				sizes={sizes}
				className={cn(frame, "h-auto object-contain")}
			/>
		);
	}
	const prefix = setCode?.split("-")[0] ?? "";
	return (
		<div
			aria-hidden
			className={cn(
				frame,
				"flex items-center justify-center font-mono text-muted-foreground tracking-tight",
				size === "row" ? "text-[0.5625rem]" : "text-xs",
			)}
		>
			{prefix}
		</div>
	);
}

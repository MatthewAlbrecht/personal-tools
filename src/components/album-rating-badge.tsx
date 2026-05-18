import type { MouseEvent } from "react";
import { getRatingColors, getTierShortLabel } from "~/lib/album-tiers";
import { cn } from "~/lib/utils";

export function AlbumRatingBadge({
	rating,
	onClick,
	title = onClick ? "Re-rank this album" : undefined,
}: {
	rating: number;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	title?: string;
}) {
	const ratingColors = getRatingColors(rating);
	const className = cn(
		"inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px]",
		ratingColors.bg,
		ratingColors.text,
		ratingColors.border,
		onClick && "transition-opacity hover:opacity-80",
	);

	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={className} title={title}>
				{getTierShortLabel(rating)}
			</button>
		);
	}

	return (
		<span className={className} title={title}>
			{getTierShortLabel(rating)}
		</span>
	);
}

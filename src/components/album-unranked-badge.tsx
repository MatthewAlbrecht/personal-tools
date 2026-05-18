import type { MouseEvent } from "react";
import { cn } from "~/lib/utils";

const unrankedBadgeClassName =
	"inline-flex items-center rounded-full border border-muted-foreground/20 border-dashed px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40";

export function AlbumUnrankedBadge({
	onClick,
	title = onClick ? "Rank this album" : "Unranked",
}: {
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	title?: string;
}) {
	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					unrankedBadgeClassName,
					"transition-all hover:border-muted-foreground/50 hover:text-muted-foreground",
				)}
				title={title}
			>
				Unranked
			</button>
		);
	}

	return (
		<span className={unrankedBadgeClassName} title={title}>
			Unranked
		</span>
	);
}

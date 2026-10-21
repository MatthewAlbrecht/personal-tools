import type * as React from "react";
import { cn } from "~/lib/utils";

/**
 * A Card's image slot at the real 59:86 card ratio. Until ticket 03 adds the
 * TCGplayer image, it's a muted tile with the set code's prefix.
 */
export function CardArt({
	setCode,
	size = "row",
}: {
	setCode: string | null;
	size?: "row" | "drawer";
}): React.ReactElement {
	const prefix = setCode?.split("-")[0] ?? "";
	return (
		<div
			aria-hidden
			className={cn(
				"flex aspect-[59/86] shrink-0 items-center justify-center rounded-[3px] bg-muted font-mono text-muted-foreground tracking-tight ring-1 ring-border",
				size === "row"
					? "w-10 text-[0.5625rem] md:w-12"
					: "w-24 text-xs md:w-[120px]",
			)}
		>
			{prefix}
		</div>
	);
}

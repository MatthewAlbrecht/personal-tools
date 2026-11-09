"use client";

import { Star } from "lucide-react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * A star toggle. Filled when starred itself; a lighter fill when only its
 * floor plan is starred (pressing it still stars the unit itself).
 */
export function StarButton({
	active,
	label,
	onToggle,
	viaPlan = false,
	className,
}: {
	active: boolean;
	/** What it stars, for screen readers: "apt 608", "floor plan B2". */
	label: string;
	onToggle: () => void;
	/** Starred because its floor plan is: a lighter fill. */
	viaPlan?: boolean;
	className?: string;
}): React.ReactElement {
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-pressed={active}
			aria-label={active ? `Unstar ${label}` : `Star ${label}`}
			title={!active && viaPlan ? "Starred with its floor plan" : undefined}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
			className={cn("size-11 active:scale-[0.97] md:size-8", className)}
		>
			<Star
				className={cn(
					"transition-colors duration-150",
					active
						? "fill-foreground text-foreground"
						: viaPlan
							? "fill-muted-foreground/40 text-muted-foreground"
							: "text-muted-foreground",
				)}
			/>
		</Button>
	);
}

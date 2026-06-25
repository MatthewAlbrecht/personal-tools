"use client";

import { Disc3, X } from "lucide-react";
import Image from "next/image";
import { type KeyboardEvent, forwardRef } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type RankingAlbumCardProps = {
	position: number;
	name: string;
	artistName: string;
	imageUrl?: string;
	isSelected?: boolean;
	onSelect?: () => void;
	onRemove?: () => void;
};

export const RankingAlbumCard = forwardRef<
	HTMLDivElement,
	RankingAlbumCardProps
>(function RankingAlbumCard(
	{
		position,
		name,
		artistName,
		imageUrl,
		isSelected = false,
		onSelect,
		onRemove,
	},
	ref,
) {
	return (
		<div
			ref={ref}
			{...(onSelect
				? {
						role: "button" as const,
						tabIndex: 0,
						onClick: onSelect,
						onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect();
							}
						},
					}
				: {})}
			className={cn(
				"group flex items-center gap-2 rounded-md border border-transparent p-1 hover:bg-muted/50",
				isSelected && "ring-2 ring-primary",
			)}
		>
			<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted font-mono text-xs">
				{position}
			</div>

			<div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded bg-muted">
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt={name}
						fill
						className="object-cover"
						sizes="36px"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-4 w-4 text-muted-foreground" />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm">{name}</p>
				<p className="truncate text-muted-foreground text-xs">{artistName}</p>
			</div>

			{onRemove && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
				>
					<X className="h-3.5 w-3.5" />
					<span className="sr-only">Remove album</span>
				</Button>
			)}
		</div>
	);
});

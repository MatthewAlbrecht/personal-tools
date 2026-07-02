"use client";

import { Disc3, Pencil, X } from "lucide-react";
import Image from "next/image";
import { type KeyboardEvent, forwardRef } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

type RankingAlbumCardProps = {
	position: number;
	name: string;
	artistName: string;
	imageUrl?: string;
	isManual?: boolean;
	isSingleArtist?: boolean;
	showSingleArtistToggle?: boolean;
	isSelected?: boolean;
	onSelect?: () => void;
	onEdit?: () => void;
	onRemove?: () => void;
	onSingleArtistChange?: (singleArtist: boolean) => void;
};

function AlbumCover({
	name,
	imageUrl,
	isManual,
}: {
	name: string;
	imageUrl?: string;
	isManual?: boolean;
}) {
	if (!imageUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Disc3 className="h-4 w-4 text-muted-foreground" />
			</div>
		);
	}

	if (isManual) {
		return (
			<img src={imageUrl} alt={name} className="h-full w-full object-cover" />
		);
	}

	return (
		<Image
			src={imageUrl}
			alt={name}
			fill
			className="object-cover"
			sizes="36px"
		/>
	);
}

export const RankingAlbumCard = forwardRef<
	HTMLDivElement,
	RankingAlbumCardProps
>(function RankingAlbumCard(
	{
		position,
		name,
		artistName,
		imageUrl,
		isManual = false,
		isSingleArtist = false,
		showSingleArtistToggle = false,
		isSelected = false,
		onSelect,
		onEdit,
		onRemove,
		onSingleArtistChange,
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
				<AlbumCover name={name} imageUrl={imageUrl} isManual={isManual} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<p className="truncate font-medium text-sm">{name}</p>
					{isManual && (
						<Badge variant="outline" className="h-4 px-1 text-[10px]">
							Manual
						</Badge>
					)}
				</div>
				<p className="truncate text-muted-foreground text-xs">{artistName}</p>
				{showSingleArtistToggle && onSingleArtistChange && (
					<div className="mt-1 flex items-center gap-1.5">
						<Checkbox
							id={`single-artist-${position}`}
							checked={isSingleArtist}
							onCheckedChange={(checked) => {
								onSingleArtistChange(checked === true);
							}}
							onClick={(e) => e.stopPropagation()}
						/>
						<Label
							htmlFor={`single-artist-${position}`}
							className="cursor-pointer text-[10px] text-muted-foreground leading-none"
							onClick={(e) => e.stopPropagation()}
						>
							Single artist (don&apos;t split on commas)
						</Label>
					</div>
				)}
			</div>

			{onEdit && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation();
						onEdit();
					}}
				>
					<Pencil className="h-3.5 w-3.5" />
					<span className="sr-only">Edit album</span>
				</Button>
			)}

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

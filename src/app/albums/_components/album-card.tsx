"use client";

import { Check, Disc3 } from "lucide-react";
import Image from "next/image";
import { forwardRef } from "react";
import { getRatingColors, getTierShortLabel } from "~/lib/album-tiers";
import { cn } from "~/lib/utils";

type AlbumCardProps = {
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	listenedAt?: number;
	listenOrdinal?: number; // Which listen this was (1 = first, 2 = second, etc.)
	rating?: number; // 1-10 rating if rated
	showListenDate?: boolean;
	showReleaseYear?: boolean;
	onRate?: () => void;
	onSelect?: () => void; // Click to select for keyboard navigation
	isSelected?: boolean; // Keyboard navigation selection state
	showSaved?: boolean; // Show "Saved" indicator
};

export const AlbumCard = forwardRef<HTMLDivElement, AlbumCardProps>(
	function AlbumCard(
		{
			name,
			artistName,
			imageUrl,
			releaseDate,
			listenedAt,
			listenOrdinal,
			rating,
			showListenDate = false,
			showReleaseYear = false,
			onRate,
			onSelect,
			isSelected = false,
			showSaved = false,
		},
		ref,
	) {
		const releaseYear = releaseDate?.substring(0, 4);

		const listenDateStr = listenedAt
			? new Date(listenedAt).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				})
			: null;

		const ratingColors = rating ? getRatingColors(rating) : null;
		const isRated = rating !== undefined;

		return (
			<div
				ref={ref}
				onClick={onSelect}
				className={cn(
					"group flex items-center gap-2 rounded-md p-1 hover:bg-muted/50",
					isSelected && !showSaved && "ring-2 ring-primary",
					showSaved && "ring-2 ring-emerald-500/50",
				)}
			>
				{/* Album Cover */}
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

				{/* Album Info */}
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm">{name}</p>
					<p className="truncate text-muted-foreground text-xs">{artistName}</p>
				</div>

				{/* Metadata */}
				<div className="flex flex-shrink-0 items-center gap-2">
					{/* Saved Indicator - instant on, fade out */}
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-600 dark:text-emerald-400",
							showSaved
								? "opacity-100"
								: "pointer-events-none opacity-0 transition-opacity duration-300",
						)}
					>
						<Check className="h-3 w-3" />
						Saved
					</span>

					{/* Rating Badge or Unranked Button */}
					{isRated && ratingColors ? (
						// Rated - show colored tier badge (display only)
						<span
							className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px] ${ratingColors.bg} ${ratingColors.text} ${ratingColors.border}`}
						>
							{getTierShortLabel(rating)}
						</span>
					) : (
						// Unranked - show subtle ghost button (only if onRate is provided)
						onRate && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRate();
								}}
								className="inline-flex items-center rounded-full border border-muted-foreground/20 border-dashed px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
								title="Rank this album"
							>
								Unranked
							</button>
						)
					)}

					{/* Listen ordinal */}
					{listenOrdinal !== undefined &&
						(listenOrdinal === 1 ? (
							<span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-600 dark:text-emerald-400">
								First
							</span>
						) : (
							<span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
								{listenOrdinal}×
							</span>
						))}

					{/* Date/Year */}
					<div className="text-right text-muted-foreground text-xs">
						{showListenDate && listenDateStr && <span>{listenDateStr}</span>}
						{showReleaseYear && releaseYear && <span>{releaseYear}</span>}
					</div>
				</div>
			</div>
		);
	},
);

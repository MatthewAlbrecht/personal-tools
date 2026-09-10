"use client";

import { Check, Disc3 } from "lucide-react";
import Image from "next/image";
import { forwardRef } from "react";
import { AlbumListenCountBadge } from "~/components/album-listen-count-badge";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import { AlbumUnrankedBadge } from "~/components/album-unranked-badge";
import { cn } from "~/lib/utils";

type AlbumCardProps = {
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	listenedAt?: number;
	listenCount?: number;
	isFirstListen?: boolean;
	rating?: number; // 1-15 rating if rated
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
			listenCount,
			isFirstListen = false,
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

		const isRated = rating !== undefined;

		return (
			<div
				ref={ref}
				onClick={onSelect}
				className={cn(
					"group flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted/50",
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
					<div className="flex min-w-0 items-baseline gap-2">
						<p className="truncate font-medium text-sm">{name}</p>
						{isFirstListen ? (
							<span
								className="shrink-0 font-medium text-[10px] text-teal-800/70 tracking-wide"
								title="First listen"
							>
								New
							</span>
						) : null}
					</div>
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
					{isRated ? (
						<AlbumRatingBadge
							rating={rating}
							onClick={
								onRate
									? (event) => {
											event.stopPropagation();
											onRate();
										}
									: undefined
							}
						/>
					) : onRate ? (
						<AlbumUnrankedBadge
							onClick={(e) => {
								e.stopPropagation();
								onRate();
							}}
						/>
					) : null}

					{listenCount !== undefined ? (
						<AlbumListenCountBadge listenCount={listenCount} />
					) : null}

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

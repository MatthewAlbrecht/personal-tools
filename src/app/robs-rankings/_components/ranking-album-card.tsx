"use client";

import { Check, Disc3, Lock } from "lucide-react";
import Image from "next/image";
import { forwardRef } from "react";
import { cn } from "~/lib/utils";
import type { RankingStatus } from "../_utils/types";

type RankingAlbumCardProps = {
	position: number;
	name: string;
	artistName: string;
	imageUrl?: string;
	status: RankingStatus;
	isSelected?: boolean;
	onSelect?: () => void;
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
		status,
		isSelected = false,
		onSelect,
	},
	ref,
) {
	return (
		<div
			ref={ref}
			onClick={onSelect}
			className={cn(
				"group flex items-center gap-2 rounded-md border p-1 hover:bg-muted/50",
				isSelected && "ring-2 ring-primary",
				status === "confirmed" && "border-transparent bg-emerald-500/10",
				status === "locked" && "border-amber-500/30",
				status === "none" && "border-transparent",
			)}
		>
			{/* Position Number */}
			<div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted font-mono text-xs">
				{position}
			</div>

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

			{/* Status Indicators */}
			<div className="flex flex-shrink-0 items-center gap-1">
				{status === "confirmed" && (
					<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-600 dark:text-emerald-400">
						<Check className="h-3 w-3" />
						Confirmed
					</span>
				)}
				{status === "locked" && (
					<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-[10px] text-amber-600 dark:text-amber-400">
						<Lock className="h-3 w-3" />
						Locked
					</span>
				)}
			</div>
		</div>
	);
});

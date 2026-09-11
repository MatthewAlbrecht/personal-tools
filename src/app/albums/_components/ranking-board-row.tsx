"use client";

import { Check, Crown, Disc3 } from "lucide-react";
import Image from "next/image";
import { type ReactNode, type Ref, forwardRef } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { type OrdinalBand, bandForOrdinal } from "~/lib/ranking-ordinals";
import { cn } from "~/lib/utils";

export const RankingBoardRow = forwardRef<
	HTMLDivElement,
	{
		ordinal: number;
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseYear?: string;
		listenCount?: number;
		subdivisionLabel?: string;
		isSelected?: boolean;
		showSaved?: boolean;
		onSelect?: () => void;
		wowSlot?: ReactNode;
		staggerIndex?: number;
	}
>(function RankingBoardRow(
	{
		ordinal,
		name,
		artistName,
		imageUrl,
		releaseYear,
		listenCount,
		subdivisionLabel,
		isSelected = false,
		showSaved = false,
		onSelect,
		wowSlot,
		staggerIndex,
	},
	ref: Ref<HTMLDivElement>,
) {
	const band = bandForOrdinal(ordinal);
	const cover = coverForBand(band);
	const isHero = band === "hero";
	const animateTop =
		staggerIndex !== undefined && ordinal <= 10 && staggerIndex < 10;

	return (
		<div
			ref={ref}
			role={onSelect ? "button" : undefined}
			tabIndex={onSelect ? 0 : undefined}
			onClick={onSelect}
			onKeyDown={
				onSelect
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect();
							}
						}
					: undefined
			}
			style={
				animateTop
					? {
							animation: `home-rise 480ms ease-out ${Math.min(
								staggerIndex * 36,
								280,
							)}ms both`,
						}
					: undefined
			}
			className={cn(
				"group relative flex w-full items-center gap-2.5 rounded-md text-left outline-none transition-[background-color,box-shadow,transform] duration-200",
				padForBand(band),
				(ordinal === 1 || ordinal === 5) && "mb-5",
				isSelected &&
					!showSaved &&
					"bg-teal-950/[0.04] ring-2 ring-teal-800/35",
				showSaved && "bg-emerald-500/5 ring-2 ring-emerald-500/40",
				isHero &&
					!isSelected &&
					"bg-gradient-to-r from-teal-950/[0.06] to-transparent",
				onSelect && "cursor-pointer hover:bg-muted/40",
				isSelected && "translate-x-0.5",
			)}
		>
			{/* Ordinal */}
			<div
				className={cn(
					"flex shrink-0 flex-col items-center justify-center tabular-nums",
					ordinalWidth(band),
				)}
			>
				{isHero ? (
					<span className="text-teal-800/80" aria-hidden>
						<Crown className="size-3" strokeWidth={1.75} />
					</span>
				) : null}
				<span
					className={cn(
						"font-medium text-muted-foreground/80 leading-none tracking-tight",
						ordinalType(band),
						isHero &&
							"font-[family-name:var(--font-display)] text-teal-950 dark:text-teal-100",
						(band === "podium" || band === "top5") &&
							"font-[family-name:var(--font-display)] text-foreground/90",
					)}
				>
					{ordinal}
				</span>
			</div>

			{/* Cover */}
			<div
				className={cn(
					"relative shrink-0 overflow-hidden rounded-sm bg-muted shadow-sm ring-1 ring-border/40",
					cover.className,
					isHero && "shadow-md shadow-teal-950/10 ring-teal-800/25",
				)}
			>
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt=""
						fill
						className="object-cover"
						sizes={cover.sizes}
					/>
				) : (
					<div className="flex size-full items-center justify-center">
						<Disc3 className="size-3.5 text-muted-foreground/50" />
					</div>
				)}
			</div>

			{/* Title / artist */}
			<div className="min-w-0 flex-1 pr-2">
				<p
					className={cn(
						"truncate leading-tight",
						titleType(band),
						(band === "hero" || band === "podium" || band === "top5") &&
							"font-[family-name:var(--font-display)] tracking-tight",
					)}
				>
					{name}
				</p>
				<p className="truncate text-muted-foreground text-xs leading-tight">
					{artistName}
				</p>
			</div>

			{/* Meta — subdivision opener + listens + year */}
			<div className="ml-auto flex shrink-0 items-center gap-3 pl-2">
				{wowSlot ? (
					<div className="flex min-w-[2.5rem] justify-end">{wowSlot}</div>
				) : null}

				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-400",
						showSaved
							? "opacity-100"
							: "pointer-events-none opacity-0 transition-opacity duration-300",
					)}
				>
					<Check className="size-3" />
					Saved
				</span>

				{subdivisionLabel ? (
					<span
						className="hidden max-w-[10.5rem] truncate text-right font-medium text-[0.65rem] text-muted-foreground/75 tracking-[0.02em] sm:inline"
						title={subdivisionLabel}
					>
						{subdivisionLabel}
					</span>
				) : null}

				{listenCount !== undefined ? (
					<span className="hidden w-7 text-right text-[11px] text-muted-foreground/55 tabular-nums sm:inline">
						{listenCount}×
					</span>
				) : null}

				{releaseYear ? (
					<span className="w-8 text-right text-[11px] text-muted-foreground/55 tabular-nums">
						{releaseYear}
					</span>
				) : null}
			</div>
		</div>
	);
});

export function RankingBoardRowSkeleton({
	band = "top50",
}: {
	band?: OrdinalBand;
}): ReactNode {
	const cover = coverForBand(band);
	return (
		<div className={cn("flex w-full items-center gap-3", padForBand(band))}>
			<div className={cn("flex justify-center", ordinalWidth(band))}>
				<Skeleton className="h-4 w-5" />
			</div>
			<Skeleton className={cn("shrink-0 rounded-sm", cover.className)} />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-3 w-1/3" />
			</div>
			<Skeleton className="h-3 w-8" />
		</div>
	);
}

function coverForBand(band: OrdinalBand): {
	className: string;
	sizes: string;
} {
	// Three visual tiers + a whisper bump for #6–10 vs the long tail.
	switch (band) {
		case "hero":
			return { className: "size-14", sizes: "56px" };
		case "podium":
		case "top5":
			return { className: "size-11", sizes: "44px" };
		case "top10":
			return { className: "size-10", sizes: "40px" };
		default:
			return { className: "size-9", sizes: "36px" };
	}
}

function padForBand(band: OrdinalBand): string {
	switch (band) {
		case "hero":
			return "px-1.5 py-2";
		case "podium":
		case "top5":
			return "px-1.5 py-1.5";
		default:
			return "px-1.5 py-1";
	}
}

function ordinalWidth(band: OrdinalBand): string {
	if (band === "hero") return "w-9";
	if (band === "podium" || band === "top5") return "w-8";
	return "w-7";
}

function ordinalType(band: OrdinalBand): string {
	switch (band) {
		case "hero":
			return "text-xl";
		case "podium":
		case "top5":
			return "text-base";
		default:
			return "text-sm";
	}
}

function titleType(band: OrdinalBand): string {
	switch (band) {
		case "hero":
			return "font-semibold text-base";
		case "podium":
		case "top5":
			return "font-medium text-sm";
		default:
			return "font-medium text-sm";
	}
}

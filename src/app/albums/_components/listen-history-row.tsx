"use client";

import {
	ArrowDownRight,
	ArrowLeftRight,
	ArrowRight,
	ArrowUpRight,
	Disc3,
	ExternalLink,
	Star,
	Tags,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import {
	getRatingColors,
	getTierInfo,
	type SubTier,
} from "~/lib/album-tiers";
import { cn } from "~/lib/utils";
import type { HistoryListen } from "../_utils/types";

export function ListenHistoryRow({
	listen,
	rating,
	showDay,
	onRate,
	onConvert,
	onDelete,
}: {
	listen: HistoryListen;
	rating?: number;
	showDay: boolean;
	onRate: () => void;
	onConvert: () => void;
	onDelete: () => void;
}): ReactNode {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const name = listen.album?.name ?? "Unknown Album";
	const artistName = listen.album?.artistName ?? "Unknown Artist";
	const imageUrl = listen.album?.imageUrl;
	const day = formatListenDay(listen.listenedAt);
	const detailsHref = `/albums/details/${listen.albumId}`;
	const ratingInfo = rating !== undefined ? getTierInfo(rating) : null;

	function closeAnd(action: () => void): void {
		setOpen(false);
		action();
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Actions for ${name}`}
					className={cn(
						"w-full max-w-2xl text-left outline-none transition-colors md:max-w-3xl",
						"hover:bg-muted/30 focus-visible:bg-muted/40 active:bg-muted/40",
						"data-[state=open]:bg-muted/35",
					)}
				>
					{/* Mobile — Aligned stack */}
					<span className="flex items-stretch gap-3 px-1 py-2.5 md:hidden">
						<CoverWithCornerMark
							name={name}
							imageUrl={imageUrl}
							isFirstListen={listen.isFirstListen}
							listenCount={listen.listenCount}
							size="lg"
						/>
						<span className="flex min-h-16 min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
							<span className="min-w-0">
								<span className="line-clamp-2 font-medium text-sm leading-snug">
									{name}
								</span>
								<span className="mt-0.5 block truncate text-muted-foreground text-xs leading-tight">
									{artistName}
								</span>
							</span>
							<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
								{rating !== undefined ? (
									<RatingInk rating={rating} />
								) : (
									<UnrankedQuiet />
								)}
								{listen.isFirstListen ? (
									<span className="text-muted-foreground tabular-nums">
										{listen.listenCount}×
									</span>
								) : null}
								<span className="text-muted-foreground/65">{day.label}</span>
							</span>
						</span>
					</span>

					{/* Desktop — Slim rail */}
					<span className="hidden grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-3 px-1 py-2 md:grid">
						<span className="border-border/55 border-r pt-1 pr-2 text-right">
							{showDay ? (
								<span className="font-medium text-[10px] text-muted-foreground tabular-nums leading-none">
									{day.label}
								</span>
							) : (
								<span className="text-[10px] text-transparent" aria-hidden>
									·
								</span>
							)}
						</span>
						<span className="flex min-w-0 items-center gap-2.5">
							<CoverWithCornerMark
								name={name}
								imageUrl={imageUrl}
								isFirstListen={listen.isFirstListen}
								listenCount={listen.listenCount}
								size="md"
							/>
							<span className="min-w-0 py-0.5">
								<span className="line-clamp-1 font-medium text-sm leading-snug">
									{name}
								</span>
								<span className="mt-0.5 block truncate text-muted-foreground text-xs leading-tight">
									{artistName}
								</span>
							</span>
						</span>
						<span className="pt-1.5 self-start">
							{rating !== undefined ? (
								<RatingInk rating={rating} />
							) : (
								<UnrankedQuiet />
							)}
						</span>
					</span>
				</button>
			</PopoverTrigger>

			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={6}
				collisionPadding={12}
				className="w-[min(100vw-1.5rem,18.5rem)] gap-0 overflow-hidden border-border/80 bg-popover p-0 shadow-lg ring-1 ring-black/5"
			>
				<div className="relative overflow-hidden border-border/60 border-b bg-gradient-to-br from-teal-950/[0.06] via-background to-background px-3.5 pt-3.5 pb-3">
					<div className="flex items-start gap-3">
						<CoverWithCornerMark
							name={name}
							imageUrl={imageUrl}
							isFirstListen={listen.isFirstListen}
							listenCount={listen.listenCount}
							size="md"
						/>
						<div className="min-w-0 flex-1 pt-0.5">
							<p className="line-clamp-2 font-medium text-sm leading-snug">
								{name}
							</p>
							<p className="mt-0.5 truncate text-muted-foreground text-xs">
								{artistName}
							</p>
							<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
								{rating !== undefined ? (
									<RatingInk rating={rating} />
								) : (
									<UnrankedQuiet />
								)}
								<span className="text-muted-foreground/70">{day.label}</span>
							</div>
						</div>
					</div>
				</div>

				<div className="p-1.5">
					<ActionItem
						icon={<Star className="size-3.5" />}
						label={ratingInfo ? "Give a new rating" : "Rate this listen"}
						hint={
							ratingInfo ? `Now ${ratingInfo.tier}` : "Opens ranking drawer"
						}
						onSelect={() => closeAnd(onRate)}
					/>
					<ActionItem
						icon={<ExternalLink className="size-3.5" />}
						label="Album details"
						hint="Full album page"
						onSelect={() => closeAnd(() => router.push(detailsHref))}
					/>
					<ActionItem
						icon={<Tags className="size-3.5" />}
						label="Genre details"
						hint="Genres & descriptors"
						onSelect={() => closeAnd(() => router.push(detailsHref))}
					/>
					<ActionItem
						icon={<ArrowLeftRight className="size-3.5" />}
						label="Convert listen"
						hint="Move date / merge"
						onSelect={() => closeAnd(onConvert)}
					/>
				</div>

				<Separator />

				<div className="p-1.5">
					<ActionItem
						icon={<Trash2 className="size-3.5" />}
						label="Delete listen"
						destructive
						onSelect={() => closeAnd(onDelete)}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function listenDayKey(listenedAt: number): string {
	return formatListenDay(listenedAt).key;
}

function formatListenDay(listenedAt: number): { key: string; label: string } {
	const date = new Date(listenedAt);
	const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	const label = date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
	return { key, label };
}

function Cover({
	name,
	imageUrl,
	size,
}: {
	name: string;
	imageUrl?: string;
	size: "md" | "lg";
}): ReactNode {
	const dim = size === "lg" ? "h-16 w-16" : "h-12 w-12";
	const icon = size === "lg" ? "h-5 w-5" : "h-4 w-4";
	return (
		<div
			className={cn(
				"relative flex-shrink-0 overflow-hidden rounded bg-muted",
				dim,
			)}
		>
			{imageUrl ? (
				<Image
					src={imageUrl}
					alt={name}
					fill
					className="object-cover"
					sizes={size === "lg" ? "64px" : "48px"}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center">
					<Disc3 className={cn(icon, "text-muted-foreground")} />
				</div>
			)}
		</div>
	);
}

function NewOnCover(): ReactNode {
	return (
		<span
			className="pointer-events-none absolute top-0.5 left-0.5 rounded-[3px] bg-teal-600 px-1 py-px font-semibold text-[8px] text-white uppercase tracking-[0.14em] shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-teal-400/50"
			aria-label="First listen"
		>
			New
		</span>
	);
}

function ListenCountOnCover({ count }: { count: number }): ReactNode {
	const milestone =
		count === 20
			? "milestone-20"
			: count === 10
				? "milestone-10"
				: count === 5
					? "milestone-5"
					: "default";

	return (
		<span
			className={cn(
				"pointer-events-none absolute top-0.5 left-0.5 rounded-[3px] px-1 py-px font-semibold text-[8px] tabular-nums tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
				milestone === "default" &&
					"bg-background/90 text-muted-foreground ring-1 ring-border/80",
				milestone === "milestone-5" &&
					"bg-sky-600 text-white ring-1 ring-sky-400/50",
				milestone === "milestone-10" &&
					"bg-violet-600 text-white ring-1 ring-violet-300/60",
				milestone === "milestone-20" &&
					"bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white ring-1 ring-amber-200/70",
			)}
			aria-label={`Listen ${count}`}
		>
			{count}×
		</span>
	);
}

function CoverWithCornerMark({
	name,
	imageUrl,
	isFirstListen,
	listenCount,
	size,
}: {
	name: string;
	imageUrl?: string;
	isFirstListen: boolean;
	listenCount: number;
	size: "md" | "lg";
}): ReactNode {
	return (
		<span className="relative shrink-0">
			<Cover name={name} imageUrl={imageUrl} size={size} />
			{isFirstListen ? (
				<NewOnCover />
			) : (
				<ListenCountOnCover count={listenCount} />
			)}
		</span>
	);
}

function SubTierArrow({ subTier }: { subTier: SubTier }): ReactNode {
	const Icon =
		subTier === "High"
			? ArrowUpRight
			: subTier === "Med"
				? ArrowRight
				: ArrowDownRight;
	return <Icon className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />;
}

function RatingInk({ rating }: { rating: number }): ReactNode {
	const colors = getRatingColors(rating);
	const info = getTierInfo(rating);
	if (!info) {
		return <UnrankedQuiet />;
	}
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 font-medium text-[11px] tracking-tight",
				colors.text,
			)}
		>
			{info.tier}
			<SubTierArrow subTier={info.subTier} />
		</span>
	);
}

function UnrankedQuiet(): ReactNode {
	return (
		<span className="font-medium text-[11px] text-muted-foreground/50 underline decoration-dashed underline-offset-2">
			Rate
		</span>
	);
}

function ActionItem({
	icon,
	label,
	hint,
	destructive = false,
	onSelect,
}: {
	icon: ReactNode;
	label: string;
	hint?: string;
	destructive?: boolean;
	onSelect: () => void;
}): ReactNode {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
				destructive
					? "text-destructive hover:bg-destructive/10"
					: "hover:bg-muted/80",
			)}
		>
			<span
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-md",
					destructive
						? "bg-destructive/10 text-destructive"
						: "bg-muted text-muted-foreground",
				)}
			>
				{icon}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-medium text-[13px] leading-tight">
					{label}
				</span>
				{hint ? (
					<span className="mt-0.5 block truncate text-[10px] text-muted-foreground leading-tight">
						{hint}
					</span>
				) : null}
			</span>
		</button>
	);
}

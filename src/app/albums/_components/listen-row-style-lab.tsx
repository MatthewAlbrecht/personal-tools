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
import type { ReactNode } from "react";
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

type LabListen = {
	id: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	rating?: number;
	listenCount: number;
	isFirstListen: boolean;
	listenedAt: number;
	dayKey: string;
	dayShort: string;
	genres: string[];
};

const LAB_SAMPLES: LabListen[] = [
	{
		id: "1",
		name: "fata morgana",
		artistName: "corto.alto",
		rating: 12,
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 10).getTime(),
		dayKey: "Sep 10",
		dayShort: "10",
		genres: ["Jazz", "Broken Beat"],
	},
	{
		id: "2",
		name: "Curious Objects",
		artistName: "Cyst, Iglooghost",
		rating: 14,
		listenCount: 5,
		isFirstListen: false,
		listenedAt: new Date(2026, 8, 10).getTime(),
		dayKey: "Sep 10",
		dayShort: "10",
		genres: ["Electronic", "IDM"],
	},
	{
		id: "3",
		name: "AGATE",
		artistName: "MEITEI",
		rating: 10,
		listenCount: 2,
		isFirstListen: false,
		listenedAt: new Date(2026, 8, 9).getTime(),
		dayKey: "Sep 9",
		dayShort: "9",
		genres: ["Ambient", "Experimental"],
	},
	{
		id: "4",
		name: "SORB",
		artistName: "MEITEI",
		listenCount: 10,
		isFirstListen: false,
		listenedAt: new Date(2026, 8, 9).getTime(),
		dayKey: "Sep 9",
		dayShort: "9",
		genres: ["Ambient"],
	},
	{
		id: "5",
		name: "SOUL SEEK",
		artistName: "Surfacing",
		rating: 14,
		listenCount: 20,
		isFirstListen: false,
		listenedAt: new Date(2026, 8, 8).getTime(),
		dayKey: "Sep 8",
		dayShort: "8",
		genres: ["Soul", "Electronic"],
	},
];

/**
 * Temporary Listens row style lab. Remove after picking a direction.
 * Mounted above the live list — does not change production rows.
 */
export function ListenRowStyleLab(): ReactNode {
	return (
		<div className="mb-10 space-y-10 rounded-lg border border-teal-800/25 border-dashed bg-teal-800/[0.03] p-4 sm:p-5">
			<div className="space-y-1">
				<p className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
					Temporary · finalists
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm">
					Aligned stack vs Slim rail. Whole row opens an action popover (rate,
					details, genres, convert, delete). No meatball. Live list unchanged.
				</p>
			</div>

			<StyleBlock
				id="B1"
				title="Aligned stack"
				blurb="64px cover, New / milestone Nx chip, title + artist, rating · day docked to cover height. Tap row → actions."
				measure="stacked"
			>
				<StackedAligned rows={LAB_SAMPLES.slice(0, 4)} />
			</StyleBlock>

			<StyleBlock
				id="D1"
				title="Slim rail"
				blurb="Day rail + larger cover with the same corner chip. Rating on the right (sm+) or under title (xs). Tap row → actions."
				measure="day"
			>
				<DaySlimRail rows={LAB_SAMPLES} />
			</StyleBlock>
		</div>
	);
}

function StyleBlock({
	id,
	title,
	blurb,
	measure,
	children,
}: {
	id: string;
	title: string;
	blurb: string;
	measure: "stacked" | "day";
	children: ReactNode;
}): ReactNode {
	return (
		<section className="space-y-3">
			<div>
				<h3 className="font-[family-name:var(--font-display)] text-base tracking-tight sm:text-lg">
					<span className="mr-2 font-sans text-sm text-teal-800/70">{id}</span>
					{title}
				</h3>
				<p className="mt-0.5 max-w-2xl text-muted-foreground text-xs leading-relaxed">
					{blurb}
				</p>
			</div>
			<div
				className={cn(
					"overflow-hidden rounded-md border border-border/70 bg-background",
					measure === "stacked" ? "max-w-2xl" : "max-w-3xl",
				)}
			>
				{children}
			</div>
		</section>
	);
}

function Cover({
	name,
	imageUrl,
	size = "sm",
}: {
	name: string;
	imageUrl?: string;
	size?: "sm" | "md" | "lg";
}): ReactNode {
	const dim =
		size === "lg" ? "h-16 w-16" : size === "md" ? "h-12 w-12" : "h-10 w-10";
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
					sizes={size === "lg" ? "64px" : size === "md" ? "48px" : "40px"}
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
	size = "lg",
}: {
	name: string;
	imageUrl?: string;
	isFirstListen: boolean;
	listenCount: number;
	size?: "sm" | "md" | "lg";
}): ReactNode {
	return (
		<div className="relative shrink-0">
			<Cover name={name} imageUrl={imageUrl} size={size} />
			{isFirstListen ? (
				<NewOnCover />
			) : (
				<ListenCountOnCover count={listenCount} />
			)}
		</div>
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

function RatingInk({
	rating,
	className,
}: {
	rating: number;
	className?: string;
}): ReactNode {
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
				className,
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

function ListenActionPopover({
	row,
	children,
}: {
	row: LabListen;
	children: ReactNode;
}): ReactNode {
	const ratingInfo =
		row.rating !== undefined ? getTierInfo(row.rating) : null;

	return (
		<Popover>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
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
							name={row.name}
							imageUrl={row.imageUrl}
							isFirstListen={row.isFirstListen}
							listenCount={row.listenCount}
							size="md"
						/>
						<div className="min-w-0 flex-1 pt-0.5">
							<p className="line-clamp-2 font-medium text-sm leading-snug">
								{row.name}
							</p>
							<p className="mt-0.5 truncate text-muted-foreground text-xs">
								{row.artistName}
							</p>
							<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
								{row.rating !== undefined ? (
									<RatingInk rating={row.rating} />
								) : (
									<UnrankedQuiet />
								)}
								<span className="text-muted-foreground/70">{row.dayKey}</span>
							</div>
						</div>
					</div>
				</div>

				<div className="p-1.5">
					<ActionItem
						icon={<Star className="size-3.5" />}
						label={ratingInfo ? "Give a new rating" : "Rate this listen"}
						hint={
							ratingInfo
								? `Now ${ratingInfo.tier}`
								: "Opens ranking drawer"
						}
					/>
					<ActionItem
						icon={<ExternalLink className="size-3.5" />}
						label="Album details"
						hint="/albums/details/…"
					/>
					<ActionItem
						icon={<Tags className="size-3.5" />}
						label="Genre details"
						hint={row.genres.join(" · ")}
					/>
					<ActionItem
						icon={<ArrowLeftRight className="size-3.5" />}
						label="Convert listen"
						hint="Move date / merge"
					/>
				</div>

				<Separator />

				<div className="p-1.5">
					<ActionItem
						icon={<Trash2 className="size-3.5" />}
						label="Delete listen"
						destructive
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ActionItem({
	icon,
	label,
	hint,
	destructive = false,
}: {
	icon: ReactNode;
	label: string;
	hint?: string;
	destructive?: boolean;
}): ReactNode {
	return (
		<button
			type="button"
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

/* ─── B1 Aligned stack ─────────────────────────────────────────── */

function StackedAligned({ rows }: { rows: LabListen[] }): ReactNode {
	return (
		<ul className="divide-y divide-border/50">
			{rows.map((row) => (
				<li key={row.id}>
					<ListenActionPopover row={row}>
						<button
							type="button"
							className="flex w-full items-stretch gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 active:bg-muted/40 data-[state=open]:bg-muted/35"
						>
							<CoverWithCornerMark
								name={row.name}
								imageUrl={row.imageUrl}
								isFirstListen={row.isFirstListen}
								listenCount={row.listenCount}
							/>
							<div className="flex min-h-16 min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
								<div className="min-w-0">
									<span className="line-clamp-2 font-medium text-sm leading-snug">
										{row.name}
									</span>
									<p className="mt-0.5 truncate text-muted-foreground text-xs leading-tight">
										{row.artistName}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
									{row.rating !== undefined ? (
										<RatingInk rating={row.rating} />
									) : (
										<UnrankedQuiet />
									)}
									{row.isFirstListen ? (
										<span className="text-muted-foreground tabular-nums">
											{row.listenCount}×
										</span>
									) : null}
									<span className="text-muted-foreground/65">{row.dayKey}</span>
								</div>
							</div>
						</button>
					</ListenActionPopover>
				</li>
			))}
		</ul>
	);
}

/* ─── D1 Slim rail ─────────────────────────────────────────────── */

function DaySlimRail({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showDay = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li
						key={row.id}
						className="border-border/40 border-b last:border-b-0"
					>
						<ListenActionPopover row={row}>
							<button
								type="button"
								className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 active:bg-muted/40 data-[state=open]:bg-muted/35 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-3"
							>
								<div className="self-stretch border-border/55 border-r pr-1.5 text-right sm:pr-2">
									{showDay ? (
										<>
											<span className="font-medium text-[11px] text-muted-foreground tabular-nums leading-none sm:hidden">
												{row.dayShort}
											</span>
											<span className="hidden font-medium text-[10px] text-muted-foreground tabular-nums leading-none sm:inline">
												{row.dayKey}
											</span>
										</>
									) : (
										<span className="text-[10px] text-transparent" aria-hidden>
											·
										</span>
									)}
								</div>
								<span className="flex min-w-0 items-center gap-2.5">
									<CoverWithCornerMark
										name={row.name}
										imageUrl={row.imageUrl}
										isFirstListen={row.isFirstListen}
										listenCount={row.listenCount}
										size="md"
									/>
									<span className="min-w-0">
										<span className="line-clamp-1 font-medium text-sm">
											{row.name}
										</span>
										<span className="mt-0.5 block truncate text-muted-foreground text-xs">
											{row.artistName}
										</span>
										<span className="mt-1 block sm:hidden">
											{row.rating !== undefined ? (
												<RatingInk rating={row.rating} />
											) : (
												<UnrankedQuiet />
											)}
										</span>
									</span>
								</span>
								<span className="hidden self-center sm:inline">
									{row.rating !== undefined ? (
										<RatingInk rating={row.rating} />
									) : (
										<UnrankedQuiet />
									)}
								</span>
							</button>
						</ListenActionPopover>
					</li>
				);
			})}
		</ul>
	);
}

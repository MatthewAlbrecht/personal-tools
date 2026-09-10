"use client";

import {
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	Disc3,
	MoreHorizontal,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
	},
	{
		id: "2",
		name: "Curious Objects",
		artistName: "Cyst, Iglooghost",
		rating: 14,
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 10).getTime(),
		dayKey: "Sep 10",
		dayShort: "10",
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
	},
	{
		id: "4",
		name: "SORB",
		artistName: "MEITEI",
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 9).getTime(),
		dayKey: "Sep 9",
		dayShort: "9",
	},
	{
		id: "5",
		name: "SOUL SEEK",
		artistName: "Surfacing",
		rating: 14,
		listenCount: 3,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 8).getTime(),
		dayKey: "Sep 8",
		dayShort: "8",
	},
];

/**
 * Temporary Listens row style lab. Remove after picking a direction.
 * Mounted above the live list — does not change production rows.
 */
export function ListenRowStyleLab(): ReactNode {
	const stacked = LAB_SAMPLES.slice(0, 4);
	const dayed = LAB_SAMPLES;

	return (
		<div className="mb-10 space-y-10 rounded-lg border border-teal-800/25 border-dashed bg-teal-800/[0.03] p-4 sm:p-5">
			<div className="space-y-1">
				<p className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
					Temporary · B / D variants
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm">
					You liked Stacked and Day column. Below: three mobile-first takes of
					each. Lists are capped ({`Stacked max-w-2xl`} · {`Day max-w-3xl`}),
					left-aligned — no dead space to a far-right menu. Live list unchanged.
				</p>
			</div>

			<section className="space-y-6">
				<header className="space-y-0.5">
					<h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
						B · Stacked
					</h2>
					<p className="text-muted-foreground text-xs">
						Cover + two-line text. Optimized for thumb width and no early
						truncation.
					</p>
				</header>

				<StyleBlock
					id="B1"
					title="Aligned stack"
					blurb="64px cover with corner chip: New on first listen, Nx when it’s a repeat. Title/artist top; rating · day bottom. Menu always reachable."
					measure="stacked"
				>
					<StackedAligned rows={stacked} />
				</StyleBlock>

				<StyleBlock
					id="B2"
					title="Day bands + dock"
					blurb="Day lives in sticky-feeling section headers (saves row clutter). Meta docks under a hairline; rating ink + Nx only. Best when scanning a week."
					measure="stacked"
				>
					<StackedDayBands rows={stacked} />
				</StyleBlock>

				<StyleBlock
					id="B3"
					title="Priority rate"
					blurb="Rating sits top-right (primary action on mobile). Title keeps full width below. Nx + day whisper under artist. Cover still owns New."
					measure="stacked"
				>
					<StackedPriorityRate rows={stacked} />
				</StyleBlock>
			</section>

			<section className="space-y-6">
				<header className="space-y-0.5">
					<h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
						D · Day column
					</h2>
					<p className="text-muted-foreground text-xs">
						Date as structure. Mobile gets a shorter day glyph or a full band so
						album text isn’t crushed.
					</p>
				</header>

				<StyleBlock
					id="D1"
					title="Slim rail"
					blurb="Narrow left day rail. On xs the rail shows day number only; sm+ shows Sep 10. Rating stacks under title on the narrowest widths so the right edge stays menu-only."
					measure="day"
				>
					<DaySlimRail rows={dayed} />
				</StyleBlock>

				<StyleBlock
					id="D2"
					title="Banded days"
					blurb="No left column — day is a full-width band. Rows reclaim horizontal space for title + rating. Cleanest on phones."
					measure="day"
				>
					<DayBanded rows={dayed} />
				</StyleBlock>

				<StyleBlock
					id="D3"
					title="Calendar stub"
					blurb="Two-line day stub (weekday + date) on the left — denser scan cue. Cover gets New chip. Right column is rating ink + menu only; Nx tucks under artist."
					measure="day"
				>
					<DayCalendarStub rows={dayed} />
				</StyleBlock>
			</section>
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
	/** Reading measure — left-aligned so it still tracks the filter rail. */
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
			className="pointer-events-none absolute top-0.5 left-0.5 rounded-[3px] bg-teal-950/90 px-1 py-px font-semibold text-[8px] text-teal-100 uppercase tracking-[0.14em] shadow-[0_1px_2px_rgba(0,0,0,0.45)] ring-1 ring-teal-300/25"
			aria-label="First listen"
		>
			New
		</span>
	);
}

function ListenCountOnCover({ count }: { count: number }): ReactNode {
	return (
		<span
			className="pointer-events-none absolute top-0.5 left-0.5 rounded-[3px] bg-slate-950/85 px-1 py-px font-semibold text-[8px] text-slate-100 tabular-nums tracking-wide shadow-[0_1px_2px_rgba(0,0,0,0.45)] ring-1 ring-white/15"
			aria-label={`Listen ${count}`}
		>
			{count}×
		</span>
	);
}

function CoverWithNew({
	name,
	imageUrl,
	isFirstListen,
	size = "lg",
}: {
	name: string;
	imageUrl?: string;
	isFirstListen: boolean;
	size?: "sm" | "md" | "lg";
}): ReactNode {
	return (
		<div className="relative shrink-0">
			<Cover name={name} imageUrl={imageUrl} size={size} />
			{isFirstListen ? <NewOnCover /> : null}
		</div>
	);
}

/** B1: New on first listen, otherwise listen ordinal chip in the same corner. */
function CoverWithCornerMark({
	name,
	imageUrl,
	isFirstListen,
	listenCount,
}: {
	name: string;
	imageUrl?: string;
	isFirstListen: boolean;
	listenCount: number;
}): ReactNode {
	return (
		<div className="relative shrink-0">
			<Cover name={name} imageUrl={imageUrl} size="lg" />
			{isFirstListen ? (
				<NewOnCover />
			) : (
				<ListenCountOnCover count={listenCount} />
			)}
		</div>
	);
}

function RowMenu(): ReactNode {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-9 w-9 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
					aria-label="More options"
				>
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem>Convert listen</DropdownMenuItem>
				<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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
			title="Opens ranking drawer"
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

function MetaDot(): ReactNode {
	return <span className="text-border">·</span>;
}

function weekdayStub(dayKey: string): string {
	if (dayKey === "Sep 10") return "Wed";
	if (dayKey === "Sep 9") return "Tue";
	if (dayKey === "Sep 8") return "Mon";
	return "Day";
}

/* ─── B1 Aligned stack ─────────────────────────────────────────── */

function StackedAligned({ rows }: { rows: LabListen[] }): ReactNode {
	return (
		<ul className="divide-y divide-border/50">
			{rows.map((row) => (
				<li key={row.id} className="px-3 py-2.5 active:bg-muted/40 sm:hover:bg-muted/30">
					<div className="flex items-stretch gap-3">
						<CoverWithCornerMark
							name={row.name}
							imageUrl={row.imageUrl}
							isFirstListen={row.isFirstListen}
							listenCount={row.listenCount}
						/>
						<div className="flex min-h-16 min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
							<div className="flex items-start gap-1">
								<button type="button" className="min-w-0 flex-1 text-left">
									<span className="line-clamp-2 font-medium text-sm leading-snug">
										{row.name}
									</span>
									<p className="mt-0.5 truncate text-muted-foreground text-xs leading-tight">
										{row.artistName}
									</p>
								</button>
								<RowMenu />
							</div>
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
								{row.rating !== undefined ? (
									<button type="button" className="text-left">
										<RatingInk rating={row.rating} />
									</button>
								) : (
									<button type="button">
										<UnrankedQuiet />
									</button>
								)}
								{row.isFirstListen ? (
									<span className="text-muted-foreground tabular-nums">
										{row.listenCount}×
									</span>
								) : null}
								<span className="text-muted-foreground/65">{row.dayKey}</span>
							</div>
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}

/* ─── B2 Day bands + dock ──────────────────────────────────────── */

function StackedDayBands({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showBand = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li key={row.id}>
						{showBand ? (
							<div className="sticky top-0 z-[1] flex items-center gap-2 border-border/60 border-y bg-muted/40 px-3 py-1.5 backdrop-blur-sm">
								<span className="font-medium text-[10px] text-foreground/70 uppercase tracking-[0.14em]">
									{row.dayKey}
								</span>
								<Separator className="flex-1" />
							</div>
						) : null}
						<div className="flex items-stretch gap-3 px-3 py-2.5 active:bg-muted/40 sm:hover:bg-muted/25">
							<CoverWithNew
								name={row.name}
								imageUrl={row.imageUrl}
								isFirstListen={row.isFirstListen}
							/>
							<div className="flex min-h-16 min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
								<div className="flex items-start gap-1">
									<button type="button" className="min-w-0 flex-1 text-left">
										<span className="line-clamp-2 font-medium text-sm leading-snug">
											{row.name}
										</span>
										<p className="mt-0.5 truncate text-muted-foreground text-xs">
											{row.artistName}
										</p>
									</button>
									<RowMenu />
								</div>
								<div className="space-y-1.5">
									<Separator className="opacity-60" />
									<div className="flex items-center gap-2.5 text-[11px]">
										{row.rating !== undefined ? (
											<button type="button">
												<RatingInk rating={row.rating} />
											</button>
										) : (
											<button type="button">
												<UnrankedQuiet />
											</button>
										)}
										<span className="text-muted-foreground tabular-nums">
											{row.listenCount}×
										</span>
									</div>
								</div>
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/* ─── B3 Priority rate ─────────────────────────────────────────── */

function StackedPriorityRate({ rows }: { rows: LabListen[] }): ReactNode {
	return (
		<ul className="divide-y divide-border/50">
			{rows.map((row) => (
				<li key={row.id} className="px-3 py-2.5 active:bg-muted/40 sm:hover:bg-muted/30">
					<div className="flex gap-3">
						<CoverWithNew
							name={row.name}
							imageUrl={row.imageUrl}
							isFirstListen={row.isFirstListen}
							size="md"
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex items-start justify-between gap-2">
								{row.rating !== undefined ? (
									<button type="button" className="min-w-0 text-left">
										<RatingInk
											rating={row.rating}
											className="text-xs sm:text-[11px]"
										/>
									</button>
								) : (
									<button type="button">
										<UnrankedQuiet />
									</button>
								)}
								<div className="flex items-center gap-0.5">
									<span className="pr-1 text-[10px] text-muted-foreground tabular-nums">
										{row.listenCount}×
									</span>
									<RowMenu />
								</div>
							</div>
							<button type="button" className="block w-full min-w-0 text-left">
								<span className="line-clamp-2 font-medium text-sm leading-snug">
									{row.name}
								</span>
								<p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
									<span className="truncate">{row.artistName}</span>
									<MetaDot />
									<span className="shrink-0 text-muted-foreground/70">
										{row.dayKey}
									</span>
								</p>
							</button>
						</div>
					</div>
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
						className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-border/40 border-b px-2 py-2 last:border-b-0 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-3"
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
						<button
							type="button"
							className="flex min-w-0 items-center gap-2.5 text-left"
						>
							<CoverWithNew
								name={row.name}
								imageUrl={row.imageUrl}
								isFirstListen={row.isFirstListen}
								size="sm"
							/>
							<span className="min-w-0">
								<span className="line-clamp-1 font-medium text-sm">
									{row.name}
								</span>
								<span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
									<span className="truncate">{row.artistName}</span>
									<span className="tabular-nums text-muted-foreground/70 sm:hidden">
										· {row.listenCount}×
									</span>
								</span>
								<span className="mt-1 block sm:hidden">
									{row.rating !== undefined ? (
										<RatingInk rating={row.rating} />
									) : (
										<UnrankedQuiet />
									)}
								</span>
							</span>
						</button>
						<div className="flex items-center gap-1 self-center">
							<div className="hidden flex-col items-end gap-0.5 sm:flex">
								{row.rating !== undefined ? (
									<RatingInk rating={row.rating} />
								) : (
									<UnrankedQuiet />
								)}
								<span className="text-[10px] text-muted-foreground tabular-nums">
									{row.listenCount}×
								</span>
							</div>
							<RowMenu />
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/* ─── D2 Banded days ───────────────────────────────────────────── */

function DayBanded({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showBand = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li key={row.id}>
						{showBand ? (
							<div className="flex items-baseline justify-between gap-3 border-border/50 border-b bg-muted/35 px-3 py-1.5">
								<span className="font-medium text-[10px] text-foreground/75 uppercase tracking-[0.14em]">
									{row.dayKey}
								</span>
								<span className="text-[10px] text-muted-foreground/70">
									{weekdayStub(row.dayKey)}
								</span>
							</div>
						) : null}
						<div className="flex items-center gap-2.5 border-border/35 border-b px-3 py-2 last:border-b-0 active:bg-muted/35 sm:gap-3 sm:hover:bg-muted/25">
							<CoverWithNew
								name={row.name}
								imageUrl={row.imageUrl}
								isFirstListen={row.isFirstListen}
								size="md"
							/>
							<button type="button" className="min-w-0 flex-1 text-left">
								<span className="line-clamp-1 font-medium text-sm">
									{row.name}
								</span>
								<span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
									<span className="truncate">{row.artistName}</span>
									<MetaDot />
									<span className="shrink-0 tabular-nums">
										{row.listenCount}×
									</span>
								</span>
							</button>
							<div className="flex shrink-0 items-center gap-0.5">
								{row.rating !== undefined ? (
									<button type="button" className="px-1">
										<RatingInk rating={row.rating} />
									</button>
								) : (
									<button type="button" className="px-1">
										<UnrankedQuiet />
									</button>
								)}
								<RowMenu />
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/* ─── D3 Calendar stub ─────────────────────────────────────────── */

function DayCalendarStub({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showDay = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li
						key={row.id}
						className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 border-border/40 border-b px-2 py-2 last:border-b-0 sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-3"
					>
						<div
							className={cn(
								"flex self-stretch flex-col items-end justify-start border-border/55 border-r pr-2 pt-0.5",
								!showDay && "opacity-0",
							)}
							aria-hidden={!showDay}
						>
							<span className="font-medium text-[9px] text-muted-foreground/80 uppercase tracking-[0.12em] leading-none">
								{weekdayStub(row.dayKey)}
							</span>
							<span className="mt-1 font-[family-name:var(--font-display)] text-base text-foreground/85 tabular-nums leading-none">
								{row.dayShort}
							</span>
						</div>
						<button
							type="button"
							className="flex min-w-0 items-center gap-2.5 text-left"
						>
							<CoverWithNew
								name={row.name}
								imageUrl={row.imageUrl}
								isFirstListen={row.isFirstListen}
								size="md"
							/>
							<span className="min-w-0">
								<span className="line-clamp-1 font-medium text-sm">
									{row.name}
								</span>
								<span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
									<span className="truncate">{row.artistName}</span>
									<MetaDot />
									<span className="shrink-0 tabular-nums">
										{row.listenCount}×
									</span>
								</span>
							</span>
						</button>
						<div className="flex items-center gap-0.5">
							{row.rating !== undefined ? (
								<button
									type="button"
									className="hidden max-w-[7.5rem] px-1 text-right sm:inline-flex"
								>
									<RatingInk rating={row.rating} />
								</button>
							) : (
								<button
									type="button"
									className="hidden px-1 sm:inline-flex"
								>
									<UnrankedQuiet />
								</button>
							)}
							{/* On mobile, rating sits in a second row via absolute? Keep compact: show under menu column */}
							<div className="flex flex-col items-end gap-1 sm:contents">
								<span className="sm:hidden">
									{row.rating !== undefined ? (
										<button type="button">
											<RatingInk rating={row.rating} />
										</button>
									) : (
										<button type="button">
											<UnrankedQuiet />
										</button>
									)}
								</span>
								<RowMenu />
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

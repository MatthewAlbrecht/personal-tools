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
import {
	getRatingColors,
	getTierInfo,
	getTierShortLabel,
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
};

const LAB_SAMPLES: LabListen[] = [
	{
		id: "1",
		name: "fata morgana",
		artistName: "corto.alto",
		rating: 11,
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 10).getTime(),
		dayKey: "Sep 10",
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
	},
	{
		id: "3",
		name: "AGATE",
		artistName: "MEITEI",
		rating: 11,
		listenCount: 2,
		isFirstListen: false,
		listenedAt: new Date(2026, 8, 9).getTime(),
		dayKey: "Sep 9",
	},
	{
		id: "4",
		name: "SORB",
		artistName: "MEITEI",
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 9).getTime(),
		dayKey: "Sep 9",
	},
	{
		id: "5",
		name: "SOUL SEEK",
		artistName: "Surfacing",
		rating: 14,
		listenCount: 1,
		isFirstListen: true,
		listenedAt: new Date(2026, 8, 8).getTime(),
		dayKey: "Sep 8",
	},
];

/**
 * Temporary Listens row style lab. Remove after picking a direction.
 * Mounted above the live list — does not change production rows.
 */
export function ListenRowStyleLab(): ReactNode {
	return (
		<div className="mb-10 space-y-8 rounded-lg border border-teal-800/25 border-dashed bg-teal-800/[0.03] p-4 sm:p-5">
			<div className="space-y-1">
				<p className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
					Temporary · row style lab
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm">
					Four directions for Listens rows. Live list below is unchanged. Three
					dots today: Convert listen + Delete. Rating opens the ranking drawer;
					album details live at{" "}
					<code className="text-xs">/albums/details/[id]</code>.
				</p>
			</div>

			<StyleBlock
				id="A"
				title="Ledger"
				blurb="Close the desktop gap with a tight grid. Rating as colored ink (no pill). Day hairlines. Title = details; menu on hover."
			>
				<StyleLedger rows={LAB_SAMPLES.slice(0, 4)} />
			</StyleBlock>

			<StyleBlock
				id="B"
				title="Stacked"
				blurb="Mobile-first: title gets the width; rating · Nx · date sit on a second line under the artist so nothing truncates early."
			>
				<StyleStacked rows={LAB_SAMPLES.slice(0, 4)} />
			</StyleBlock>

			<StyleBlock
				id="C"
				title="Signal rail"
				blurb="Left color rail = tier. Short rating code instead of full pill. Cover a touch larger. Date stays quiet on the right."
			>
				<StyleSignalRail rows={LAB_SAMPLES.slice(0, 4)} />
			</StyleBlock>

			<StyleBlock
				id="D"
				title="Day column"
				blurb="Date as a thin left column (your divider idea, vertical). Middle is album; right is only rating + menu. Good for scan-by-day."
			>
				<StyleDayColumn rows={LAB_SAMPLES.slice(0, 5)} />
			</StyleBlock>
		</div>
	);
}

function StyleBlock({
	id,
	title,
	blurb,
	children,
}: {
	id: string;
	title: string;
	blurb: string;
	children: ReactNode;
}): ReactNode {
	return (
		<section className="space-y-3">
			<div>
				<h3 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
					<span className="mr-2 text-sm text-teal-800/70">{id}</span>
					{title}
				</h3>
				<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
					{blurb}
				</p>
			</div>
			<div className="overflow-hidden rounded-md border border-border/70 bg-background">
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
		size === "lg" ? "h-16 w-16" : size === "md" ? "h-11 w-11" : "h-9 w-9";
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
					sizes={size === "lg" ? "64px" : "44px"}
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

function StackedCover({
	name,
	imageUrl,
	isFirstListen,
}: {
	name: string;
	imageUrl?: string;
	isFirstListen: boolean;
}): ReactNode {
	return (
		<div className="relative shrink-0">
			<Cover name={name} imageUrl={imageUrl} size="lg" />
			{isFirstListen ? <NewOnCover /> : null}
		</div>
	);
}

function NewMark(): ReactNode {
	return (
		<span className="shrink-0 font-medium text-[10px] text-teal-800/70 tracking-wide">
			New
		</span>
	);
}

function MenuGhost(): ReactNode {
	return (
		<button
			type="button"
			className="rounded-md p-1.5 text-muted-foreground/35 transition-colors hover:bg-muted hover:text-muted-foreground"
			aria-label="More options (Convert / Delete)"
			title="Convert listen · Delete"
		>
			<MoreHorizontal className="h-4 w-4" />
		</button>
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
		return (
			<span className="font-medium text-[11px] text-muted-foreground/50">
				Unrated
			</span>
		);
	}
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 font-medium text-[11px] tracking-tight",
				colors.text,
			)}
			title="Opens ranking drawer"
		>
			{info.tier}
			<SubTierArrow subTier={info.subTier} />
		</span>
	);
}

function RatingCode({ rating }: { rating: number }): ReactNode {
	const colors = getRatingColors(rating);
	const label = getTierShortLabel(rating).replace(/ [↗→↘]$/, "");
	const code = label
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase();
	return (
		<span
			className={cn(
				"font-semibold text-[11px] tracking-tight tabular-nums",
				colors.text,
			)}
			title={getTierShortLabel(rating)}
		>
			{code}
		</span>
	);
}

function UnrankedQuiet(): ReactNode {
	return (
		<span className="font-medium text-[11px] text-muted-foreground/50">
			Rate
		</span>
	);
}

/** A — Ledger: grid, ink rating, day hairlines */
function StyleLedger({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showDayRule = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li key={row.id}>
						{showDayRule ? (
							<div className="flex items-center gap-3 px-3 pt-3 pb-1">
								<span className="font-medium text-[10px] text-muted-foreground tabular-nums tracking-wide">
									{row.dayKey}
								</span>
								<div className="h-px flex-1 bg-border/70" />
							</div>
						) : null}
						<div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0 px-3 py-2 hover:bg-muted/40 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
							<Cover name={row.name} imageUrl={row.imageUrl} />
							<button
								type="button"
								className="min-w-0 text-left"
								title="Open album details"
							>
								<div className="flex min-w-0 items-baseline gap-2">
									<span className="truncate font-medium text-sm">
										{row.name}
									</span>
									{row.isFirstListen ? <NewMark /> : null}
								</div>
								<p className="truncate text-muted-foreground text-xs">
									{row.artistName}
								</p>
							</button>
							<div className="hidden justify-self-end sm:block">
								{row.rating !== undefined ? (
									<RatingInk rating={row.rating} />
								) : (
									<UnrankedQuiet />
								)}
							</div>
							<span className="hidden text-muted-foreground text-xs tabular-nums sm:inline">
								{row.listenCount}×
							</span>
							<div className="flex items-center gap-1 justify-self-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
								<span className="text-[10px] text-muted-foreground tabular-nums sm:hidden">
									{row.listenCount}×
								</span>
								<MenuGhost />
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/** B — Stacked: title full width, meta under */
function StyleStacked({ rows }: { rows: LabListen[] }): ReactNode {
	return (
		<ul className="divide-y divide-border/50">
			{rows.map((row) => (
				<li key={row.id} className="px-3 py-2.5 hover:bg-muted/30">
					<div className="flex items-stretch gap-3">
						<StackedCover
							name={row.name}
							imageUrl={row.imageUrl}
							isFirstListen={row.isFirstListen}
						/>
						<div className="flex min-h-16 min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
							<div className="flex items-start justify-between gap-2">
								<button type="button" className="min-w-0 text-left">
									<span className="font-medium text-sm leading-tight">
										{row.name}
									</span>
									<p className="mt-0.5 text-muted-foreground text-xs leading-tight">
										{row.artistName}
									</p>
								</button>
								<MenuGhost />
							</div>
							<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
								{row.rating !== undefined ? (
									<RatingInk rating={row.rating} />
								) : (
									<UnrankedQuiet />
								)}
								<span className="text-muted-foreground tabular-nums">
									{row.listenCount}×
								</span>
								<span className="text-muted-foreground/70">{row.dayKey}</span>
							</div>
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}

/** C — Signal rail: left tier color, compact code */
function StyleSignalRail({ rows }: { rows: LabListen[] }): ReactNode {
	return (
		<ul>
			{rows.map((row) => {
				const colors =
					row.rating !== undefined ? getRatingColors(row.rating) : null;
				return (
					<li
						key={row.id}
						className="group flex items-stretch gap-0 border-border/40 border-b last:border-b-0"
					>
						<div
							className={cn(
								"w-0 shrink-0 border-l-[3px]",
								colors?.border ?? "border-border",
							)}
							aria-hidden
						/>
						<div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-muted/30">
							<Cover name={row.name} imageUrl={row.imageUrl} size="md" />
							<button type="button" className="min-w-0 flex-1 text-left">
								<div className="flex min-w-0 items-baseline gap-2">
									<span className="truncate font-medium text-sm">
										{row.name}
									</span>
									{row.isFirstListen ? <NewMark /> : null}
								</div>
								<p className="truncate text-muted-foreground text-xs">
									{row.artistName}
									<span className="mx-1.5 text-border">·</span>
									<span className="tabular-nums">{row.listenCount}×</span>
								</p>
							</button>
							<div className="flex shrink-0 items-center gap-2">
								{row.rating !== undefined ? (
									<RatingCode rating={row.rating} />
								) : (
									<UnrankedQuiet />
								)}
								<span className="hidden w-12 text-right text-[11px] text-muted-foreground tabular-nums sm:inline">
									{row.dayKey}
								</span>
								<MenuGhost />
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/** D — Day column: date left, album center, sparse right */
function StyleDayColumn({ rows }: { rows: LabListen[] }): ReactNode {
	let lastDay = "";
	return (
		<ul>
			{rows.map((row) => {
				const showDay = row.dayKey !== lastDay;
				lastDay = row.dayKey;
				return (
					<li
						key={row.id}
						className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2 border-border/40 border-b px-2 py-2 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-3"
					>
						<div className="self-stretch border-border/60 border-r pr-2 text-right">
							{showDay ? (
								<span className="font-medium text-[10px] text-muted-foreground tabular-nums leading-none">
									{row.dayKey.replace("Sep ", "9/")}
								</span>
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
							<Cover name={row.name} imageUrl={row.imageUrl} />
							<span className="min-w-0">
								<span className="flex min-w-0 items-baseline gap-1.5">
									<span className="truncate font-medium text-sm">
										{row.name}
									</span>
									{row.isFirstListen ? <NewMark /> : null}
								</span>
								<span className="block truncate text-muted-foreground text-xs">
									{row.artistName}
								</span>
							</span>
						</button>
						<div className="flex items-center gap-1.5 sm:gap-2">
							{row.rating !== undefined ? (
								<RatingInk rating={row.rating} />
							) : (
								<UnrankedQuiet />
							)}
							<span className="text-[10px] text-muted-foreground tabular-nums">
								{row.listenCount}×
							</span>
							<MenuGhost />
						</div>
					</li>
				);
			})}
		</ul>
	);
}

"use client";

import { RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "~/lib/utils";

type LabFilterState = {
	grouping: "week" | "month";
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	year: string;
};

const INITIAL: LabFilterState = {
	grouping: "month",
	onlyUnranked: false,
	onlyFirstListens: true,
	year: "2026",
};

/**
 * Temporary filter-rail style lab. Remove after picking a direction.
 * Does not change the live filters.
 */
export function ListensFilterStyleLab(): ReactNode {
	return (
		<div className="mb-10 space-y-4 rounded-lg border border-teal-800/25 border-dashed bg-teal-800/[0.03] p-4 sm:p-5">
			<div className="space-y-1">
				<p className="font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
					Temporary · filter rail lab
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm">
					Live filters unchanged. Each card is a ~12rem rail mock — one type
					system, one active language, spacing instead of rules where possible.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<LabCard
					id="F1"
					title="Quiet stack"
					blurb="One micro-label voice. Spacing only. Shared teal ink for every active."
				>
					<QuietStack />
				</LabCard>
				<LabCard
					id="F2"
					title="Segment + checks"
					blurb="Week/Month as a true segment. Filters as compact check rows — not big cards."
				>
					<SegmentChecks />
				</LabCard>
				<LabCard
					id="F3"
					title="Ink toggles"
					blurb="No filled blocks. Active = teal underline / weight. Year is a whisper field."
				>
					<InkToggles />
				</LabCard>
				<LabCard
					id="F4"
					title="Studio strip"
					blurb="Drops the FILTERS eyebrow. Section titles do the work. Sync is a single quiet line."
				>
					<StudioStrip />
				</LabCard>
			</div>
		</div>
	);
}

function LabCard({
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
		<section className="space-y-2.5">
			<div>
				<h3 className="font-[family-name:var(--font-display)] text-base tracking-tight">
					<span className="mr-2 font-sans text-sm text-teal-800/70">{id}</span>
					{title}
				</h3>
				<p className="mt-0.5 text-muted-foreground text-[11px] leading-relaxed">
					{blurb}
				</p>
			</div>
			<div className="w-full max-w-[12rem] overflow-hidden rounded-md border border-border/70 bg-background p-3">
				{children}
			</div>
		</section>
	);
}

function useLabFilters(): [
	LabFilterState,
	{
		setGrouping: (g: "week" | "month") => void;
		toggleUnranked: () => void;
		toggleFirst: () => void;
		setYear: (y: string) => void;
	},
] {
	const [state, setState] = useState<LabFilterState>(INITIAL);
	return [
		state,
		{
			setGrouping: (grouping) => setState((s) => ({ ...s, grouping })),
			toggleUnranked: () =>
				setState((s) => ({ ...s, onlyUnranked: !s.onlyUnranked })),
			toggleFirst: () =>
				setState((s) => ({ ...s, onlyFirstListens: !s.onlyFirstListens })),
			setYear: (year) => setState((s) => ({ ...s, year })),
		},
	];
}

function MicroLabel({ children }: { children: ReactNode }): ReactNode {
	return (
		<p className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
			{children}
		</p>
	);
}

function SyncFoot({ tone = "quiet" }: { tone?: "quiet" | "stale" }): ReactNode {
	return (
		<div className="mt-5 flex flex-col gap-1">
			<p
				className={cn(
					"text-[0.65rem] tracking-wide",
					tone === "stale" ? "text-amber-800" : "text-muted-foreground",
				)}
			>
				<span className="font-medium uppercase tracking-[0.12em]">Synced</span>{" "}
				<span className="tabular-nums">118d ago</span>
			</p>
			<button
				type="button"
				className={cn(
					"inline-flex w-fit items-center gap-1.5 text-xs transition-colors",
					tone === "stale"
						? "font-medium text-amber-900 hover:text-amber-950"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<RefreshCw className="h-3 w-3" />
				Sync now
			</button>
		</div>
	);
}

/* ─── F1 Quiet stack ───────────────────────────────────────────── */

function QuietStack(): ReactNode {
	const [s, a] = useLabFilters();
	return (
		<div className="flex flex-col">
			<p className="mb-4 font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
				Filters
			</p>

			<div className="space-y-5">
				<div>
					<MicroLabel>Group by</MicroLabel>
					<div className="grid grid-cols-2 gap-1">
						{(["week", "month"] as const).map((g) => (
							<button
								key={g}
								type="button"
								aria-pressed={s.grouping === g}
								onClick={() => a.setGrouping(g)}
								className={cn(
									"rounded-md px-2 py-1.5 text-xs capitalize transition-colors",
									s.grouping === g
										? "bg-teal-800 text-teal-50"
										: "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{g}
							</button>
						))}
					</div>
				</div>

				<div>
					<MicroLabel>Show</MicroLabel>
					<div className="flex flex-col gap-1">
						<QuietChip
							pressed={s.onlyUnranked}
							onClick={a.toggleUnranked}
							label="Only unranked"
						/>
						<QuietChip
							pressed={s.onlyFirstListens}
							onClick={a.toggleFirst}
							label="Only first listens"
						/>
					</div>
				</div>

				<div>
					<MicroLabel>Release year</MicroLabel>
					<input
						value={s.year}
						onChange={(e) => a.setYear(e.target.value)}
						className="h-8 w-full rounded-md border border-border/80 bg-background px-2 text-xs tabular-nums outline-none focus-visible:border-teal-800/40 focus-visible:ring-1 focus-visible:ring-teal-800/20"
					/>
				</div>
			</div>

			<SyncFoot tone="stale" />
		</div>
	);
}

function QuietChip({
	pressed,
	onClick,
	label,
}: {
	pressed: boolean;
	onClick: () => void;
	label: string;
}): ReactNode {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onClick}
			className={cn(
				"w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors",
				pressed
					? "bg-teal-800 text-teal-50"
					: "bg-muted/50 text-foreground hover:bg-muted",
			)}
		>
			{label}
		</button>
	);
}

/* ─── F2 Segment + checks ──────────────────────────────────────── */

function SegmentChecks(): ReactNode {
	const [s, a] = useLabFilters();
	return (
		<div className="flex flex-col">
			<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
				Filters
			</p>

			<div className="space-y-5">
				<div>
					<MicroLabel>Group by</MicroLabel>
					<div
						className="flex rounded-md bg-muted/80 p-0.5"
						role="group"
						aria-label="Group by"
					>
						{(["week", "month"] as const).map((g) => (
							<button
								key={g}
								type="button"
								aria-pressed={s.grouping === g}
								onClick={() => a.setGrouping(g)}
								className={cn(
									"flex-1 rounded-[5px] py-1.5 text-xs capitalize transition-all",
									s.grouping === g
										? "bg-background font-medium text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{g}
							</button>
						))}
					</div>
				</div>

				<div>
					<MicroLabel>Narrow</MicroLabel>
					<div className="flex flex-col gap-0.5">
						<CheckRow
							pressed={s.onlyUnranked}
							onClick={a.toggleUnranked}
							label="Only unranked"
						/>
						<CheckRow
							pressed={s.onlyFirstListens}
							onClick={a.toggleFirst}
							label="Only first listens"
						/>
					</div>
				</div>

				<div>
					<MicroLabel>Release year</MicroLabel>
					<input
						value={s.year}
						onChange={(e) => a.setYear(e.target.value)}
						className="h-8 w-full rounded-md border border-border/80 bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"
					/>
				</div>
			</div>

			<SyncFoot />
		</div>
	);
}

function CheckRow({
	pressed,
	onClick,
	label,
}: {
	pressed: boolean;
	onClick: () => void;
	label: string;
}): ReactNode {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onClick}
			className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
		>
			<span
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
					pressed
						? "border-teal-800 bg-teal-800 text-teal-50"
						: "border-border bg-background",
				)}
				aria-hidden
			>
				{pressed ? (
					<svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-current">
						<title>Checked</title>
						<path
							d="M2.5 6.2 4.8 8.5 9.5 3.5"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				) : null}
			</span>
			<span className={cn(pressed ? "font-medium text-foreground" : "text-foreground/80")}>
				{label}
			</span>
		</button>
	);
}

/* ─── F3 Ink toggles ───────────────────────────────────────────── */

function InkToggles(): ReactNode {
	const [s, a] = useLabFilters();
	return (
		<div className="flex flex-col">
			<p className="mb-3 font-[family-name:var(--font-display)] text-lg tracking-tight text-foreground">
				Filters
			</p>

			<div className="space-y-5">
				<div>
					<MicroLabel>Group by</MicroLabel>
					<div className="flex gap-3">
						{(["week", "month"] as const).map((g) => (
							<button
								key={g}
								type="button"
								aria-pressed={s.grouping === g}
								onClick={() => a.setGrouping(g)}
								className={cn(
									"pb-0.5 text-sm capitalize transition-colors",
									s.grouping === g
										? "border-teal-800 border-b-2 font-medium text-teal-900"
										: "border-transparent border-b-2 text-muted-foreground hover:text-foreground",
								)}
							>
								{g}
							</button>
						))}
					</div>
				</div>

				<div>
					<MicroLabel>Show</MicroLabel>
					<div className="flex flex-col items-start gap-2">
						<button
							type="button"
							aria-pressed={s.onlyUnranked}
							onClick={a.toggleUnranked}
							className={cn(
								"text-left text-sm transition-colors",
								s.onlyUnranked
									? "font-medium text-teal-900"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{s.onlyUnranked ? "●" : "○"} Only unranked
						</button>
						<button
							type="button"
							aria-pressed={s.onlyFirstListens}
							onClick={a.toggleFirst}
							className={cn(
								"text-left text-sm transition-colors",
								s.onlyFirstListens
									? "font-medium text-teal-900"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{s.onlyFirstListens ? "●" : "○"} Only first listens
						</button>
					</div>
				</div>

				<div>
					<MicroLabel>Release year</MicroLabel>
					<input
						value={s.year}
						onChange={(e) => a.setYear(e.target.value)}
						className="w-full border-border/70 border-b bg-transparent py-1 text-sm tabular-nums outline-none focus-visible:border-teal-800"
					/>
				</div>
			</div>

			<div className="mt-6">
				<button
					type="button"
					className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
				>
					<RefreshCw className="h-3 w-3" />
					Synced 118d ago · Sync
				</button>
			</div>
		</div>
	);
}

/* ─── F4 Studio strip ──────────────────────────────────────────── */

function StudioStrip(): ReactNode {
	const [s, a] = useLabFilters();
	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="mb-2 font-medium text-[11px] text-foreground">Group</p>
				<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/80 bg-border/80">
					{(["week", "month"] as const).map((g) => (
						<button
							key={g}
							type="button"
							aria-pressed={s.grouping === g}
							onClick={() => a.setGrouping(g)}
							className={cn(
								"bg-background py-2 text-xs capitalize transition-colors",
								s.grouping === g
									? "bg-foreground font-medium text-background"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{g}
						</button>
					))}
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[11px] text-foreground">Focus</p>
				<div className="flex flex-col gap-1.5">
					<button
						type="button"
						aria-pressed={s.onlyUnranked}
						onClick={a.toggleUnranked}
						className={cn(
							"rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
							s.onlyUnranked
								? "border-foreground bg-foreground text-background"
								: "border-border/80 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						Only unranked
					</button>
					<button
						type="button"
						aria-pressed={s.onlyFirstListens}
						onClick={a.toggleFirst}
						className={cn(
							"rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
							s.onlyFirstListens
								? "border-foreground bg-foreground text-background"
								: "border-border/80 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						Only first listens
					</button>
				</div>
			</div>

			<div>
				<p className="mb-2 font-medium text-[11px] text-foreground">Year</p>
				<input
					value={s.year}
					onChange={(e) => a.setYear(e.target.value)}
					className="h-8 w-full rounded-md border border-border/80 bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-foreground/20"
				/>
			</div>

			<p className="text-[10px] text-muted-foreground">
				<button
					type="button"
					className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
				>
					<RefreshCw className="h-2.5 w-2.5" />
					Sync · 118d ago
				</button>
			</p>
		</div>
	);
}

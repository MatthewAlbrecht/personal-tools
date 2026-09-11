"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export type RankingsFrame = "top" | "full";
export type RankingsMode = "board" | "duel";

export function RankingsFilters({
	availableYears,
	yearFilter,
	onYearFilterChange,
	frame,
	onFrameChange,
	mode,
	onModeChange,
	className,
}: {
	availableYears: number[];
	yearFilter: string;
	onYearFilterChange: (year: string) => void;
	frame: RankingsFrame;
	onFrameChange: (frame: RankingsFrame) => void;
	mode: RankingsMode;
	onModeChange: (mode: RankingsMode) => void;
	className?: string;
}): ReactNode {
	const yearIsAll = yearFilter === "all";

	return (
		<div className={cn("flex flex-col gap-5", className)}>
			<div>
				<label
					htmlFor="rankings-filter-year"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Year
				</label>
				<select
					id="rankings-filter-year"
					value={yearFilter}
					onChange={(e) => onYearFilterChange(e.target.value)}
					className="w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus-visible:border-teal-800/40 focus-visible:ring-2 focus-visible:ring-teal-800/15"
				>
					<option value="all">All years</option>
					{availableYears.map((year) => (
						<option key={year} value={year.toString()}>
							{year}
						</option>
					))}
				</select>
			</div>

			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Frame
				</legend>
				<div
					className="flex rounded-md bg-muted/80 p-0.5"
					role="group"
					aria-label="Frame"
				>
					{(
						[
							{ value: "top", label: "Top 65" },
							{ value: "full", label: "Full year" },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={frame === option.value}
							onClick={() => onFrameChange(option.value)}
							className={cn(
								"flex-1 rounded-[5px] py-1.5 text-xs transition-all",
								frame === option.value
									? "bg-background font-medium text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Mode
				</legend>
				<div
					className="flex rounded-md bg-muted/80 p-0.5"
					role="group"
					aria-label="Mode"
				>
					{(
						[
							{ value: "board", label: "Board" },
							{ value: "duel", label: "Duel" },
						] as const
					).map((option) => {
						const disabled = option.value === "duel" && yearIsAll;
						return (
							<button
								key={option.value}
								type="button"
								aria-pressed={mode === option.value}
								disabled={disabled}
								onClick={() => {
									if (disabled) return;
									onModeChange(option.value);
								}}
								className={cn(
									"flex-1 rounded-[5px] py-1.5 text-xs transition-all",
									disabled && "cursor-not-allowed opacity-40",
									!disabled && mode === option.value
										? "bg-background font-medium text-foreground shadow-sm"
										: !disabled &&
												"text-muted-foreground hover:text-foreground",
								)}
							>
								{option.label}
							</button>
						);
					})}
				</div>
				{yearIsAll ? (
					<p className="mt-2 text-[11px] text-muted-foreground leading-snug">
						Reorder, duel, and week-over-week need a concrete year.
					</p>
				) : null}
			</fieldset>
		</div>
	);
}

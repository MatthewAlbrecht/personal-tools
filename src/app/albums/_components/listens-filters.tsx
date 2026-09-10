"use client";

import type { ReactNode } from "react";
import { YearRangePicker } from "~/app/for-later-albums/_components/year-range-picker";
import { cn } from "~/lib/utils";

export type ListensGrouping = "week" | "month";

export function ListensFilters({
	grouping,
	onGroupingChange,
	onlyUnranked,
	onOnlyUnrankedChange,
	onlyFirstListens,
	onOnlyFirstListensChange,
	yearMin,
	yearMax,
	onYearRangeCommit,
	className,
}: {
	grouping: ListensGrouping;
	onGroupingChange: (grouping: ListensGrouping) => void;
	onlyUnranked: boolean;
	onOnlyUnrankedChange: (checked: boolean) => void;
	onlyFirstListens: boolean;
	onOnlyFirstListensChange: (checked: boolean) => void;
	yearMin?: number;
	yearMax?: number;
	onYearRangeCommit: (bounds: {
		yearMin?: number;
		yearMax?: number;
	}) => void;
	className?: string;
}): ReactNode {
	return (
		<div className={cn("flex flex-col gap-5", className)}>
			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Group by
				</legend>
				<div
					className="flex rounded-md bg-muted/80 p-0.5"
					role="group"
					aria-label="Group by"
				>
					{(["week", "month"] as const).map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={grouping === option}
							onClick={() => onGroupingChange(option)}
							className={cn(
								"flex-1 rounded-[5px] py-1.5 text-xs capitalize transition-all",
								grouping === option
									? "bg-background font-medium text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option}
						</button>
					))}
				</div>
			</fieldset>

			<div>
				<p className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Narrow
				</p>
				<div className="flex flex-col gap-0.5">
					<CheckRow
						pressed={onlyUnranked}
						onPressedChange={onOnlyUnrankedChange}
						label="Only unranked"
					/>
					<CheckRow
						pressed={onlyFirstListens}
						onPressedChange={onOnlyFirstListensChange}
						label="Only first listens"
					/>
				</div>
			</div>

			<div>
				<label
					htmlFor="listens-filter-year"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Release year
				</label>
				<YearRangePicker
					id="listens-filter-year"
					yearMin={yearMin}
					yearMax={yearMax}
					onCommit={onYearRangeCommit}
				/>
			</div>
		</div>
	);
}

function CheckRow({
	pressed,
	onPressedChange,
	label,
}: {
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	label: string;
}): ReactNode {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={() => onPressedChange(!pressed)}
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
					<svg
						viewBox="0 0 12 12"
						className="h-2.5 w-2.5 fill-none stroke-current"
					>
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
			<span
				className={cn(
					pressed ? "font-medium text-foreground" : "text-foreground/80",
				)}
			>
				{label}
			</span>
		</button>
	);
}

export function listensFiltersAreActive(opts: {
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	yearMin?: number;
	yearMax?: number;
}): boolean {
	return (
		opts.onlyUnranked ||
		opts.onlyFirstListens ||
		opts.yearMin !== undefined ||
		opts.yearMax !== undefined
	);
}

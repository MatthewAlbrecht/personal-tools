"use client";

import type { ReactNode } from "react";
import { YearRangePicker } from "~/app/for-later-albums/_components/year-range-picker";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
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
		<div className={cn("flex flex-col gap-4", className)}>
			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-muted-foreground text-xs">
					Group by
				</legend>
				<div className="grid grid-cols-2 gap-1">
					<Button
						type="button"
						size="sm"
						variant={grouping === "week" ? "default" : "outline"}
						aria-pressed={grouping === "week"}
						onClick={() => onGroupingChange("week")}
					>
						Week
					</Button>
					<Button
						type="button"
						size="sm"
						variant={grouping === "month" ? "default" : "outline"}
						aria-pressed={grouping === "month"}
						onClick={() => onGroupingChange("month")}
					>
						Month
					</Button>
				</div>
			</fieldset>

			<Separator />

			<div className="flex flex-col gap-2">
				<FilterToggleCard
					pressed={onlyUnranked}
					onPressedChange={onOnlyUnrankedChange}
				>
					Only unranked
				</FilterToggleCard>
				<FilterToggleCard
					pressed={onlyFirstListens}
					onPressedChange={onOnlyFirstListensChange}
				>
					Only first listens
				</FilterToggleCard>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="listens-filter-year">Release year</Label>
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

function FilterToggleCard({
	pressed,
	onPressedChange,
	children,
}: {
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	children: ReactNode;
}): ReactNode {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={() => onPressedChange(!pressed)}
			className={cn(
				"w-full rounded-md border px-3 py-2.5 text-center text-sm transition-colors",
				pressed
					? "border-teal-800/40 bg-teal-800 text-teal-50 shadow-sm"
					: "border-border bg-background text-foreground hover:bg-muted/60",
			)}
		>
			{children}
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

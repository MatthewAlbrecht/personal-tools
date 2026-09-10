"use client";

import { type ReactNode, useId } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
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
	yearFilter,
	onYearFilterChange,
	availableYears,
	className,
}: {
	grouping: ListensGrouping;
	onGroupingChange: (grouping: ListensGrouping) => void;
	onlyUnranked: boolean;
	onOnlyUnrankedChange: (checked: boolean) => void;
	onlyFirstListens: boolean;
	onOnlyFirstListensChange: (checked: boolean) => void;
	yearFilter: string;
	onYearFilterChange: (year: string) => void;
	availableYears: number[];
	className?: string;
}): ReactNode {
	const onlyUnrankedId = useId();
	const onlyFirstListensId = useId();
	const yearFilterId = useId();

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

			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<Checkbox
						id={onlyUnrankedId}
						checked={onlyUnranked}
						onCheckedChange={(checked) =>
							onOnlyUnrankedChange(checked === true)
						}
					/>
					<Label htmlFor={onlyUnrankedId}>Only unranked</Label>
				</div>
				<div className="flex items-center gap-2">
					<Checkbox
						id={onlyFirstListensId}
						checked={onlyFirstListens}
						onCheckedChange={(checked) =>
							onOnlyFirstListensChange(checked === true)
						}
					/>
					<Label htmlFor={onlyFirstListensId}>Only first listens</Label>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor={yearFilterId}>Year</Label>
				<Select value={yearFilter} onValueChange={onYearFilterChange}>
					<SelectTrigger id={yearFilterId} size="sm" className="w-full">
						<SelectValue placeholder="All Years" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All Years</SelectItem>
							{availableYears.map((year) => (
								<SelectItem key={year} value={year.toString()}>
									{year}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

export function listensFiltersAreActive(opts: {
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	yearFilter: string;
}): boolean {
	return (
		opts.onlyUnranked || opts.onlyFirstListens || opts.yearFilter !== "all"
	);
}

"use client";

import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { FolioFilters as FolioFiltersState } from "../_utils/filter-state";

const BOOLEAN_FILTERS = [
	{ key: "owned", label: "Owned" },
	{ key: "want", label: "Want" },
	{ key: "le", label: "LE" },
	{ key: "signed", label: "Signed" },
	{ key: "thisYear", label: "This year" },
	{ key: "coming", label: "Coming" },
	{ key: "bundles", label: "Collections" },
] as const;

export function FolioFilters({
	filters,
	onChange,
	className,
}: {
	filters: FolioFiltersState;
	onChange: (next: FolioFiltersState) => void;
	className?: string;
}): ReactNode {
	const searchValue = filters.search ?? "";
	const canClear =
		searchValue.trim() !== "" ||
		filters.owned ||
		filters.want ||
		filters.le ||
		filters.signed ||
		filters.thisYear ||
		filters.coming ||
		filters.bundles;

	return (
		<div className={cn("flex flex-col gap-5", className)}>
			<div>
				<label
					htmlFor="folio-filter-search"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Search
				</label>
				<Input
					id="folio-filter-search"
					value={searchValue}
					onChange={(event) =>
						onChange({
							...filters,
							search: event.target.value || undefined,
						})
					}
					placeholder="Title or author"
					autoComplete="off"
					className="h-8 px-2.5 text-xs shadow-none"
				/>
			</div>

			{BOOLEAN_FILTERS.map((field) => (
				<SegmentedField
					key={field.key}
					legend={field.label}
					value={filters[field.key]}
					onChange={(next) =>
						onChange({
							...filters,
							[field.key]: next,
						})
					}
				/>
			))}

			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={!canClear}
				onClick={() =>
					onChange({
						search: undefined,
						owned: false,
						want: false,
						le: false,
						signed: false,
						thisYear: false,
						coming: false,
						bundles: false,
					})
				}
				className="h-7 justify-start px-1 text-muted-foreground text-xs hover:text-foreground"
			>
				Clear filters
			</Button>
		</div>
	);
}

function SegmentedField({
	legend,
	value,
	onChange,
}: {
	legend: string;
	value: boolean;
	onChange: (value: boolean) => void;
}): ReactNode {
	return (
		<fieldset className="m-0 min-w-0 border-0 p-0">
			<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
				{legend}
			</legend>
			<div className="flex rounded-md bg-muted/80 p-0.5">
				{(
					[
						{ value: false, label: "Off" },
						{ value: true, label: "On" },
					] as const
				).map((option) => (
					<button
						key={option.label}
						type="button"
						aria-pressed={value === option.value}
						onClick={() => onChange(option.value)}
						className={cn(
							"flex-1 rounded-[5px] py-1.5 text-xs transition-all",
							value === option.value
								? "bg-background font-medium text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</fieldset>
	);
}

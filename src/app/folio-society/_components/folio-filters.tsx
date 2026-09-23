"use client";

import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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

			<div className="flex flex-col gap-0.5">
				{BOOLEAN_FILTERS.map((field) => (
					<ToggleRow
						key={field.key}
						id={`folio-filter-${field.key}`}
						label={field.label}
						checked={filters[field.key]}
						onCheckedChange={(next) =>
							onChange({
								...filters,
								[field.key]: next,
							})
						}
					/>
				))}
			</div>

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

function ToggleRow({
	id,
	label,
	checked,
	onCheckedChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	onCheckedChange: (value: boolean) => void;
}): ReactNode {
	return (
		<label
			htmlFor={id}
			className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-1 py-1.5 text-sm transition-colors hover:bg-stone-100/70"
		>
			<span className="text-foreground/90">{label}</span>
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(value) => onCheckedChange(value === true)}
				className="border-stone-400/60 data-[state=checked]:border-teal-800 data-[state=checked]:bg-teal-800"
			/>
		</label>
	);
}

"use client";

import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type {
	AlbumLibraryAlbumType,
	AlbumLibraryListenStatus,
	AlbumLibraryRobRankingStatus,
	AlbumLibraryRymStatus,
} from "../../../../convex/_utils/albumLibraryRows";

type AlbumLibrarySort = "recent" | "artist";

const selectClassName =
	"w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus-visible:border-teal-800/40 focus-visible:ring-2 focus-visible:ring-teal-800/15";

export function LibraryFilters({
	searchInput,
	onSearchInputChange,
	yearFilter,
	availableYears,
	onYearFilterChange,
	albumTypeFilter,
	onAlbumTypeFilterChange,
	listenFilter,
	onListenFilterChange,
	rymFilter,
	onRymFilterChange,
	robRankingFilter,
	onRobRankingFilterChange,
	sortBy,
	onSortByChange,
	canClear,
	onClear,
	className,
}: {
	searchInput: string;
	onSearchInputChange: (value: string) => void;
	yearFilter: string;
	availableYears: number[];
	onYearFilterChange: (year: string) => void;
	albumTypeFilter: AlbumLibraryAlbumType;
	onAlbumTypeFilterChange: (value: AlbumLibraryAlbumType) => void;
	listenFilter: AlbumLibraryListenStatus;
	onListenFilterChange: (value: AlbumLibraryListenStatus) => void;
	rymFilter: AlbumLibraryRymStatus;
	onRymFilterChange: (value: AlbumLibraryRymStatus) => void;
	robRankingFilter: AlbumLibraryRobRankingStatus;
	onRobRankingFilterChange: (value: AlbumLibraryRobRankingStatus) => void;
	sortBy: AlbumLibrarySort;
	onSortByChange: (value: AlbumLibrarySort) => void;
	canClear: boolean;
	onClear: () => void;
	className?: string;
}): ReactNode {
	return (
		<div className={cn("flex flex-col gap-5", className)}>
			<div>
				<label
					htmlFor="library-filter-search"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Search
				</label>
				<Input
					id="library-filter-search"
					value={searchInput}
					onChange={(event) => onSearchInputChange(event.target.value)}
					placeholder="Album or artist"
					autoComplete="off"
					className="h-8 px-2.5 text-xs shadow-none"
				/>
			</div>

			<div>
				<label
					htmlFor="library-filter-year"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Year
				</label>
				<select
					id="library-filter-year"
					value={yearFilter}
					onChange={(event) => onYearFilterChange(event.target.value)}
					className={selectClassName}
				>
					<option value="all">All years</option>
					{availableYears.map((year) => (
						<option key={year} value={year.toString()}>
							{year}
						</option>
					))}
				</select>
			</div>

			<SegmentedField
				legend="Type"
				value={albumTypeFilter}
				onChange={onAlbumTypeFilterChange}
				options={[
					{ value: "all", label: "All" },
					{ value: "album", label: "Album" },
					{ value: "single", label: "Single" },
				]}
			/>

			<SegmentedField
				legend="Listened"
				value={listenFilter}
				onChange={onListenFilterChange}
				options={[
					{ value: "all", label: "All" },
					{ value: "listened", label: "Yes" },
					{ value: "unlistened", label: "No" },
				]}
			/>

			<SegmentedField
				legend="RYM"
				value={rymFilter}
				onChange={onRymFilterChange}
				options={[
					{ value: "all", label: "All" },
					{ value: "linked", label: "Linked" },
					{ value: "unlinked", label: "Open" },
				]}
			/>

			<SegmentedField
				legend="Rob"
				value={robRankingFilter}
				onChange={onRobRankingFilterChange}
				options={[
					{ value: "all", label: "All" },
					{ value: "appears", label: "In" },
					{ value: "not_appears", label: "Out" },
				]}
			/>

			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Sort
				</legend>
				<div
					className="flex rounded-md bg-muted/80 p-0.5"
					role="group"
					aria-label="Sort"
				>
					{(
						[
							{ value: "recent", label: "Recent" },
							{ value: "artist", label: "Artist" },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={sortBy === option.value}
							onClick={() => onSortByChange(option.value)}
							className={cn(
								"flex-1 rounded-[5px] py-1.5 text-xs transition-all",
								sortBy === option.value
									? "bg-background font-medium text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</fieldset>

			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={!canClear}
				onClick={onClear}
				className="h-7 justify-start px-1 text-xs text-muted-foreground hover:text-foreground"
			>
				Clear filters
			</Button>
		</div>
	);
}

function SegmentedField<T extends string>({
	legend,
	value,
	onChange,
	options,
}: {
	legend: string;
	value: T;
	onChange: (value: T) => void;
	options: Array<{ value: T; label: string }>;
}): ReactNode {
	return (
		<fieldset className="m-0 min-w-0 border-0 p-0">
			<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
				{legend}
			</legend>
			<div
				className="flex rounded-md bg-muted/80 p-0.5"
				role="group"
				aria-label={legend}
			>
				{options.map((option) => (
					<button
						key={option.value}
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

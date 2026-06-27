"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "~/components/ui/button";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from "~/components/ui/combobox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	FOR_LATER_DURATION_BUCKET_DEFINITIONS,
	type ForLaterDurationBucketKey,
} from "../../../../convex/_utils/forLaterDurationBuckets";
import type {
	ForLaterFilters as ForLaterFiltersState,
	ForLaterTaxonomyMatch,
} from "../_utils/types";
import { YearRangePicker } from "./year-range-picker";

export function ForLaterFilters({
	userId,
	filters,
	onChange,
}: {
	userId: string;
	filters: ForLaterFiltersState;
	onChange: (filters: ForLaterFiltersState) => void;
}) {
	const genreOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicGenreKeys,
		{
			limit: 3000,
		},
	);
	const descriptorOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicDescriptorKeys,
		{ limit: 500 },
	);
	const durationBucketCounts = useQuery(
		api.forLaterAlbums.listForLaterDurationBucketCounts,
		{ userId },
	);

	const durationBucketCountByKey = useMemo(() => {
		const counts = new Map<string, number>();
		for (const option of durationBucketCounts ?? []) {
			counts.set(option.key, option.count);
		}
		return counts;
	}, [durationBucketCounts]);

	const genreKeysPool = useMemo(
		() => (genreOptions ?? []).map((g) => g.key).sort(),
		[genreOptions],
	);
	const topLevelGenreKeysPool = useMemo(
		() =>
			(genreOptions ?? [])
				.filter((g) => g.isTopLevel)
				.map((g) => g.key)
				.sort(),
		[genreOptions],
	);
	const descriptorKeysPool = useMemo(
		() => (descriptorOptions ?? []).map((d) => d.key).sort(),
		[descriptorOptions],
	);

	const formatGenreOption = useMemo(() => {
		const m = new Map<string, string>();
		for (const g of genreOptions ?? []) {
			m.set(g.key, g.label);
		}
		return (key: string) => m.get(key) ?? key;
	}, [genreOptions]);

	const formatDescriptorOption = useMemo(() => {
		const m = new Map<string, string>();
		for (const d of descriptorOptions ?? []) {
			m.set(d.key, d.label);
		}
		return (key: string) => m.get(key) ?? key;
	}, [descriptorOptions]);

	function patchFilters(patch: Partial<ForLaterFiltersState>): void {
		onChange({ ...filters, ...patch });
	}

	const filtersRef = useRef(filters);
	filtersRef.current = filters;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		filters.search ?? "",
		300,
	);

	useEffect(() => {
		setSearchInput(filters.search ?? "");
	}, [filters.search, setSearchInput]);

	useEffect(() => {
		const trimmed = debouncedSearch.trim();
		const nextSearch = trimmed.length > 0 ? trimmed : undefined;
		const current = filtersRef.current.search;
		if (nextSearch === current) {
			return;
		}
		onChangeRef.current({
			...filtersRef.current,
			search: nextSearch,
		});
	}, [debouncedSearch]);

	return (
		<section className="space-y-2">
			<div className="rounded-lg border bg-card p-4">
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					<div className="flex flex-col gap-1.5 md:col-span-2">
						<Label htmlFor="for-later-filter-search">Album or artist</Label>
						<Input
							id="for-later-filter-search"
							value={searchInput}
							onChange={(event) => setSearchInput(event.target.value)}
							placeholder="Search title or name"
							autoComplete="off"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="for-later-filter-year">Release year</Label>
						<YearRangePicker
							yearMin={filters.yearMin}
							yearMax={filters.yearMax}
							onCommit={({ yearMin, yearMax }) =>
								patchFilters({ yearMin, yearMax })
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5 md:col-span-2">
						<Label id="for-later-filter-duration">Duration (min)</Label>
						<DurationFilterControls
							durationBucketKey={filters.durationBucketKey}
							durationMinMinutes={filters.durationMinMinutes}
							durationMaxMinutes={filters.durationMaxMinutes}
							durationBucketCountByKey={durationBucketCountByKey}
							onSelectBucket={(durationBucketKey) =>
								patchFilters({
									durationBucketKey,
									durationMinMinutes: undefined,
									durationMaxMinutes: undefined,
								})
							}
							onCommitCustomRange={({
								durationMinMinutes,
								durationMaxMinutes,
							}) =>
								patchFilters({
									durationBucketKey: undefined,
									durationMinMinutes,
									durationMaxMinutes,
								})
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label id="for-later-filter-listened">Listened</Label>
						<fieldset
							className="m-0 inline-flex min-w-0 self-start rounded-md border border-border bg-background px-0.5 py-0.5"
							aria-labelledby="for-later-filter-listened"
						>
							<legend className="sr-only">Filter by listen status</legend>
							<button
								type="button"
								onClick={() => patchFilters({ listened: "all" })}
								className={cn(
									"rounded px-2.5 py-1 font-medium text-sm",
									filters.listened === "all"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								All
							</button>
							<button
								type="button"
								onClick={() => patchFilters({ listened: "listened" })}
								className={cn(
									"rounded px-2.5 py-1 font-medium text-sm",
									filters.listened === "listened"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Yes
							</button>
							<button
								type="button"
								onClick={() => patchFilters({ listened: "not_listened" })}
								className={cn(
									"rounded px-2.5 py-1 font-medium text-sm",
									filters.listened === "not_listened"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								No
							</button>
						</fieldset>
					</div>
					<div className="flex flex-col gap-1.5 md:col-span-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Label htmlFor="for-later-filter-genres">Genres</Label>
							<TaxonomyMatchToggle
								ariaLabel="How selected genre tags combine"
								value={filters.genreMatch}
								onChange={(genreMatch) => patchFilters({ genreMatch })}
							/>
						</div>
						<Combobox
							items={genreKeysPool}
							browseItems={topLevelGenreKeysPool}
							multiple
							getItemLabel={formatGenreOption}
							value={filters.genreKeys}
							onValueChange={(genreKeys) => patchFilters({ genreKeys })}
						>
							<ComboboxTrigger>
								<ComboboxChips>
									<ComboboxValue>
										{filters.genreKeys.map((key) => (
											<ComboboxChip key={key} value={key}>
												{formatGenreOption(key)}
											</ComboboxChip>
										))}
									</ComboboxValue>
									<ComboboxChipsInput
										id="for-later-filter-genres"
										placeholder="Add genre"
									/>
								</ComboboxChips>
							</ComboboxTrigger>
							<ComboboxContent>
								<ComboboxEmpty>No genres found.</ComboboxEmpty>
								<ComboboxList>
									{(item) => (
										<ComboboxItem key={item} value={item}>
											{formatGenreOption(item)}
										</ComboboxItem>
									)}
								</ComboboxList>
							</ComboboxContent>
						</Combobox>
					</div>
					<div className="flex flex-col gap-1.5 md:col-span-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Label htmlFor="for-later-filter-descriptors">Descriptors</Label>
							<TaxonomyMatchToggle
								ariaLabel="How selected descriptor tags combine"
								value={filters.descriptorMatch}
								onChange={(descriptorMatch) =>
									patchFilters({ descriptorMatch })
								}
							/>
						</div>
						<Combobox
							items={descriptorKeysPool}
							multiple
							getItemLabel={formatDescriptorOption}
							value={filters.descriptorKeys}
							onValueChange={(descriptorKeys) =>
								patchFilters({ descriptorKeys })
							}
						>
							<ComboboxTrigger>
								<ComboboxChips>
									<ComboboxValue>
										{filters.descriptorKeys.map((key) => (
											<ComboboxChip key={key} value={key}>
												{formatDescriptorOption(key)}
											</ComboboxChip>
										))}
									</ComboboxValue>
									<ComboboxChipsInput
										id="for-later-filter-descriptors"
										placeholder="Add descriptor"
									/>
								</ComboboxChips>
							</ComboboxTrigger>
							<ComboboxContent>
								<ComboboxEmpty>No descriptors found.</ComboboxEmpty>
								<ComboboxList>
									{(item) => (
										<ComboboxItem key={item} value={item}>
											{formatDescriptorOption(item)}
										</ComboboxItem>
									)}
								</ComboboxList>
							</ComboboxContent>
						</Combobox>
					</div>
					<div className="flex min-w-0 flex-col gap-1.5">
						<Label id="for-later-filter-rym">RYM</Label>
						<fieldset
							className="m-0 inline-flex min-w-0 max-w-full flex-nowrap self-start overflow-x-auto rounded-md border border-border bg-background px-0.5 py-0.5"
							aria-labelledby="for-later-filter-rym"
						>
							<legend className="sr-only">Filter by RYM link status</legend>
							<button
								type="button"
								onClick={() => patchFilters({ rymStatus: "all" })}
								className={cn(
									"shrink-0 whitespace-nowrap rounded px-2 py-1 font-medium text-sm",
									filters.rymStatus === "all"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								All
							</button>
							<button
								type="button"
								onClick={() => patchFilters({ rymStatus: "has_scrape" })}
								className={cn(
									"shrink-0 whitespace-nowrap rounded px-2 py-1 font-medium text-sm",
									filters.rymStatus === "has_scrape"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Scrape
							</button>
							<button
								type="button"
								onClick={() => patchFilters({ rymStatus: "no_scrape" })}
								className={cn(
									"shrink-0 whitespace-nowrap rounded px-2 py-1 font-medium text-sm",
									filters.rymStatus === "no_scrape"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								No scrape
							</button>
							<button
								type="button"
								onClick={() => patchFilters({ rymStatus: "not_on_rym" })}
								className={cn(
									"shrink-0 whitespace-nowrap rounded px-2 py-1 font-medium text-sm",
									filters.rymStatus === "not_on_rym"
										? "bg-muted shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								No RYM
							</button>
						</fieldset>
					</div>
				</div>
			</div>
			<div className="flex justify-end">
				<Button
					id="for-later-clear-filters"
					type="button"
					variant="outline"
					onClick={() =>
						onChange({
							genreKeys: [],
							descriptorKeys: [],
							search: undefined,
							yearMin: undefined,
							yearMax: undefined,
							durationMinMinutes: undefined,
							durationMaxMinutes: undefined,
							durationBucketKey: undefined,
							listened: "all",
							rymStatus: "all",
							genreMatch: "all",
							descriptorMatch: "all",
						})
					}
				>
					Clear filters
				</Button>
			</div>
		</section>
	);
}

function DurationFilterControls({
	durationBucketKey,
	durationMinMinutes,
	durationMaxMinutes,
	durationBucketCountByKey,
	onSelectBucket,
	onCommitCustomRange,
}: {
	durationBucketKey?: ForLaterDurationBucketKey;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketCountByKey: Map<string, number>;
	onSelectBucket: (bucketKey: ForLaterDurationBucketKey | undefined) => void;
	onCommitCustomRange: (bounds: {
		durationMinMinutes?: number;
		durationMaxMinutes?: number;
	}) => void;
}) {
	const hasCustomRange =
		durationBucketKey === undefined &&
		(durationMinMinutes !== undefined || durationMaxMinutes !== undefined);

	return (
		<div className="space-y-2">
			<fieldset
				className="m-0 inline-flex min-w-0 flex-wrap gap-1 self-start rounded-md border border-border bg-background px-0.5 py-0.5"
				aria-label="Filter by playlist duration bucket"
			>
				<button
					type="button"
					onClick={() => onSelectBucket(undefined)}
					className={cn(
						"rounded px-2.5 py-1 font-medium text-sm",
						durationBucketKey === undefined && !hasCustomRange
							? "bg-muted shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Any
				</button>
				{FOR_LATER_DURATION_BUCKET_DEFINITIONS.map((definition) => (
					<button
						key={definition.key}
						type="button"
						onClick={() => onSelectBucket(definition.key)}
						className={cn(
							"rounded px-2.5 py-1 font-medium text-sm",
							durationBucketKey === definition.key
								? "bg-muted shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{definition.label}
						<span className="ml-1 text-muted-foreground text-xs">
							({durationBucketCountByKey.get(definition.key) ?? 0})
						</span>
					</button>
				))}
			</fieldset>
			<div className="flex items-center gap-2">
				<Input
					id="for-later-filter-duration-min"
					type="number"
					min={0}
					inputMode="numeric"
					placeholder="Min"
					value={durationMinMinutes ?? ""}
					onChange={(event) => {
						const raw = event.target.value.trim();
						onCommitCustomRange({
							durationMinMinutes:
								raw.length > 0 ? Number.parseInt(raw, 10) : undefined,
							durationMaxMinutes,
						});
					}}
					className="h-9"
				/>
				<span className="text-muted-foreground text-sm">–</span>
				<Input
					id="for-later-filter-duration-max"
					type="number"
					min={0}
					inputMode="numeric"
					placeholder="Max"
					value={durationMaxMinutes ?? ""}
					onChange={(event) => {
						const raw = event.target.value.trim();
						onCommitCustomRange({
							durationMinMinutes,
							durationMaxMinutes:
								raw.length > 0 ? Number.parseInt(raw, 10) : undefined,
						});
					}}
					className="h-9"
				/>
			</div>
		</div>
	);
}

function TaxonomyMatchToggle({
	ariaLabel,
	value,
	onChange,
}: {
	ariaLabel: string;
	value: ForLaterTaxonomyMatch;
	onChange: (next: ForLaterTaxonomyMatch) => void;
}) {
	return (
		<fieldset
			className="m-0 inline-flex min-w-0 shrink-0 rounded-md border border-border bg-background px-0.5 py-0.5"
			aria-label={ariaLabel}
		>
			<button
				type="button"
				onClick={() => onChange("all")}
				className={cn(
					"rounded px-2.5 py-1 font-medium text-sm",
					value === "all"
						? "bg-muted shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				All
			</button>
			<button
				type="button"
				onClick={() => onChange("any")}
				className={cn(
					"rounded px-2.5 py-1 font-medium text-sm",
					value === "any"
						? "bg-muted shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Any
			</button>
		</fieldset>
	);
}

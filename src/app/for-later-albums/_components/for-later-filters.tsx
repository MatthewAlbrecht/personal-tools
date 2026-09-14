"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	ComboboxValue,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import { resolveComboboxFilteredItems } from "~/components/ui/combobox-filter";
import { Input } from "~/components/ui/input";
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

export function forLaterActiveFilterCount(
	filters: ForLaterFiltersState,
): number {
	return (
		Number(Boolean(filters.search)) +
		Number(filters.yearMin !== undefined || filters.yearMax !== undefined) +
		Number(
			filters.durationBucketKey !== undefined ||
				filters.durationMinMinutes !== undefined ||
				filters.durationMaxMinutes !== undefined,
		) +
		Number(filters.listened !== "all") +
		Number(filters.rymStatus !== "all") +
		Number(filters.genreKeys.length > 0) +
		Number(filters.descriptorKeys.length > 0)
	);
}

export function ForLaterFilters({
	userId,
	filters,
	onChange,
	className,
}: {
	userId: string;
	filters: ForLaterFiltersState;
	onChange: (filters: ForLaterFiltersState) => void;
	className?: string;
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

	const genreAnchor = useComboboxAnchor();
	const descriptorAnchor = useComboboxAnchor();

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

	const [genreInput, setGenreInput] = useState("");
	const genreList = resolveComboboxFilteredItems({
		items: genreKeysPool,
		browseItems: topLevelGenreKeysPool,
		filter: genreInput,
		getItemLabel: formatGenreOption,
	});

	const filtersRef = useRef(filters);
	filtersRef.current = filters;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		filters.search ?? "",
		400,
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
		<div className={cn("flex flex-col gap-5", className)}>
			<div>
				<label
					htmlFor="for-later-filter-search"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Search
				</label>
				<Input
					id="for-later-filter-search"
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
					placeholder="Album or artist"
					autoComplete="off"
					className="h-8 px-2.5 text-xs shadow-none"
				/>
			</div>

			<div>
				<label
					htmlFor="for-later-filter-year"
					className="mb-1.5 block font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Release year
				</label>
				<YearRangePicker
					id="for-later-filter-year"
					yearMin={filters.yearMin}
					yearMax={filters.yearMax}
					onCommit={({ yearMin, yearMax }) =>
						patchFilters({ yearMin, yearMax })
					}
				/>
			</div>

			<div>
				<p
					id="for-later-filter-duration"
					className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
				>
					Duration
				</p>
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
					onCommitCustomRange={({ durationMinMinutes, durationMaxMinutes }) =>
						patchFilters({
							durationBucketKey: undefined,
							durationMinMinutes,
							durationMaxMinutes,
						})
					}
				/>
			</div>

			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					Listened
				</legend>
				<div className="flex rounded-md bg-muted/80 p-0.5">
					{(
						[
							{ value: "all", label: "All" },
							{ value: "listened", label: "Yes" },
							{ value: "not_listened", label: "No" },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={filters.listened === option.value}
							onClick={() => patchFilters({ listened: option.value })}
							className={cn(
								"flex-1 rounded-[5px] py-1.5 text-xs transition-all",
								filters.listened === option.value
									? "bg-background font-medium text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</fieldset>

			<div>
				<div className="mb-1.5 flex items-center justify-between gap-2">
					<label
						htmlFor="for-later-filter-genres"
						className="font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
					>
						Genres
					</label>
					<TaxonomyMatchToggle
						ariaLabel="How selected genre tags combine"
						value={filters.genreMatch}
						onChange={(genreMatch) => patchFilters({ genreMatch })}
					/>
				</div>
				<Combobox
					items={genreKeysPool}
					filteredItems={genreList.filteredItems}
					inputValue={genreInput}
					onInputValueChange={(next) => setGenreInput(next)}
					multiple
					itemToStringLabel={formatGenreOption}
					value={filters.genreKeys}
					onValueChange={(genreKeys) => patchFilters({ genreKeys })}
				>
					<ComboboxChips ref={genreAnchor}>
						<ComboboxValue>
							{(values: string[]) => (
								<>
									{values.map((key) => (
										<ComboboxChip key={key}>
											{formatGenreOption(key)}
										</ComboboxChip>
									))}
									<ComboboxChipsInput
										id="for-later-filter-genres"
										placeholder="Add genre"
									/>
								</>
							)}
						</ComboboxValue>
					</ComboboxChips>
					<ComboboxContent anchor={genreAnchor}>
						<ComboboxEmpty>No genres found.</ComboboxEmpty>
						<ComboboxList>
							{(item) => (
								<ComboboxItem key={item} value={item}>
									<span className="flex min-w-0 flex-1 items-center justify-between gap-2">
										<span className="min-w-0 truncate">
											{formatGenreOption(item)}
										</span>
										{genreList.pinnedKeys.has(item) ? (
											<span className="shrink-0 text-muted-foreground text-xs">
												Top
											</span>
										) : null}
									</span>
								</ComboboxItem>
							)}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
			</div>

			<div>
				<div className="mb-1.5 flex items-center justify-between gap-2">
					<label
						htmlFor="for-later-filter-descriptors"
						className="font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]"
					>
						Descriptors
					</label>
					<TaxonomyMatchToggle
						ariaLabel="How selected descriptor tags combine"
						value={filters.descriptorMatch}
						onChange={(descriptorMatch) => patchFilters({ descriptorMatch })}
					/>
				</div>
				<Combobox
					items={descriptorKeysPool}
					multiple
					itemToStringLabel={formatDescriptorOption}
					value={filters.descriptorKeys}
					onValueChange={(descriptorKeys) => patchFilters({ descriptorKeys })}
				>
					<ComboboxChips ref={descriptorAnchor}>
						<ComboboxValue>
							{(values: string[]) => (
								<>
									{values.map((key) => (
										<ComboboxChip key={key}>
											{formatDescriptorOption(key)}
										</ComboboxChip>
									))}
									<ComboboxChipsInput
										id="for-later-filter-descriptors"
										placeholder="Add descriptor"
									/>
								</>
							)}
						</ComboboxValue>
					</ComboboxChips>
					<ComboboxContent anchor={descriptorAnchor}>
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

			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 font-medium text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
					RYM
				</legend>
				<div className="flex flex-wrap gap-0.5 rounded-md bg-muted/80 p-0.5">
					{(
						[
							{ value: "all", label: "All" },
							{ value: "has_scrape", label: "Scrape" },
							{ value: "no_scrape", label: "None" },
							{ value: "not_on_rym", label: "No RYM" },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={filters.rymStatus === option.value}
							onClick={() => patchFilters({ rymStatus: option.value })}
							className={cn(
								"rounded-[5px] px-1.5 py-1.5 text-xs transition-all",
								filters.rymStatus === option.value
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
				id="for-later-clear-filters"
				type="button"
				variant="ghost"
				size="sm"
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
				className="h-7 justify-start px-1 text-muted-foreground text-xs hover:text-foreground"
			>
				Clear filters
			</Button>
		</div>
	);
}

const DURATION_INPUT_DEBOUNCE_MS = 400;

function minutesToInput(value?: number): string {
	return value === undefined ? "" : String(value);
}

function parseMinuteInput(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	if (!/^\d+$/.test(trimmed)) {
		return undefined;
	}
	return Number.parseInt(trimmed, 10);
}

function compactDurationLabel(label: string): string {
	return label.replace(/ min$/, "");
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
	const anyPressed = durationBucketKey === undefined && !hasCustomRange;

	const [minInput, setMinInput] = useState(minutesToInput(durationMinMinutes));
	const [maxInput, setMaxInput] = useState(minutesToInput(durationMaxMinutes));
	const boundsRef = useRef({ durationMinMinutes, durationMaxMinutes });
	boundsRef.current = { durationMinMinutes, durationMaxMinutes };
	const onCommitRef = useRef(onCommitCustomRange);
	onCommitRef.current = onCommitCustomRange;

	useEffect(() => {
		setMinInput(minutesToInput(durationMinMinutes));
		setMaxInput(minutesToInput(durationMaxMinutes));
	}, [durationMinMinutes, durationMaxMinutes]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			const min = parseMinuteInput(minInput);
			const max = parseMinuteInput(maxInput);
			const current = boundsRef.current;
			if (
				min === current.durationMinMinutes &&
				max === current.durationMaxMinutes
			) {
				return;
			}
			onCommitRef.current({
				durationMinMinutes: min,
				durationMaxMinutes: max,
			});
		}, DURATION_INPUT_DEBOUNCE_MS);
		return () => window.clearTimeout(timeoutId);
	}, [minInput, maxInput]);

	function handleMinuteFieldChange(
		raw: string,
		setValue: (next: string) => void,
	): void {
		if (raw === "" || /^\d{0,4}$/.test(raw)) {
			setValue(raw);
		}
	}

	return (
		<div>
			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="sr-only">Filter by album duration</legend>
				<div className="flex flex-col">
					<DurationBucketRow
						pressed={anyPressed}
						label="Any"
						onClick={() => onSelectBucket(undefined)}
					/>
					{FOR_LATER_DURATION_BUCKET_DEFINITIONS.map((definition) => (
						<DurationBucketRow
							key={definition.key}
							pressed={durationBucketKey === definition.key}
							label={compactDurationLabel(definition.label)}
							count={durationBucketCountByKey.get(definition.key) ?? 0}
							onClick={() => onSelectBucket(definition.key)}
						/>
					))}
				</div>
			</fieldset>
			<div
				className={cn(
					"mt-1 rounded-md px-1 pt-1.5 pb-1",
					hasCustomRange && "bg-muted/70",
				)}
			>
				<p className="mb-1.5 font-medium text-[0.6rem] text-muted-foreground uppercase tracking-[0.14em]">
					Range
				</p>
				<div className="flex items-center gap-1.5">
					<Input
						id="for-later-filter-duration-min"
						type="text"
						inputMode="numeric"
						autoComplete="off"
						spellCheck={false}
						placeholder="Min"
						aria-label="Minimum duration in minutes"
						value={minInput}
						onChange={(event) =>
							handleMinuteFieldChange(event.target.value, setMinInput)
						}
						className="h-7 px-2 text-center text-xs tabular-nums shadow-none"
					/>
					<span
						className="font-[family-name:var(--font-display)] text-muted-foreground text-sm"
						aria-hidden
					>
						–
					</span>
					<Input
						id="for-later-filter-duration-max"
						type="text"
						inputMode="numeric"
						autoComplete="off"
						spellCheck={false}
						placeholder="Max"
						aria-label="Maximum duration in minutes"
						value={maxInput}
						onChange={(event) =>
							handleMinuteFieldChange(event.target.value, setMaxInput)
						}
						className="h-7 px-2 text-center text-xs tabular-nums shadow-none"
					/>
				</div>
			</div>
		</div>
	);
}

function DurationBucketRow({
	pressed,
	label,
	count,
	onClick,
}: {
	pressed: boolean;
	label: string;
	count?: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onClick}
			className={cn(
				"flex w-full items-baseline justify-between gap-2 rounded-md px-1 py-[0.3rem] text-left transition-colors",
				pressed ? "bg-muted/70" : "hover:bg-muted/40",
			)}
		>
			<span
				className={cn(
					"font-[family-name:var(--font-display)] text-[0.8125rem] tabular-nums tracking-tight",
					pressed ? "font-medium text-foreground" : "text-foreground/75",
				)}
			>
				{label}
			</span>
			{count !== undefined ? (
				<span className="text-[0.65rem] text-muted-foreground tabular-nums">
					{count}
				</span>
			) : null}
		</button>
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
			className="m-0 flex min-w-0 rounded-md border-0 bg-muted/80 p-0.5"
			aria-label={ariaLabel}
		>
			{(["all", "any"] as const).map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={value === option}
					onClick={() => onChange(option)}
					className={cn(
						"rounded-[5px] px-1.5 py-0.5 text-[0.65rem] capitalize transition-all",
						value === option
							? "bg-background font-medium text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{option}
				</button>
			))}
		</fieldset>
	);
}

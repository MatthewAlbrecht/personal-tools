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
	ComboboxTrigger,
	ComboboxValue,
} from "~/components/ui/combobox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type {
	ForLaterFilters as ForLaterFiltersState,
	ForLaterTaxonomyMatch,
} from "../_utils/types";

export function ForLaterFilters({
	filters,
	onChange,
}: {
	filters: ForLaterFiltersState;
	onChange: (filters: ForLaterFiltersState) => void;
}) {
	const genreOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicGenreKeys,
		{
			limit: 500,
		},
	);
	const descriptorOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicDescriptorKeys,
		{ limit: 500 },
	);

	const genreKeysPool = useMemo(
		() => (genreOptions ?? []).map((g) => g.key).sort(),
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

	const [yearDraft, setYearDraft] = useState(() =>
		filters.year !== undefined ? String(filters.year) : "",
	);

	useEffect(() => {
		setYearDraft(filters.year !== undefined ? String(filters.year) : "");
	}, [filters.year]);

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
						<Input
							id="for-later-filter-year"
							value={yearDraft}
							placeholder="YYYY"
							inputMode="numeric"
							autoComplete="off"
							onChange={(event) => {
								const digitsOnly = event.target.value
									.replace(/\D/g, "")
									.slice(0, 4);
								setYearDraft(digitsOnly);
								if (digitsOnly.length === 4) {
									patchFilters({
										year: Number.parseInt(digitsOnly, 10),
									});
								} else if (digitsOnly.length === 0) {
									patchFilters({ year: undefined });
								}
							}}
							onBlur={(event) => {
								const blurred = event.target.value.replace(/\D/g, "");
								if (blurred.length > 0 && blurred.length < 4) {
									setYearDraft(
										filters.year !== undefined ? String(filters.year) : "",
									);
								}
							}}
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
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="for-later-filter-rym">RYM link status</Label>
						<select
							id="for-later-filter-rym"
							value={filters.rymStatus}
							onChange={(event) =>
								patchFilters({
									rymStatus: event.target
										.value as ForLaterFiltersState["rymStatus"],
								})
							}
							className="rounded-md border bg-background px-3 py-2 text-sm"
						>
							<option value="all">All RYM states</option>
							<option value="has_scrape">Has scrape</option>
							<option value="no_scrape">No scrape</option>
							<option value="has_candidate">Has candidate URL</option>
							<option value="no_candidate">No candidate URL</option>
						</select>
					</div>
					<div className="flex flex-col justify-end gap-1.5">
						<Label htmlFor="for-later-clear-filters">Actions</Label>
						<Button
							id="for-later-clear-filters"
							type="button"
							variant="outline"
							onClick={() =>
								onChange({
									genreKeys: [],
									descriptorKeys: [],
									search: undefined,
									year: undefined,
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
				</div>
			</div>
		</section>
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

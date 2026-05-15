"use client";

import { useQuery } from "convex/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "../../../../convex/_generated/api";
import type { ForLaterFilters as ForLaterFiltersState } from "../_utils/types";

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

	function patchFilters(patch: Partial<ForLaterFiltersState>): void {
		onChange({ ...filters, ...patch });
	}

	return (
		<section className="rounded-lg border bg-card p-4">
			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
				<Input
					value={filters.title ?? ""}
					placeholder="Album title"
					onChange={(event) =>
						patchFilters({ title: event.target.value || undefined })
					}
				/>
				<Input
					value={filters.artist ?? ""}
					placeholder="Artist"
					onChange={(event) =>
						patchFilters({ artist: event.target.value || undefined })
					}
				/>
				<Input
					value={filters.year?.toString() ?? ""}
					placeholder="Release year"
					inputMode="numeric"
					onChange={(event) => {
						const value = event.target.value.trim();
						patchFilters({
							year: /^\d{4}$/.test(value)
								? Number.parseInt(value, 10)
								: undefined,
						});
					}}
				/>
				<select
					value={filters.listened}
					onChange={(event) =>
						patchFilters({
							listened: event.target.value as ForLaterFiltersState["listened"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="all">All listen states</option>
					<option value="listened">Listened</option>
					<option value="not_listened">Not listened</option>
				</select>
				<select
					value={filters.genreKey ?? ""}
					onChange={(event) =>
						patchFilters({ genreKey: event.target.value || undefined })
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="">All genres</option>
					{genreOptions?.map((genre) => (
						<option key={genre.key} value={genre.key}>
							{genre.label}
						</option>
					))}
				</select>
				<select
					value={filters.genreRole}
					onChange={(event) =>
						patchFilters({
							genreRole: event.target
								.value as ForLaterFiltersState["genreRole"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="either">Primary or secondary</option>
					<option value="primary">Primary only</option>
					<option value="secondary">Secondary only</option>
				</select>
				<select
					value={filters.descriptorKey ?? ""}
					onChange={(event) =>
						patchFilters({ descriptorKey: event.target.value || undefined })
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="">All descriptors</option>
					{descriptorOptions?.map((descriptor) => (
						<option key={descriptor.key} value={descriptor.key}>
							{descriptor.label}
						</option>
					))}
				</select>
				<select
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
				<select
					value={filters.playlist}
					onChange={(event) =>
						patchFilters({
							playlist: event.target.value as ForLaterFiltersState["playlist"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="active">Active only</option>
					<option value="removed">Removed only</option>
					<option value="all">Active and removed</option>
				</select>
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						onChange({
							genreKey: undefined,
							genreRole: "either",
							descriptorKey: undefined,
							title: undefined,
							artist: undefined,
							year: undefined,
							listened: "all",
							rymStatus: "all",
							playlist: "active",
						})
					}
				>
					Clear filters
				</Button>
			</div>
		</section>
	);
}

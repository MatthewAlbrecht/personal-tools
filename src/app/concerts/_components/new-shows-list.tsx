"use client";

import { DollarSign, ThumbsUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	buildGoogleSearchUrl,
	formatConcertStatusLabel,
	formatEventDate,
} from "../_utils/formatters";
import type {
	ConcertEventRow,
	ConcertUserStatus,
	SelectedConcertVenueRow,
} from "../_utils/types";

export function NewShowsList({
	includeActioned,
	isLoading,
	onIncludeActionedChange,
	onSelectedVenueIdsChange,
	onStatusChange,
	rows,
	selectedVenueIds,
	selectedVenues,
}: {
	includeActioned: boolean;
	isLoading: boolean;
	onIncludeActionedChange: (includeActioned: boolean) => void;
	onSelectedVenueIdsChange: (venueIds: Id<"concertVenues">[]) => void;
	onStatusChange: (row: ConcertEventRow, userStatus: ConcertUserStatus) => void;
	rows: ConcertEventRow[];
	selectedVenueIds: Id<"concertVenues">[];
	selectedVenues: SelectedConcertVenueRow[];
}) {
	const [searchText, setSearchText] = useState("");
	const filteredRows = useMemo(
		() => rows.filter((row) => matchesSearchText(row, searchText)),
		[rows, searchText],
	);
	const hasFilters =
		selectedVenueIds.length > 0 || searchText.trim() || includeActioned;

	function handleResetFilters() {
		onSelectedVenueIdsChange([]);
		setSearchText("");
		onIncludeActionedChange(false);
	}

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading shows...</p>;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-3">
				<label
					className="flex flex-col gap-2 font-medium text-sm"
					htmlFor="concert-new-shows-search"
				>
					Search
					<Input
						id="concert-new-shows-search"
						onChange={(event) => setSearchText(event.currentTarget.value)}
						placeholder="Search event, venue, or artist"
						value={searchText}
					/>
				</label>

				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between gap-3">
						<span className="font-medium text-sm">Venues</span>
						<Button
							disabled={!hasFilters}
							onClick={handleResetFilters}
							size="sm"
							type="button"
							variant="outline"
						>
							Reset
						</Button>
					</div>
					<div className="flex flex-wrap gap-2">
						{selectedVenues.map((row) => {
							const isSelected = selectedVenueIds.includes(row.venueId);

							return (
								<Button
									key={row._id}
									onClick={() =>
										onSelectedVenueIdsChange(isSelected ? [] : [row.venueId])
									}
									size="sm"
									type="button"
									variant={isSelected ? "default" : "outline"}
								>
									{getVenueDisplayName(row)}
								</Button>
							);
						})}
					</div>
				</div>
			</div>

			<label className="flex items-center gap-2 text-sm">
				<input
					checked={includeActioned}
					onChange={(event) =>
						onIncludeActionedChange(event.currentTarget.checked)
					}
					type="checkbox"
				/>
				Show actioned
			</label>

			{filteredRows.length === 0 ? (
				<Card>
					<CardContent className="text-muted-foreground text-sm">
						{rows.length === 0
							? "No synced new shows found."
							: "No shows match these filters."}
					</CardContent>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{filteredRows.map((row) => (
						<NewShowRow
							key={row._id}
							onStatusChange={(userStatus) => onStatusChange(row, userStatus)}
							row={row}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function NewShowRow({
	onStatusChange,
	row,
}: {
	onStatusChange: (userStatus: ConcertUserStatus) => void;
	row: ConcertEventRow;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{row.event.name}</p>
						<Badge variant={row.userStatus === "new" ? "secondary" : "outline"}>
							{formatConcertStatusLabel(row.userStatus)}
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">
						{formatEventDate(row.event)} | {row.venue.name}
					</p>
					{row.event.attractionNames.length > 0 ? (
						<p className="text-muted-foreground text-sm">
							{row.event.attractionNames.join(", ")}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						aria-label="Mark as owned"
						onClick={() => onStatusChange("owned")}
						size="icon"
						title="Owned"
						type="button"
						variant={row.userStatus === "owned" ? "default" : "outline"}
					>
						<DollarSign className="size-4" />
					</Button>
					<Button
						aria-label="Mark as interested"
						onClick={() => onStatusChange("interested")}
						size="icon"
						title="Interested"
						type="button"
						variant={row.userStatus === "interested" ? "default" : "outline"}
					>
						<ThumbsUp className="size-4" />
					</Button>
					<Button
						aria-label="Ignore event"
						onClick={() => onStatusChange("ignored")}
						size="icon"
						title="Ignore"
						type="button"
						variant={row.userStatus === "ignored" ? "destructive" : "outline"}
					>
						<X className="size-4" />
					</Button>
					<Button asChild size="sm" variant="outline">
						<a
							href={buildGoogleSearchUrl(`${row.event.name} ${row.venue.name}`)}
							rel="noreferrer"
							target="_blank"
						>
							Search
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function matchesSearchText(row: ConcertEventRow, searchText: string): boolean {
	const query = searchText.trim().toLowerCase();

	if (!query) {
		return true;
	}

	return [row.event.name, row.venue.name, ...row.event.attractionNames]
		.join(" ")
		.toLowerCase()
		.includes(query);
}

function getVenueDisplayName(row: SelectedConcertVenueRow): string {
	return row.label?.trim() || row.venue.name;
}

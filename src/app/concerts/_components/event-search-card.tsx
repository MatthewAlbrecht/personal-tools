"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { formatVenueLocation } from "../_utils/formatters";
import type {
	ConcertEventRow,
	ConcertUserStatus,
	EventSearchLoadResult,
	SelectedConcertVenueRow,
} from "../_utils/types";
import { ConcertEventCard } from "./concert-event-card";

type EventSearchFilter = "all" | "new";

export function EventSearchCard({
	eventRows,
	selectedVenues,
	onLoadEvents,
	onStatusChange,
}: {
	eventRows: ConcertEventRow[];
	selectedVenues: SelectedConcertVenueRow[];
	onLoadEvents: ({
		page,
		tmVenueId,
	}: {
		page: number;
		tmVenueId: string;
	}) => Promise<EventSearchLoadResult>;
	onStatusChange: ({
		eventId,
		userStatus,
	}: {
		eventId: ConcertEventRow["eventId"];
		userStatus: ConcertUserStatus;
	}) => Promise<void>;
}) {
	const [selectedTmVenueId, setSelectedTmVenueId] = useState("");
	const [loadedTmEventIds, setLoadedTmEventIds] = useState<string[]>([]);
	const [nextPage, setNextPage] = useState(0);
	const [pageSummary, setPageSummary] =
		useState<EventSearchLoadResult["page"]>();
	const [filter, setFilter] = useState<EventSearchFilter>("all");
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [optimisticStatuses, setOptimisticStatuses] = useState(
		() => new Map<ConcertEventRow["eventId"], ConcertUserStatus>(),
	);

	const selectedVenueRow = useMemo(
		() =>
			selectedVenues.find((row) => row.venue.tmVenueId === selectedTmVenueId),
		[selectedTmVenueId, selectedVenues],
	);
	const selectedVenue = selectedVenueRow?.venue;
	const venueNamesByVenueId = useMemo(
		() =>
			new Map(
				selectedVenues.map((row) => [row.venueId, getVenueDisplayName(row)]),
			),
		[selectedVenues],
	);
	const loadedEventRows = useMemo(() => {
		const eventRowsByTmId = new Map<string, ConcertEventRow>();

		for (const row of eventRows) {
			eventRowsByTmId.set(row.event.tmEventId, row);

			for (const tmEventId of row.event.tmEventIds ?? []) {
				eventRowsByTmId.set(tmEventId, row);
			}
		}
		const rowsByEventId = new Map<
			ConcertEventRow["eventId"],
			ConcertEventRow
		>();

		for (const tmEventId of loadedTmEventIds) {
			const row = eventRowsByTmId.get(tmEventId);
			if (row) rowsByEventId.set(row.eventId, row);
		}

		return [...rowsByEventId.values()];
	}, [eventRows, loadedTmEventIds]);
	const loadedEventRowsWithStatus = useMemo(
		() =>
			loadedEventRows.map((row) => {
				const userStatus = optimisticStatuses.get(row.eventId);

				return userStatus ? { ...row, userStatus } : row;
			}),
		[loadedEventRows, optimisticStatuses],
	);
	const visibleEventRows = useMemo(
		() =>
			filter === "new"
				? loadedEventRowsWithStatus.filter((row) => row.userStatus === "new")
				: loadedEventRowsWithStatus,
		[filter, loadedEventRowsWithStatus],
	);
	const selectedVenueLocation = selectedVenue
		? formatVenueLocation(selectedVenue)
		: "";
	const selectedVenueName = selectedVenueRow
		? getVenueDisplayName(selectedVenueRow)
		: "";
	const hasMorePages =
		pageSummary?.totalPages === undefined || nextPage < pageSummary.totalPages;

	useEffect(() => {
		if (
			selectedTmVenueId &&
			!selectedVenues.some((row) => row.venue.tmVenueId === selectedTmVenueId)
		) {
			setLoadedTmEventIds([]);
			setNextPage(0);
			setPageSummary(undefined);
			setError(null);
			setSelectedTmVenueId("");
		}
	}, [selectedTmVenueId, selectedVenues]);

	useEffect(() => {
		setOptimisticStatuses((currentStatuses) => {
			if (currentStatuses.size === 0) return currentStatuses;

			const nextStatuses = new Map(currentStatuses);

			for (const row of eventRows) {
				if (nextStatuses.get(row.eventId) === row.userStatus) {
					nextStatuses.delete(row.eventId);
				}
			}

			return nextStatuses.size === currentStatuses.size
				? currentStatuses
				: nextStatuses;
		});
	}, [eventRows]);

	function handleVenueChange(tmVenueId: string) {
		setSelectedTmVenueId(tmVenueId);
		resetSearchState();
	}

	async function handleLoadNextPage() {
		if (!selectedVenue) return;

		setIsSearching(true);
		setError(null);

		try {
			const result = await onLoadEvents({
				page: nextPage,
				tmVenueId: selectedVenue.tmVenueId,
			});

			setLoadedTmEventIds((currentIds) => [
				...currentIds,
				...result.events
					.map((event) => event.tmEventId)
					.filter((tmEventId) => !currentIds.includes(tmEventId)),
			]);
			setNextPage((result.page?.number ?? nextPage) + 1);
			setPageSummary(result.page);
		} catch (loadError) {
			console.error("Error searching venue events:", loadError);
			setError(
				loadError instanceof Error ? loadError.message : "Event search failed",
			);
		} finally {
			setIsSearching(false);
		}
	}

	function resetSearchState() {
		setLoadedTmEventIds([]);
		setNextPage(0);
		setPageSummary(undefined);
		setError(null);
		setOptimisticStatuses(new Map());
	}

	async function handleEventStatusChange(
		row: ConcertEventRow,
		userStatus: ConcertUserStatus,
	) {
		const shouldOptimisticallyHide = filter === "new" && userStatus !== "new";
		const previousStatus = optimisticStatuses.get(row.eventId);

		if (shouldOptimisticallyHide) {
			setError(null);
			setOptimisticStatuses((currentStatuses) => {
				const nextStatuses = new Map(currentStatuses);
				nextStatuses.set(row.eventId, userStatus);
				return nextStatuses;
			});
		}

		try {
			await onStatusChange({ eventId: row.eventId, userStatus });
		} catch (statusError) {
			if (shouldOptimisticallyHide) {
				setOptimisticStatuses((currentStatuses) => {
					const nextStatuses = new Map(currentStatuses);

					if (previousStatus) {
						nextStatuses.set(row.eventId, previousStatus);
					} else {
						nextStatuses.delete(row.eventId);
					}

					return nextStatuses;
				});
			}

			console.error("Error updating concert event status:", statusError);
			setError(
				statusError instanceof Error
					? statusError.message
					: "Could not update event status",
			);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Event search</CardTitle>
				<CardDescription>
					Select a saved venue, then load Ticketmaster events page by page. Each
					page is saved before it appears here.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid gap-4 md:grid-cols-[1fr_auto]">
					<label
						className="flex flex-col gap-2 font-medium text-sm"
						htmlFor="concert-event-search-venue"
					>
						Venue
						<select
							className="h-9 rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							id="concert-event-search-venue"
							value={selectedTmVenueId}
							onChange={(event) => handleVenueChange(event.target.value)}
						>
							<option value="">Select a venue</option>
							{selectedVenues.map((row) => (
								<option key={row._id} value={row.venue.tmVenueId}>
									{getVenueDisplayName(row)}
								</option>
							))}
						</select>
					</label>
					<Button
						className="self-end"
						disabled={!selectedVenue || isSearching || !hasMorePages}
						onClick={() => void handleLoadNextPage()}
						type="button"
					>
						{isSearching
							? "Loading..."
							: loadedTmEventIds.length > 0
								? "Load next page"
								: "Search events"}
					</Button>
				</div>

				{selectedVenue ? (
					<p className="text-muted-foreground text-sm">
						Searching {selectedVenueName}
						{selectedVenueLocation ? ` · ${selectedVenueLocation}` : ""}
					</p>
				) : null}

				{error ? <p className="text-destructive text-sm">{error}</p> : null}

				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Button
							onClick={() => setFilter("all")}
							size="sm"
							type="button"
							variant={filter === "all" ? "default" : "outline"}
						>
							All
						</Button>
						<Button
							onClick={() => setFilter("new")}
							size="sm"
							type="button"
							variant={filter === "new" ? "default" : "outline"}
						>
							Only new
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">
						{loadedEventRows.length} loaded
						{pageSummary?.totalElements !== undefined
							? ` of ${pageSummary.totalElements}`
							: ""}
						{pageSummary?.totalPages !== undefined
							? ` · page ${nextPage} of ${pageSummary.totalPages}`
							: ""}
					</p>
				</div>

				{loadedTmEventIds.length > 0 && visibleEventRows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No events match the current filter.
					</p>
				) : null}

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{visibleEventRows.map((row) => (
						<ConcertEventCard
							key={row.eventId}
							collapsedCount={row.event.tmEventIds?.length}
							onStatusChange={(userStatus) =>
								void handleEventStatusChange(row, userStatus)
							}
							row={row}
							venueName={
								venueNamesByVenueId.get(row.event.venueId) ?? row.venue.name
							}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function getVenueDisplayName(row: SelectedConcertVenueRow): string {
	return row.label?.trim() || row.venue.name;
}

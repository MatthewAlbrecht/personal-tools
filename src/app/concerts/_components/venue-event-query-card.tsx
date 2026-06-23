"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type {
	SelectedConcertVenueRow,
	TicketmasterPage,
} from "../_utils/types";

const TICKETMASTER_PAGE_SIZE = 199;

type VenueEventQuerySummary = {
	fetched: number;
	inserted: number;
	page?: TicketmasterPage;
	updated: number;
	venueName: string;
};

export function VenueEventQueryCard({
	selectedVenues,
	userId,
}: {
	selectedVenues: SelectedConcertVenueRow[];
	userId: string | null;
}) {
	const [selectedTmVenueId, setSelectedTmVenueId] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [nextPage, setNextPage] = useState(0);
	const [pageSummary, setPageSummary] = useState<TicketmasterPage>();
	const [loadedCount, setLoadedCount] = useState(0);
	const [lastSummary, setLastSummary] = useState<VenueEventQuerySummary | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const fetchTicketmasterEventsForVenue = useAction(
		api.concertActions.fetchTicketmasterEventsForVenue,
	);
	const upsertEventsFromTicketmaster = useMutation(
		api.concerts.upsertEventsFromTicketmaster,
	);
	const selectedVenue = selectedVenues.find(
		(row) => row.venue.tmVenueId === selectedTmVenueId,
	);
	const hasMorePages =
		pageSummary?.totalPages === undefined || nextPage < pageSummary.totalPages;
	const isComplete =
		Boolean(selectedVenue) &&
		pageSummary?.totalPages !== undefined &&
		nextPage >= pageSummary.totalPages;

	async function handleSelectVenue(row: SelectedConcertVenueRow) {
		setSelectedTmVenueId(row.venue.tmVenueId);
		await loadVenuePage({ page: 0, reset: true, row });
	}

	async function handleLoadNextPage() {
		if (!selectedVenue) return;

		await loadVenuePage({ page: nextPage, reset: false, row: selectedVenue });
	}

	async function loadVenuePage({
		page,
		reset,
		row,
	}: {
		page: number;
		reset: boolean;
		row: SelectedConcertVenueRow;
	}) {
		if (!userId) return;

		setIsLoading(true);
		setError(null);

		if (reset) {
			setLoadedCount(0);
			setNextPage(0);
			setPageSummary(undefined);
			setLastSummary(null);
		}

		try {
			const result = await fetchTicketmasterEventsForVenue({
				tmVenueId: row.venue.tmVenueId,
				page,
				size: TICKETMASTER_PAGE_SIZE,
			});
			const upserted = await upsertEventsFromTicketmaster({
				userId,
				events: result.events,
			});
			const fetched = result.events.length;

			setLoadedCount((currentCount) =>
				reset ? fetched : currentCount + fetched,
			);
			setNextPage((result.page?.number ?? page) + 1);
			setPageSummary(result.page);
			setLastSummary({
				fetched,
				inserted: upserted.inserted,
				page: result.page,
				updated: upserted.updated,
				venueName: getVenueDisplayName(row),
			});
		} catch (loadError) {
			console.error("Error loading venue events:", loadError);
			setError(getErrorMessage(loadError, "Venue event query failed"));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Query a venue</CardTitle>
				<CardDescription>
					Pull Ticketmaster events for one selected venue by venue ID only. Each
					loaded page is saved through the canonical event upsert.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap gap-2">
					{selectedVenues.map((row) => {
						const isSelected = row.venue.tmVenueId === selectedTmVenueId;

						return (
							<Button
								disabled={isLoading}
								key={row._id}
								onClick={() => void handleSelectVenue(row)}
								size="sm"
								type="button"
								variant={isSelected ? "default" : "outline"}
							>
								{getVenueDisplayName(row)}
							</Button>
						);
					})}
				</div>

				{selectedVenues.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Save a venue before querying venue events.
					</p>
				) : null}

				{selectedVenue ? (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{loadedCount} loaded
							{pageSummary?.totalElements !== undefined
								? ` of ${pageSummary.totalElements}`
								: ""}
							{pageSummary?.totalPages !== undefined
								? ` · ${nextPage} of ${pageSummary.totalPages} pages`
								: ""}
						</p>
						<Button
							disabled={isLoading || !hasMorePages}
							onClick={() => void handleLoadNextPage()}
							type="button"
							variant="outline"
						>
							{isLoading
								? "Loading..."
								: isComplete
									? "All pages loaded"
									: "Load next page"}
						</Button>
					</div>
				) : null}

				{lastSummary ? <VenueEventQuerySummary summary={lastSummary} /> : null}
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
			</CardContent>
		</Card>
	);
}

function VenueEventQuerySummary({
	summary,
}: {
	summary: VenueEventQuerySummary;
}) {
	return (
		<p className="text-sm">
			{summary.venueName}: fetched {summary.fetched}, inserted{" "}
			{summary.inserted} new, updated {summary.updated}
			{formatPageSummary(summary.page)}.
		</p>
	);
}

function formatPageSummary(page: TicketmasterPage | undefined): string {
	if (page?.number === undefined || page.totalPages === undefined) {
		return "";
	}

	return ` (page ${page.number + 1} of ${page.totalPages})`;
}

function getVenueDisplayName(row: SelectedConcertVenueRow): string {
	return row.label?.trim() || row.venue.name;
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

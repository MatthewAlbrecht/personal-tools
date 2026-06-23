"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DiscoverVenuesCard } from "../_components/discover-venues-card";
import { VenueEventQueryCard } from "../_components/venue-event-query-card";
import { formatVenueLocation } from "../_utils/formatters";
import type {
	SelectedConcertVenueRow,
	TicketmasterEvent,
	TicketmasterVenue,
} from "../_utils/types";

const TICKETMASTER_PAGE_SIZE = 199;

export default function ConcertVenuesPage() {
	const { userId } = useAuthToken();
	const [discoveredEvents, setDiscoveredEvents] = useState<TicketmasterEvent[]>(
		[],
	);
	const [discoveredVenues, setDiscoveredVenues] = useState<TicketmasterVenue[]>(
		[],
	);
	const [showSelectedVenues, setShowSelectedVenues] = useState(false);
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const selectedVenues = useQuery(
		api.concerts.listSelectedVenues,
		userId ? { userId } : "skip",
	);
	const upsertVenue = useMutation(api.concerts.upsertVenueFromTicketmaster);
	const setVenueSelected = useMutation(api.concerts.setVenueSelected);
	const updateVenueLabel = useMutation(api.concerts.updateUserVenueLabel);
	const discoverTicketmasterEvents = useAction(
		api.concertActions.discoverTicketmasterEvents,
	);
	const selectedVenueRows = (selectedVenues ?? []) as SelectedConcertVenueRow[];
	const selectedVenueTmIds = useMemo<Set<string>>(
		() =>
			new Set(
				selectedVenueRows.map(
					(row: SelectedConcertVenueRow) => row.venue.tmVenueId,
				),
			),
		[selectedVenueRows],
	);
	const unsavedDiscoveredVenues = useMemo(
		() =>
			discoveredVenues.filter(
				(venue: TicketmasterVenue) => !selectedVenueTmIds.has(venue.tmVenueId),
			),
		[discoveredVenues, selectedVenueTmIds],
	);

	async function handleDiscover({
		postalCode,
		radius,
	}: {
		postalCode: string;
		radius: string;
	}) {
		setIsDiscovering(true);
		setError(null);
		setMessage(null);

		try {
			const result = await discoverTicketmasterEvents({
				postalCode,
				radius,
				size: TICKETMASTER_PAGE_SIZE,
			});

			setDiscoveredEvents(result.events);
			setDiscoveredVenues(result.venues);
			setMessage(
				`Found ${result.events.length} events across ${result.venues.length} venues.`,
			);
		} catch (discoverError) {
			console.error("Error discovering concerts:", discoverError);
			setError(getErrorMessage(discoverError, "Discovery failed"));
		} finally {
			setIsDiscovering(false);
		}
	}

	async function handleSaveVenue(venue: TicketmasterVenue) {
		if (!userId) return;

		await upsertVenue({
			userId,
			venue: toConvexVenue(venue),
			isSelected: true,
		});
		setMessage(`Saved ${venue.name}.`);
	}

	async function handleUnselectVenue(venueId: Id<"concertVenues">) {
		if (!userId) return;

		await setVenueSelected({ userId, venueId, isSelected: false });
		setMessage("Venue removed from selected venues.");
	}

	async function handleUpdateVenueLabel({
		venueId,
		label,
	}: {
		venueId: Id<"concertVenues">;
		label: string;
	}) {
		if (!userId) return;

		const trimmedLabel = label.trim();

		await updateVenueLabel({
			userId,
			venueId,
			label: trimmedLabel || undefined,
		});
		setMessage(
			trimmedLabel ? `Saved nickname: ${trimmedLabel}.` : "Cleared nickname.",
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{message ? (
				<Card>
					<CardContent className="text-sm">{message}</CardContent>
				</Card>
			) : null}
			{error ? (
				<Card className="border-destructive/40">
					<CardContent className="text-destructive text-sm">
						{error}
					</CardContent>
				</Card>
			) : null}

			{discoveredEvents.length > 0 ? (
				<p className="text-muted-foreground text-sm">
					Last discovery search returned {discoveredEvents.length} events.
				</p>
			) : null}

			<SelectedVenuesCard
				onToggle={() => setShowSelectedVenues((show) => !show)}
				onUnselectVenue={(venueId) => void handleUnselectVenue(venueId)}
				onUpdateVenueLabel={(params) => void handleUpdateVenueLabel(params)}
				selectedVenues={selectedVenueRows}
				showSelectedVenues={showSelectedVenues}
			/>

			<VenueEventQueryCard
				selectedVenues={selectedVenueRows}
				userId={userId ?? null}
			/>

			<DiscoverVenuesCard
				isDiscovering={isDiscovering}
				onDiscover={(params) => void handleDiscover(params)}
				onSaveVenue={(venue) => void handleSaveVenue(venue)}
				selectedVenueIds={selectedVenueTmIds}
				venues={unsavedDiscoveredVenues}
			/>
		</div>
	);
}

function SelectedVenuesCard({
	onToggle,
	onUnselectVenue,
	onUpdateVenueLabel,
	selectedVenues,
	showSelectedVenues,
}: {
	onToggle: () => void;
	onUnselectVenue: (venueId: Id<"concertVenues">) => void;
	onUpdateVenueLabel: ({
		venueId,
		label,
	}: {
		venueId: Id<"concertVenues">;
		label: string;
	}) => void;
	selectedVenues: SelectedConcertVenueRow[];
	showSelectedVenues: boolean;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Selected venues</CardTitle>
				<CardDescription>
					Sync fetches upcoming music events for these exact venues.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<p className="text-muted-foreground text-sm">
						{selectedVenues.length} selected venues
					</p>
					<Button onClick={onToggle} type="button" variant="outline">
						{showSelectedVenues ? "Hide venues" : "Show venues"}
					</Button>
				</div>
				{showSelectedVenues ? (
					<div className="grid gap-3 md:grid-cols-2">
						{selectedVenues.map((row) => (
							<SelectedVenueForm
								key={row._id}
								onUnselectVenue={onUnselectVenue}
								onUpdateVenueLabel={onUpdateVenueLabel}
								row={row}
							/>
						))}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function SelectedVenueForm({
	onUnselectVenue,
	onUpdateVenueLabel,
	row,
}: {
	onUnselectVenue: (venueId: Id<"concertVenues">) => void;
	onUpdateVenueLabel: ({
		venueId,
		label,
	}: {
		venueId: Id<"concertVenues">;
		label: string;
	}) => void;
	row: SelectedConcertVenueRow;
}) {
	return (
		<form
			className="flex flex-col gap-3 rounded-lg border p-3"
			onSubmit={(event) => {
				event.preventDefault();
				const formData = new FormData(event.currentTarget);
				onUpdateVenueLabel({
					venueId: row.venueId,
					label: String(formData.get("label") ?? ""),
				});
			}}
		>
			<div>
				<div className="font-medium">{row.label?.trim() || row.venue.name}</div>
				<div className="text-muted-foreground text-sm">
					{row.label?.trim() ? `${row.venue.name} | ` : ""}
					{formatVenueLocation(row.venue)}
				</div>
			</div>
			<label
				className="flex flex-col gap-2 font-medium text-sm"
				htmlFor={`concert-venue-label-${row._id}`}
			>
				Nickname
				<Input
					defaultValue={row.label ?? ""}
					id={`concert-venue-label-${row._id}`}
					name="label"
					placeholder={row.venue.name}
				/>
			</label>
			<div className="flex items-center justify-between gap-2">
				<Button size="sm" type="submit">
					Save nickname
				</Button>
				<Button
					onClick={() => onUnselectVenue(row.venueId)}
					size="sm"
					type="button"
					variant="outline"
				>
					Remove
				</Button>
			</div>
		</form>
	);
}

function toConvexVenue({
	address,
	city,
	latitude,
	longitude,
	name,
	postalCode,
	stateCode,
	tmVenueId,
}: TicketmasterVenue) {
	return {
		address,
		city,
		latitude,
		longitude,
		name,
		postalCode,
		stateCode,
		tmVenueId,
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

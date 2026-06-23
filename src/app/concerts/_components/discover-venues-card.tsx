"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { formatVenueLocation } from "../_utils/formatters";
import type { TicketmasterVenue } from "../_utils/types";

export function DiscoverVenuesCard({
	isDiscovering,
	selectedVenueIds,
	venues,
	onDiscover,
	onSaveVenue,
}: {
	isDiscovering: boolean;
	selectedVenueIds: Set<string>;
	venues: TicketmasterVenue[];
	onDiscover: ({
		postalCode,
		radius,
	}: {
		postalCode: string;
		radius: string;
	}) => void;
	onSaveVenue: (venue: TicketmasterVenue) => void;
}) {
	const [postalCode, setPostalCode] = useState("80209");
	const [radius, setRadius] = useState("10");

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onDiscover({ postalCode, radius });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Discover venues</CardTitle>
				<CardDescription>
					Use broad Ticketmaster search only to find venues. Ongoing sync uses
					the exact saved venue IDs.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form
					className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
					onSubmit={handleSubmit}
				>
					<label
						className="flex flex-col gap-2 font-medium text-sm"
						htmlFor="concert-postal-code"
					>
						ZIP code
						<Input
							id="concert-postal-code"
							value={postalCode}
							onChange={(event) => setPostalCode(event.target.value)}
						/>
					</label>
					<label
						className="flex flex-col gap-2 font-medium text-sm"
						htmlFor="concert-radius"
					>
						Radius miles
						<Input
							id="concert-radius"
							min="1"
							type="number"
							value={radius}
							onChange={(event) => setRadius(event.target.value)}
						/>
					</label>
					<Button className="self-end" disabled={isDiscovering} type="submit">
						{isDiscovering ? "Searching..." : "Search"}
					</Button>
				</form>

				<div className="grid gap-3 md:grid-cols-2">
					{venues.map((venue) => (
						<div
							className="flex items-center justify-between gap-3 rounded-lg border p-3"
							key={venue.tmVenueId}
						>
							<div>
								<div className="font-medium">{venue.name}</div>
								<div className="text-muted-foreground text-sm">
									{formatVenueLocation(venue)} · {venue.eventCount ?? 0} events
								</div>
							</div>
							<Button
								disabled={selectedVenueIds.has(venue.tmVenueId)}
								onClick={() => onSaveVenue(venue)}
								size="sm"
								type="button"
							>
								{selectedVenueIds.has(venue.tmVenueId) ? "Saved" : "Save"}
							</Button>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

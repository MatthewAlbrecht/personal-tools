"use client";

import { useAction, useQuery } from "convex/react";
import { Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoginPrompt } from "~/components/login-prompt";
import { Card, CardContent } from "~/components/ui/card";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../convex/_generated/api";
import { ConcertTabs } from "./_components/concert-tabs";
import { ConcertsHeader } from "./_components/concerts-header";

export default function ConcertsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { userId, isLoading: authLoading } = useAuthToken();
	const [isSyncing, setIsSyncing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const selectedVenues = useQuery(
		api.concerts.listSelectedVenues,
		userId ? { userId } : "skip",
	);
	const calendarFeed = useQuery(
		api.concerts.getCalendarFeedForUser,
		userId ? { userId } : "skip",
	);
	const syncSelectedVenueEvents = useAction(
		api.concertActions.syncSelectedVenueEvents,
	);
	const calendarUrl =
		typeof window !== "undefined" && calendarFeed && !calendarFeed.revokedAt
			? `${window.location.origin}/api/concerts/ical?token=${calendarFeed.token}`
			: "";

	async function handleSyncSelectedVenues() {
		if (!userId || !selectedVenues || selectedVenues.length === 0) return;

		setIsSyncing(true);
		setMessage(null);
		setError(null);

		try {
			const result = await syncSelectedVenueEvents({ userId });
			const summary = formatSyncSummary(result.venues);

			setMessage(summary);
			toast.success(summary);
		} catch (syncError) {
			console.error("Error syncing selected venues:", syncError);
			setError(getErrorMessage(syncError, "Sync failed"));
		} finally {
			setIsSyncing(false);
		}
	}

	if (authLoading) {
		return <main className="mx-auto max-w-6xl px-4 py-8">Loading...</main>;
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Ticket}
				message="Please log in to track concerts"
				redirectPath="/concerts"
			/>
		);
	}

	return (
		<main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
			<ConcertsHeader
				calendarUrl={calendarUrl}
				isSyncing={isSyncing}
				onSync={() => void handleSyncSelectedVenues()}
				selectedVenueCount={selectedVenues?.length ?? 0}
			/>

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

			<ConcertTabs />
			{children}
		</main>
	);
}

function formatSyncSummary(
	venues: {
		venueName: string;
		inserted: number;
		failed: boolean;
	}[],
): string {
	if (venues.length === 0) {
		return "No selected venues to sync.";
	}

	const failedCount = venues.filter((venue) => venue.failed).length;
	const venueSummaries = venues
		.map((venue) =>
			venue.failed
				? `${venue.venueName} failed`
				: `${venue.venueName} ${venue.inserted} new`,
		)
		.join(", ");

	return `Synced ${venues.length} venues: ${venueSummaries}${
		failedCount > 0 ? ` (${failedCount} failed)` : ""
	}.`;
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

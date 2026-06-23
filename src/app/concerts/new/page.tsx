"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { NewShowsList } from "../_components/new-shows-list";
import { getTodayDateKey } from "../_utils/formatters";
import type {
	ConcertEventRow,
	ConcertUserStatus,
	SelectedConcertVenueRow,
} from "../_utils/types";

export default function NewConcertsPage() {
	const { userId } = useAuthToken();
	const [selectedVenueIds, setSelectedVenueIds] = useState<
		Id<"concertVenues">[]
	>([]);
	const [includeActioned, setIncludeActioned] = useState(false);
	const [hiddenEventIds, setHiddenEventIds] = useState<Id<"concertEvents">[]>(
		[],
	);
	const todayDate = useMemo(() => getTodayDateKey(), []);
	const selectedVenues = useQuery(
		api.concerts.listSelectedVenues,
		userId ? { userId } : "skip",
	);
	const rows = useQuery(
		api.concerts.listNewShows,
		userId
			? {
					userId,
					todayDate,
					venueIds: selectedVenueIds.length > 0 ? selectedVenueIds : undefined,
					includeActioned,
				}
			: "skip",
	);
	const updateEventStatus = useMutation(api.concerts.updateEventUserStatus);
	const selectedVenueRows = (selectedVenues ?? []) as SelectedConcertVenueRow[];
	const visibleRows =
		includeActioned || hiddenEventIds.length === 0
			? ((rows ?? []) as ConcertEventRow[])
			: ((rows ?? []) as ConcertEventRow[]).filter(
					(row: ConcertEventRow) => !hiddenEventIds.includes(row.eventId),
				);

	async function handleStatusChange(
		row: ConcertEventRow,
		userStatus: ConcertUserStatus,
	) {
		if (!userId) return;

		await updateEventStatus({ userId, eventId: row.eventId, userStatus });

		if (!includeActioned && row.userStatus === "new" && userStatus !== "new") {
			setHiddenEventIds((eventIds) => [...new Set([...eventIds, row.eventId])]);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<NewShowsList
				includeActioned={includeActioned}
				isLoading={rows === undefined || selectedVenues === undefined}
				onIncludeActionedChange={setIncludeActioned}
				onSelectedVenueIdsChange={setSelectedVenueIds}
				onStatusChange={(row, userStatus) =>
					void handleStatusChange(row, userStatus)
				}
				rows={visibleRows}
				selectedVenueIds={selectedVenueIds}
				selectedVenues={selectedVenueRows}
			/>
		</div>
	);
}

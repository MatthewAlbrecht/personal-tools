"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../../convex/_generated/api";
import { UpcomingShowsList } from "../_components/upcoming-shows-list";
import { getTodayDateKey } from "../_utils/formatters";
import type { ConcertEventRow, ConcertUserStatus } from "../_utils/types";

export default function UpcomingConcertsPage() {
	const { userId } = useAuthToken();
	const [includeInterested, setIncludeInterested] = useState(false);
	const todayDate = useMemo(() => getTodayDateKey(), []);
	const rows = useQuery(
		api.concerts.listUpcomingShows,
		userId
			? {
					userId,
					todayDate,
					includeInterested,
				}
			: "skip",
	);
	const updateEventStatus = useMutation(api.concerts.updateEventUserStatus);

	async function handleStatusChange(
		row: ConcertEventRow,
		userStatus: ConcertUserStatus,
	) {
		if (!userId) return;

		await updateEventStatus({
			userId,
			eventId: row.eventId,
			userStatus,
		});
	}

	return (
		<UpcomingShowsList
			includeInterested={includeInterested}
			isLoading={rows === undefined}
			onIncludeInterestedChange={setIncludeInterested}
			onStatusChange={(row, userStatus) =>
				void handleStatusChange(row, userStatus)
			}
			rows={rows ?? []}
		/>
	);
}

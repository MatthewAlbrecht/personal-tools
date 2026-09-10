"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { groupByMonth } from "~/lib/album-tiers";
import { api } from "../../../../convex/_generated/api";
import { HistoryView } from "../_components/history-view";
import { useAlbums } from "../_context/albums-context";
import type { HistoryListen } from "../_utils/types";

export default function HistoryPage() {
	const { userId, albumRatings, openRatingDrawer, deleteAlbumListen } =
		useAlbums();

	// Fetch album listens (last 500)
	const albumListens = useQuery(
		api.spotify.getUserAlbumListens,
		userId ? { userId, limit: 500 } : "skip",
	);

	// Fetch latest rating timestamps for "listened again" indicator
	const latestRatingTimestamps = useQuery(
		api.spotify.getLatestRatingTimestamps,
		userId ? { userId } : "skip",
	);

	// Compute listen ordinals and group by month
	const { listensByMonth, listenOrdinals } = useMemo(() => {
		if (!albumListens)
			return {
				listensByMonth: new Map<string, HistoryListen[]>(),
				listenOrdinals: new Map<string, number>(),
			};

		const ordinals = new Map<string, number>();
		const albumCounts = new Map<string, number>();

		const sortedOldestFirst = [...albumListens].reverse();
		for (const listen of sortedOldestFirst) {
			const albumId = listen.albumId;
			const currentCount = (albumCounts.get(albumId) ?? 0) + 1;
			albumCounts.set(albumId, currentCount);
			ordinals.set(listen._id, currentCount);
		}

		return {
			listensByMonth: groupByMonth(albumListens),
			listenOrdinals: ordinals,
		};
	}, [albumListens]);

	return (
		<HistoryView
			listensByMonth={listensByMonth}
			listenOrdinals={listenOrdinals}
			albumRatings={albumRatings}
			latestRatingTimestamps={latestRatingTimestamps ?? {}}
			onRateAlbum={openRatingDrawer}
			onDeleteListen={deleteAlbumListen}
			isLoading={albumListens === undefined}
		/>
	);
}

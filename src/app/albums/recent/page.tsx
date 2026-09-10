"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { HistoryView } from "../_components/history-view";
import { useAlbums } from "../_context/albums-context";

export default function HistoryPage() {
	const { userId, albumRatings, openRatingDrawer, deleteAlbumListen } =
		useAlbums();

	// Fetch album listens (last 500), already enriched with listenCount/isFirstListen
	const albumListens = useQuery(
		api.spotify.getUserAlbumListens,
		userId ? { userId, limit: 500 } : "skip",
	);

	// Fetch latest rating timestamps for "listened again" indicator
	const latestRatingTimestamps = useQuery(
		api.spotify.getLatestRatingTimestamps,
		userId ? { userId } : "skip",
	);

	return (
		<HistoryView
			listens={albumListens ?? []}
			albumRatings={albumRatings}
			latestRatingTimestamps={latestRatingTimestamps ?? {}}
			onRateAlbum={openRatingDrawer}
			onDeleteListen={deleteAlbumListen}
			isLoading={albumListens === undefined}
		/>
	);
}

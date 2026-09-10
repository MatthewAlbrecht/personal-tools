"use client";

import { HistoryView } from "../_components/history-view";
import { useAlbums } from "../_context/albums-context";

export default function HistoryPage() {
	const { albumRatings, openRatingDrawer, deleteAlbumListen } = useAlbums();

	return (
		<HistoryView
			albumRatings={albumRatings}
			onRateAlbum={openRatingDrawer}
			onDeleteListen={deleteAlbumListen}
		/>
	);
}

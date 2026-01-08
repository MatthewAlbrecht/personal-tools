"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { TracksView } from "../_components/tracks-view";
import { useAlbums } from "../_context/albums-context";

export default function TracksPage() {
	const { userId, openAddListenDrawer } = useAlbums();

	// Fetch recently played tracks
	const recentTracks = useQuery(
		api.spotify.getRecentlyPlayedTracks,
		userId ? { userId, limit: 200 } : "skip",
	);

	return (
		<TracksView
			tracks={recentTracks ?? []}
			isLoading={recentTracks === undefined}
			onAddListen={(track) => openAddListenDrawer(track, "track")}
		/>
	);
}

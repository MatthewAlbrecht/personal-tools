"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AllAlbumsView } from "../_components/all-albums-view";
import { useAlbums } from "../_context/albums-context";

export default function AllAlbumsPage() {
	const { userId, openAddListenDrawer } = useAlbums();

	// Fetch all albums
	const allAlbums = useQuery(api.spotify.getAllAlbums, {});

	// Fetch user albums for listen data
	const userAlbums = useQuery(
		api.spotify.getUserAlbums,
		userId ? { userId } : "skip",
	);

	return (
		<AllAlbumsView
			albums={allAlbums ?? []}
			userAlbums={userAlbums ?? []}
			isLoading={allAlbums === undefined}
			onAddListen={(album) => openAddListenDrawer(album, "album")}
		/>
	);
}

"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AllAlbumsView } from "../_components/all-albums-view";
import { useAlbums } from "../_context/albums-context";

export default function AllAlbumsPage() {
	const { userId, openAddListenDrawer } = useAlbums();
	const albums = useQuery(
		api.spotify.listAlbumLibraryRows,
		userId ? { userId } : "skip",
	);

	return (
		<AllAlbumsView
			albums={albums ?? []}
			isLoading={albums === undefined}
			onAddListen={(album) => openAddListenDrawer(album, "album")}
		/>
	);
}

"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AllAlbumsView } from "../_components/all-albums-view";
import { useAlbums } from "../_context/albums-context";

export default function AllAlbumsPage() {
	const { userId, openAddListenDrawer, openRatingDrawer } = useAlbums();
	const albums = useQuery(
		api.spotify.listAlbumLibraryRows,
		userId ? { userId } : "skip",
	);

	return (
		<AllAlbumsView
			albums={albums ?? []}
			isLoading={albums === undefined}
			onAddListen={(album) => openAddListenDrawer(album, "album")}
			onRateAlbum={(album) =>
				openRatingDrawer({
					_id: album._id,
					albumId: album._id,
					listenedAt: album.lastListenedAt ?? Date.now(),
					album: {
						name: album.name,
						artistName: album.artistName,
						imageUrl: album.imageUrl,
						releaseDate: album.releaseDate,
					},
				})
			}
		/>
	);
}

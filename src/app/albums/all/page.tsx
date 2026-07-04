"use client";

import { useQuery } from "convex/react";
import { Suspense } from "react";
import { api } from "../../../../convex/_generated/api";
import { AllAlbumsView } from "../_components/all-albums-view";
import { useAlbums } from "../_context/albums-context";

export default function AllAlbumsPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading albums...</p>
				</div>
			}
		>
			<AllAlbumsPageInner />
		</Suspense>
	);
}

function AllAlbumsPageInner() {
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

"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { api } from "../../../../convex/_generated/api";
import {
	AllAlbumsView,
	getAlbumLibraryReleaseYearFilter,
	parseAlbumLibraryFilterState,
} from "../_components/all-albums-view";
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
	const searchParams = useSearchParams();
	const searchParamsString = searchParams?.toString() ?? "";
	const filterState = useMemo(
		() => parseAlbumLibraryFilterState(new URLSearchParams(searchParamsString)),
		[searchParamsString],
	);
	const releaseYear = getAlbumLibraryReleaseYearFilter(filterState.yearFilter);
	const filters = useMemo(
		() => ({
			search: filterState.searchQuery,
			rymStatus: filterState.rymFilter,
			robRankingStatus: filterState.robRankingFilter,
			listenStatus: filterState.listenFilter,
			albumType: filterState.albumTypeFilter,
			...(releaseYear === undefined ? {} : { releaseYear }),
		}),
		[filterState, releaseYear],
	);
	const albums = usePaginatedQuery(
		api.spotify.listAlbumLibraryRowsPaginated,
		userId
			? {
					userId,
					filters,
					sortBy: filterState.sortBy,
				}
			: "skip",
		{ initialNumItems: 50 },
	);
	const releaseYears = useQuery(
		api.spotify.listAlbumLibraryReleaseYears,
		userId ? { userId } : "skip",
	);

	return (
		<AllAlbumsView
			userId={userId}
			albums={albums.results ?? []}
			availableYears={releaseYears ?? []}
			isLoading={albums.status === "LoadingFirstPage"}
			isLoadingMore={albums.status === "LoadingMore"}
			canLoadMore={albums.status === "CanLoadMore"}
			onLoadMore={() => albums.loadMore(50)}
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

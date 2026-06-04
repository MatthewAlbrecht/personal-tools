"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Disc3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { AlbumRatingDrawer } from "~/components/album-rating-drawer";
import { LoginPrompt } from "~/components/login-prompt";
import { useAlbumRatingDrawer } from "~/lib/hooks/use-album-rating-drawer";
import { useForLaterRymAssociateDrawer } from "~/lib/hooks/use-for-later-rym-associate-drawer";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { ForLaterFilters } from "./_components/for-later-filters";
import { ForLaterHeader } from "./_components/for-later-header";
import { ForLaterList } from "./_components/for-later-list";
import { ForLaterRymAssociateDrawer } from "./_components/for-later-rym-associate-drawer";
import {
	addUniqueSortedKey,
	parseForLaterFilters,
	serializeForLaterFilters,
} from "./_utils/filter-state";
import { albumToRateFromForLaterRow } from "./_utils/rating";
import type {
	ForLaterAlbumRowData,
	ForLaterFilters as ForLaterFiltersState,
} from "./_utils/types";

export default function ForLaterAlbumsPage() {
	return (
		<Suspense
			fallback={
				<div className="container mx-auto max-w-6xl p-6">
					<div className="flex h-[50vh] items-center justify-center">
						<p className="text-muted-foreground">Loading...</p>
					</div>
				</div>
			}
		>
			<ForLaterAlbumsPageInner />
		</Suspense>
	);
}

function ForLaterAlbumsPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { userId, isLoading, isConnected, getValidAccessToken, connection } =
		useSpotifyAuth();
	const urlSearchParams = searchParams ?? new URLSearchParams();
	const filters = useMemo(
		() => parseForLaterFilters(urlSearchParams),
		[urlSearchParams],
	);

	const summary = useQuery(
		api.forLaterAlbums.getForLaterUiSummary,
		userId ? { userId } : "skip",
	);

	const rows = usePaginatedQuery(
		api.forLaterAlbums.listForLaterAlbumRows,
		userId ? { userId, filters } : "skip",
		{ initialNumItems: 30 },
	);

	const {
		albumToRate,
		openRatingDrawer,
		closeRatingDrawer,
		handleSaveRating,
		ratedAlbumsForYear,
	} = useAlbumRatingDrawer({ userId });

	const {
		associateRow,
		openAssociateDrawer,
		closeAssociateDrawer,
		handleAssociate,
	} = useForLaterRymAssociateDrawer({ userId });

	function handleRateAlbum(row: ForLaterAlbumRowData): void {
		const album = albumToRateFromForLaterRow(row);
		if (!album) {
			return;
		}
		openRatingDrawer(album);
	}

	function updateFilters(nextFilters: ForLaterFiltersState): void {
		const nextParams = serializeForLaterFilters(nextFilters);
		const query = nextParams.toString();
		router.replace(query ? `/for-later-albums?${query}` : "/for-later-albums");
	}

	function addGenreKeyToFilters(key: string): void {
		updateFilters({
			...filters,
			genreKeys: addUniqueSortedKey(filters.genreKeys, key),
		});
	}

	function addDescriptorKeyToFilters(key: string): void {
		updateFilters({
			...filters,
			descriptorKeys: addUniqueSortedKey(filters.descriptorKeys, key),
		});
	}

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-6xl p-6">
				<div className="flex h-[50vh] items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Disc3}
				message="Please log in to view For Later Albums"
				redirectPath="/for-later-albums"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="space-y-6">
				<ForLaterHeader
					userId={userId}
					spotifyDisplayName={connection?.displayName}
					isConnected={isConnected}
					getValidAccessToken={getValidAccessToken}
					summary={summary}
				/>
				<ForLaterFilters filters={filters} onChange={updateFilters} />
				<ForLaterList
					rows={rows.results ?? []}
					userId={userId}
					isLoading={rows.status === "LoadingFirstPage"}
					isLoadingMore={rows.status === "LoadingMore"}
					canLoadMore={rows.status === "CanLoadMore"}
					onLoadMore={() => rows.loadMore(30)}
					onRateAlbum={handleRateAlbum}
					onLinkRymAlbum={openAssociateDrawer}
					onAddGenreKey={addGenreKeyToFilters}
					onAddDescriptorKey={addDescriptorKeyToFilters}
				/>
			</div>
			<AlbumRatingDrawer
				albumToRate={albumToRate}
				ratedAlbumsForYear={ratedAlbumsForYear}
				open={albumToRate !== null}
				onOpenChange={(open) => {
					if (!open) closeRatingDrawer();
				}}
				onSave={handleSaveRating}
			/>
			<ForLaterRymAssociateDrawer
				row={associateRow}
				open={associateRow !== null}
				onOpenChange={(open) => {
					if (!open) closeAssociateDrawer();
				}}
				onAssociate={handleAssociate}
			/>
		</div>
	);
}

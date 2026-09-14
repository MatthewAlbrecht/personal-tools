"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Disc3, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlbumRatingDrawer } from "~/components/album-rating-drawer";
import { LoginPrompt } from "~/components/login-prompt";
import { badgeVariants } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { useAlbumRatingDrawer } from "~/lib/hooks/use-album-rating-drawer";
import { useForLaterRecommendationDrawer } from "~/lib/hooks/use-for-later-recommendation-drawer";
import { useForLaterRymAssociateDrawer } from "~/lib/hooks/use-for-later-rym-associate-drawer";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	ForLaterFilters,
	forLaterActiveFilterCount,
} from "../../for-later-albums/_components/for-later-filters";
import { ForLaterHeader } from "../../for-later-albums/_components/for-later-header";
import { ForLaterList } from "../../for-later-albums/_components/for-later-list";
import { ForLaterRecommendationDrawer } from "../../for-later-albums/_components/for-later-recommendation-drawer";
import { ForLaterRymAssociateDrawer } from "../../for-later-albums/_components/for-later-rym-associate-drawer";
import {
	addUniqueSortedKey,
	parseForLaterFilters,
	serializeForLaterFilters,
} from "../../for-later-albums/_utils/filter-state";
import { albumToRateFromForLaterRow } from "../../for-later-albums/_utils/rating";
import type {
	ForLaterAlbumRowData,
	ForLaterFilters as ForLaterFiltersState,
} from "../../for-later-albums/_utils/types";

const UP_NEXT_BASE_PATH = "/albums/up-next";

export function UpNextView() {
	return (
		<Suspense
			fallback={
				<div className="flex h-[40vh] items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			}
		>
			<UpNextViewInner />
		</Suspense>
	);
}

function UpNextViewInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { userId, isLoading, isConnected, getValidAccessToken, connection } =
		useSpotifyAuth();
	const urlSearchParams = searchParams ?? new URLSearchParams();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filters = useMemo(
		() => parseForLaterFilters(urlSearchParams),
		[urlSearchParams],
	);
	const activeFilterCount = forLaterActiveFilterCount(filters);

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
		optimisticRymLinks,
	} = useForLaterRymAssociateDrawer({ userId });
	const {
		isRecommendationDrawerOpen,
		openRecommendationDrawer,
		setRecommendationDrawerOpen,
	} = useForLaterRecommendationDrawer();

	const displayRows = useMemo(
		() =>
			(rows.results ?? []).map((row) =>
				withOptimisticRym(row, optimisticRymLinks),
			),
		[optimisticRymLinks, rows.results],
	);

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
		router.replace(query ? `${UP_NEXT_BASE_PATH}?${query}` : UP_NEXT_BASE_PATH);
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
			<div className="flex h-[40vh] items-center justify-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Disc3}
				message="Please log in to view Queue"
				redirectPath={UP_NEXT_BASE_PATH}
			/>
		);
	}

	const filterControls = (
		<ForLaterFilters
			userId={userId}
			filters={filters}
			onChange={updateFilters}
		/>
	);

	return (
		<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
			<div className="w-full min-w-0 max-w-xl space-y-6 md:max-w-2xl xl:w-2xl xl:shrink-0">
				<ForLaterHeader
					userId={userId}
					spotifyDisplayName={connection?.displayName}
					isConnected={isConnected}
					getValidAccessToken={getValidAccessToken}
					summary={summary}
					onOpenRecommendationDrawer={openRecommendationDrawer}
				/>
				<div className="xl:hidden">
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-expanded={filtersOpen}
						aria-controls="for-later-filters-sheet"
						onClick={() => setFiltersOpen(true)}
					>
						<SlidersHorizontal className="h-4 w-4" />
						Filters
						{activeFilterCount > 0 ? (
							<span
								className={cn(
									badgeVariants(),
									"fade-in-0 zoom-in-90 ml-1 animate-in px-1.5 text-[0.65rem] duration-200",
								)}
							>
								{activeFilterCount}
							</span>
						) : null}
					</Button>
				</div>
				<ForLaterList
					rows={displayRows}
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

			<aside className="hidden w-48 shrink-0 xl:block">
				<div className="max-h-[calc(100vh-3.5rem-var(--albums-sticky-inset,0px))] overflow-y-auto overscroll-contain border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-[calc(3.5rem+var(--albums-sticky-inset,0px))] xl:z-10">
					<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
						Filters
					</p>
					{filterControls}
				</div>
			</aside>

			<Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
				<SheetContent
					id="for-later-filters-sheet"
					side="right"
					className="w-[17rem] gap-0"
				>
					<SheetHeader>
						<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
							Filters
						</SheetTitle>
						<SheetDescription>Search and narrow your queue.</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-4 px-4 pb-6">{filterControls}</div>
				</SheetContent>
			</Sheet>

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
			<ForLaterRecommendationDrawer
				userId={userId}
				open={isRecommendationDrawerOpen}
				onOpenChange={setRecommendationDrawerOpen}
			/>
		</div>
	);
}

function withOptimisticRym(
	row: ForLaterAlbumRowData,
	overlays: Map<string, { rymStatus: "matched"; rymUrl: string }>,
): ForLaterAlbumRowData {
	const overlay = overlays.get(row.albumId);
	if (!overlay) return row;
	return { ...row, ...overlay, rymNotOnSite: undefined };
}

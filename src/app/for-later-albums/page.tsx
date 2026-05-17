"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Disc3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { LoginPrompt } from "~/components/login-prompt";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { ForLaterFilters } from "./_components/for-later-filters";
import { ForLaterHeader } from "./_components/for-later-header";
import { ForLaterList } from "./_components/for-later-list";
import {
	addUniqueSortedKey,
	parseForLaterFilters,
	serializeForLaterFilters,
} from "./_utils/filter-state";
import type { ForLaterFilters as ForLaterFiltersState } from "./_utils/types";

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
	const [batchSize, setBatchSize] = useState<5 | 10 | 20>(10);

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

	const openableLinks = useQuery(
		api.forLaterAlbums.listOpenableRymLinks,
		userId ? { userId, filters, limit: batchSize } : "skip",
	);

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
					visibleRows={rows.results ?? []}
					openableLinks={openableLinks ?? []}
					batchSize={batchSize}
					onBatchSizeChange={setBatchSize}
				/>
				<ForLaterFilters filters={filters} onChange={updateFilters} />
				<ForLaterList
					rows={rows.results ?? []}
					isLoading={rows.status === "LoadingFirstPage"}
					isLoadingMore={rows.status === "LoadingMore"}
					canLoadMore={rows.status === "CanLoadMore"}
					onLoadMore={() => rows.loadMore(30)}
					onAddGenreKey={addGenreKeyToFilters}
					onAddDescriptorKey={addDescriptorKeyToFilters}
				/>
			</div>
		</div>
	);
}

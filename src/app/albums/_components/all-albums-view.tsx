"use client";

import { useMutation } from "convex/react";
import { Check, Copy, DatabaseBackup, Disc3, Download, MoreHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	AlbumLibraryAlbumType,
	AlbumLibraryListenStatus,
	AlbumLibraryRobRankingStatus,
	AlbumLibraryRymStatus,
} from "../../../../convex/_utils/albumLibraryRows";
import { formatRelativeTime } from "../_utils/formatters";
import type { AlbumLibraryRowData } from "../_utils/types";
import { AlbumRymAssociateDrawer } from "./album-rym-associate-drawer";

type CopiedField = "album" | "artist";
type AlbumLibrarySort = "recent" | "artist";

type AlbumLibraryFilterState = {
	searchQuery: string;
	rymFilter: AlbumLibraryRymStatus;
	robRankingFilter: AlbumLibraryRobRankingStatus;
	listenFilter: AlbumLibraryListenStatus;
	albumTypeFilter: AlbumLibraryAlbumType;
	yearFilter: string;
	sortBy: AlbumLibrarySort;
};

const DEFAULT_ALBUM_LIBRARY_FILTERS: AlbumLibraryFilterState = {
	searchQuery: "",
	rymFilter: "all",
	robRankingFilter: "all",
	listenFilter: "all",
	albumTypeFilter: "album",
	yearFilter: "all",
	sortBy: "recent",
};

const ALBUM_LIBRARY_SEARCH_DEBOUNCE_MS = 300;

const ALBUM_LIBRARY_QUERY_PARAMS = [
	"search",
	"rym",
	"rob",
	"listens",
	"type",
	"year",
	"sort",
] as const;

type AllAlbumsViewProps = {
	userId: string | null;
	albums: AlbumLibraryRowData[];
	availableYears: number[];
	isLoading: boolean;
	isLoadingMore: boolean;
	canLoadMore: boolean;
	onLoadMore: () => void;
	onAddListen: (album: AlbumLibraryRowData) => void;
	onRateAlbum: (album: AlbumLibraryRowData) => void;
};

export function AllAlbumsView({
	userId,
	albums,
	availableYears,
	isLoading,
	isLoadingMore,
	canLoadMore,
	onLoadMore,
	onAddListen,
	onRateAlbum,
}: AllAlbumsViewProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const albumLibraryPathname = pathname ?? "/albums/all";
	const searchParamsString = searchParams?.toString() ?? "";
	const filterState = useMemo(
		() => parseAlbumLibraryFilterState(new URLSearchParams(searchParamsString)),
		[searchParamsString],
	);
	const {
		rymFilter,
		robRankingFilter,
		listenFilter,
		albumTypeFilter,
		yearFilter,
		sortBy,
	} = filterState;
	const filterStateRef = useRef(filterState);
	filterStateRef.current = filterState;
	const routerRef = useRef(router);
	routerRef.current = router;
	const searchParamsStringRef = useRef(searchParamsString);
	searchParamsStringRef.current = searchParamsString;
	const albumLibraryPathnameRef = useRef(albumLibraryPathname);
	albumLibraryPathnameRef.current = albumLibraryPathname;
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		filterState.searchQuery,
		ALBUM_LIBRARY_SEARCH_DEBOUNCE_MS,
	);

	useEffect(() => {
		setSearchInput(filterState.searchQuery);
	}, [filterState.searchQuery, setSearchInput]);

	useEffect(() => {
		const nextSearch = debouncedSearch.trim();
		if (nextSearch === filterStateRef.current.searchQuery) {
			return;
		}
		const nextFilters = {
			...filterStateRef.current,
			searchQuery: nextSearch,
		};
		const nextParams = serializeAlbumLibraryFilterState(
			nextFilters,
			new URLSearchParams(searchParamsStringRef.current),
		);
		const query = nextParams.toString();
		routerRef.current.replace(
			query
				? `${albumLibraryPathnameRef.current}?${query}`
				: albumLibraryPathnameRef.current,
			{ scroll: false },
		);
	}, [debouncedSearch]);

	const hasNonDefaultFilters =
		searchInput.trim() !== DEFAULT_ALBUM_LIBRARY_FILTERS.searchQuery ||
		!albumLibraryFiltersAreDefault(filterState);
	const [rymAssociateAlbum, setRymAssociateAlbum] =
		useState<AlbumLibraryRowData | null>(null);
	const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
	const [isBackfillingLibraryIndex, setIsBackfillingLibraryIndex] =
		useState(false);
	const [isBackfillingTitleKeys, setIsBackfillingTitleKeys] = useState(false);
	const [isBackfillingRymLinks, setIsBackfillingRymLinks] = useState(false);
	const [isBackfillingReleaseYearSortKey, setIsBackfillingReleaseYearSortKey] =
		useState(false);
	const isRunningLibraryAction =
		isBackfillingLibraryIndex ||
		isBackfillingTitleKeys ||
		isBackfillingRymLinks ||
		isBackfillingReleaseYearSortKey;
	const setRymNotOnSite = useMutation(api.spotify.setSpotifyAlbumRymNotOnSite);
	const associateRymScrape = useMutation(
		api.spotify.associateSpotifyAlbumWithRymScrape,
	);
	const backfillSpotifyAlbumTitleKeys = useMutation(
		api.spotify.backfillSpotifyAlbumTitleKeys,
	);
	const backfillAlbumLibraryItems = useMutation(
		api.spotify.backfillAlbumLibraryItems,
	);
	const backfillAlbumLibraryReleaseYearSortKey = useMutation(
		api.spotify.backfillAlbumLibraryReleaseYearSortKey,
	);
	const backfillRymLinks = useMutation(
		api.rateYourMusicScrapes.backfillRymScrapeSpotifyAlbumMatches,
	);
	const availableYearOptions = useMemo(() => {
		const years = new Set(availableYears);
		const selectedYear = getAlbumLibraryReleaseYearFilter(yearFilter);
		if (selectedYear !== undefined) years.add(selectedYear);
		return Array.from(years).sort((a, b) => b - a);
	}, [availableYears, yearFilter]);

	async function handleSetRymNotOnSite(
		album: AlbumLibraryRowData,
		notOnSite: boolean,
	): Promise<void> {
		try {
			await setRymNotOnSite({
				albumId: album._id as Id<"spotifyAlbums">,
				notOnSite,
			});
			toast.success(
				notOnSite ? "Marked as not on RYM" : "Cleared not-on-RYM mark",
			);
		} catch (error) {
			console.error("Failed to update RYM availability:", error);
			toast.error("Could not update RYM availability");
		}
	}

	async function handleAssociateRymScrape(
		scrapeId: Id<"rateYourMusicScrapes">,
	): Promise<void> {
		if (!rymAssociateAlbum) return;

		const albumName = rymAssociateAlbum.name;
		try {
			await associateRymScrape({
				albumId: rymAssociateAlbum._id as Id<"spotifyAlbums">,
				scrapeId,
			});
			setRymAssociateAlbum(null);
			toast.success(`Linked RYM page for "${albumName}"`);
		} catch (error) {
			console.error("Failed to associate RYM scrape:", error);
			toast.error("Could not link RYM scrape");
		}
	}

	async function handleBackfillLibraryIndex(): Promise<void> {
		if (!userId) {
			toast.error("Sign in to build the library index");
			return;
		}

		setIsBackfillingLibraryIndex(true);
		const toastId = "album-library-index-backfill";
		try {
			toast.loading("Building library index...", { id: toastId });
			let processed = 0;
			let cursor: string | undefined;
			for (;;) {
				const batch = await backfillAlbumLibraryItems({
					userId,
					batchSize: 500,
					...(cursor === undefined ? {} : { cursor }),
				});
				processed += batch.processed;
				if (batch.done) {
					break;
				}
				cursor = batch.cursor;
				toast.loading(`Building library index... ${processed} albums`, {
					id: toastId,
				});
			}
			toast.success(
				`Library index built for ${processed} album${processed === 1 ? "" : "s"}`,
				{ id: toastId },
			);
		} catch (error) {
			console.error("Album library index backfill failed:", error);
			toast.error("Could not build library index", { id: toastId });
		} finally {
			setIsBackfillingLibraryIndex(false);
		}
	}

	async function handleBackfillTitleKeys(): Promise<void> {
		setIsBackfillingTitleKeys(true);
		const toastId = "spotify-album-title-key-backfill";
		try {
			toast.loading("Backfilling album title keys...", { id: toastId });
			let updated = 0;
			let processed = 0;
			for (;;) {
				const batch = await backfillSpotifyAlbumTitleKeys({ batchSize: 500 });
				updated += batch.updated;
				processed += batch.processed;
				if (batch.done) {
					break;
				}
			}
			toast.success(
				`Processed ${processed} album${processed === 1 ? "" : "s"} and updated ${updated} title key${updated === 1 ? "" : "s"}`,
				{ id: toastId },
			);
		} catch (error) {
			console.error("Album title key backfill failed:", error);
			toast.error("Could not backfill album title keys", { id: toastId });
		} finally {
			setIsBackfillingTitleKeys(false);
		}
	}

	async function handleBackfillReleaseYearSortKeys(): Promise<void> {
		setIsBackfillingReleaseYearSortKey(true);
		const toastId = "album-library-release-year-sort-backfill";
		try {
			toast.loading("Updating artist sort keys...", { id: toastId });
			let patched = 0;
			let cursor: string | undefined;
			for (;;) {
				const batch = await backfillAlbumLibraryReleaseYearSortKey({
					batchSize: 500,
					...(cursor === undefined ? {} : { cursor }),
				});
				patched += batch.patched;
				if (batch.done) {
					break;
				}
				cursor = batch.cursor;
				toast.loading(`Updating artist sort keys... ${patched} updated`, {
					id: toastId,
				});
			}
			toast.success(
				`Artist sort keys updated for ${patched} album${patched === 1 ? "" : "s"}`,
				{ id: toastId },
			);
		} catch (error) {
			console.error("Release year sort key backfill failed:", error);
			toast.error("Could not update artist sort keys", { id: toastId });
		} finally {
			setIsBackfillingReleaseYearSortKey(false);
		}
	}

	async function handleBackfillRymLinks(): Promise<void> {
		setBackfillDialogOpen(false);
		setIsBackfillingRymLinks(true);
		const toastId = "rym-scrape-spotify-backfill";
		try {
			toast.loading("Backfilling recent RYM links...", { id: toastId });
			const result = await backfillRymLinks({
				limit: 100,
				scanLimit: 1000,
				albumLimit: 5000,
			});
			toast.success(
				`Scanned ${result.scannedScrapes}, skipped ${result.skippedAlreadyLinked}, processed ${result.processedScrapes}, created ${result.linkedAlbums} link${result.linkedAlbums === 1 ? "" : "s"}`,
				{ id: toastId },
			);
		} catch (error) {
			console.error("RYM link backfill failed:", error);
			toast.error("Could not backfill RYM links", { id: toastId });
		} finally {
			setIsBackfillingRymLinks(false);
		}
	}

	function updateFilterQuery(patch: Partial<AlbumLibraryFilterState>): void {
		const nextFilters = {
			...filterState,
			...patch,
		};
		const nextParams = serializeAlbumLibraryFilterState(
			nextFilters,
			new URLSearchParams(searchParamsString),
		);
		const query = nextParams.toString();
		router.replace(
			query ? `${albumLibraryPathname}?${query}` : albumLibraryPathname,
			{ scroll: false },
		);
	}

	function clearFilters(): void {
		const nextParams = serializeAlbumLibraryFilterState(
			DEFAULT_ALBUM_LIBRARY_FILTERS,
			new URLSearchParams(searchParamsString),
		);
		const query = nextParams.toString();
		router.replace(
			query ? `${albumLibraryPathname}?${query}` : albumLibraryPathname,
			{ scroll: false },
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<AlbumLibraryAdminMenu
					userId={userId}
					isRunningLibraryAction={isRunningLibraryAction}
					isBackfillingLibraryIndex={isBackfillingLibraryIndex}
					isBackfillingTitleKeys={isBackfillingTitleKeys}
					isBackfillingRymLinks={isBackfillingRymLinks}
					isBackfillingReleaseYearSortKey={isBackfillingReleaseYearSortKey}
					onBuildLibraryIndex={() => void handleBackfillLibraryIndex()}
					onBackfillTitleKeys={() => void handleBackfillTitleKeys()}
					onBackfillReleaseYearSortKeys={() =>
						void handleBackfillReleaseYearSortKeys()
					}
					onBackfillRymLinks={() => setBackfillDialogOpen(true)}
				/>
			</div>

			{/* Filters */}
			<div className="space-y-3">
				{/* Search Input */}
				<div>
					<input
						type="text"
						placeholder="Search albums by name or artist..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>

				{/* Filter Controls */}
				<div className="flex flex-wrap items-center gap-4">
					{/* Release Year Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="year-filter" className="font-medium text-sm">
							Year:
						</label>
						<select
							id="year-filter"
							value={yearFilter}
							onChange={(e) =>
								updateFilterQuery({ yearFilter: e.target.value })
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Years</option>
							{availableYearOptions.map((year) => (
								<option key={year} value={year.toString()}>
									{year}
								</option>
							))}
						</select>
					</div>

					{/* Album Type Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="album-type-filter" className="font-medium text-sm">
							Type:
						</label>
						<select
							id="album-type-filter"
							value={albumTypeFilter}
							onChange={(e) =>
								updateFilterQuery({
									albumTypeFilter: e.target.value as AlbumLibraryAlbumType,
								})
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Types</option>
							<option value="album">Albums</option>
							<option value="single">Singles</option>
						</select>
					</div>

					{/* Listen Status Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="listen-filter" className="font-medium text-sm">
							Listens:
						</label>
						<select
							id="listen-filter"
							value={listenFilter}
							onChange={(e) =>
								updateFilterQuery({
									listenFilter: e.target.value as AlbumLibraryListenStatus,
								})
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Albums</option>
							<option value="listened">Listened</option>
							<option value="unlistened">Unlistened</option>
						</select>
					</div>

					{/* RYM Status Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="rym-filter" className="font-medium text-sm">
							RYM:
						</label>
						<select
							id="rym-filter"
							value={rymFilter}
							onChange={(e) =>
								updateFilterQuery({
									rymFilter: e.target.value as AlbumLibraryRymStatus,
								})
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All</option>
							<option value="linked">Linked</option>
							<option value="unlinked">Unlinked</option>
						</select>
					</div>

					{/* Rob Ranking Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="rob-ranking-filter" className="font-medium text-sm">
							Rob:
						</label>
						<select
							id="rob-ranking-filter"
							value={robRankingFilter}
							onChange={(e) =>
								updateFilterQuery({
									robRankingFilter: e.target
										.value as AlbumLibraryRobRankingStatus,
								})
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All</option>
							<option value="appears">Appears</option>
							<option value="not_appears">Does not appear</option>
						</select>
					</div>

					{/* Sort Control */}
					<div className="flex items-center gap-2">
						<label htmlFor="album-sort" className="font-medium text-sm">
							Sort:
						</label>
						<select
							id="album-sort"
							value={sortBy}
							onChange={(e) =>
								updateFilterQuery({
									sortBy: e.target.value as AlbumLibrarySort,
								})
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="recent">Recent</option>
							<option value="artist">Artist name</option>
						</select>
					</div>

					<p className="text-muted-foreground text-sm">
						Showing {albums.length} loaded
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!hasNonDefaultFilters}
						onClick={clearFilters}
					>
						Clear filters
					</Button>
				</div>
			</div>

			{/* Albums List */}
			<div className="space-y-1">
				{isLoading && albums.length === 0 ? (
					<AlbumLibraryListLoadingState />
				) : albums.length === 0 ? (
					<AllAlbumsEmptyState
						hasFilters={hasNonDefaultFilters}
						canLoadMore={canLoadMore}
						isLoadingMore={isLoadingMore}
						isBuildingLibraryIndex={isBackfillingLibraryIndex}
						canBuildLibraryIndex={Boolean(userId)}
						onBuildLibraryIndex={() => void handleBackfillLibraryIndex()}
						onLoadMore={onLoadMore}
					/>
				) : (
					albums.map((album) => (
						<AlbumCardRow
							key={album._id}
							album={album}
							onAddListen={() => onAddListen(album)}
							onRate={() => onRateAlbum(album)}
							onLinkRym={() => setRymAssociateAlbum(album)}
							onSetRymNotOnSite={(notOnSite) =>
								handleSetRymNotOnSite(album, notOnSite)
							}
						/>
					))
				)}
			</div>
			{albums.length > 0 && (canLoadMore || isLoadingMore) ? (
				<div className="flex justify-center pt-2">
					<LoadMoreAlbumsButton
						isLoadingMore={isLoadingMore}
						onLoadMore={onLoadMore}
					/>
				</div>
			) : null}
			<AlbumRymAssociateDrawer
				album={rymAssociateAlbum}
				open={rymAssociateAlbum !== null}
				onOpenChange={(open) => {
					if (!open) setRymAssociateAlbum(null);
				}}
				onAssociate={handleAssociateRymScrape}
			/>
			<AlertDialog
				open={backfillDialogOpen}
				onOpenChange={setBackfillDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Backfill recent RYM links?</AlertDialogTitle>
						<AlertDialogDescription>
							This checks the most recently updated RYM scrapes against your
							Spotify album library and creates any safe matches. It will not
							delete existing links or mark albums as not on RYM.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleBackfillRymLinks()}>
							Run backfill
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function AlbumLibraryListLoadingState() {
	return (
		<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
			<p className="text-muted-foreground text-sm">Loading albums...</p>
		</div>
	);
}

function AlbumLibraryAdminMenu({
	userId,
	isRunningLibraryAction,
	isBackfillingLibraryIndex,
	isBackfillingTitleKeys,
	isBackfillingRymLinks,
	isBackfillingReleaseYearSortKey,
	onBuildLibraryIndex,
	onBackfillTitleKeys,
	onBackfillReleaseYearSortKeys,
	onBackfillRymLinks,
}: {
	userId: string | null;
	isRunningLibraryAction: boolean;
	isBackfillingLibraryIndex: boolean;
	isBackfillingTitleKeys: boolean;
	isBackfillingRymLinks: boolean;
	isBackfillingReleaseYearSortKey: boolean;
	onBuildLibraryIndex: () => void;
	onBackfillTitleKeys: () => void;
	onBackfillReleaseYearSortKeys: () => void;
	onBackfillRymLinks: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					disabled={isRunningLibraryAction}
					aria-label="Library setup actions"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>Library setup</DropdownMenuLabel>
				<DropdownMenuItem
					disabled={isRunningLibraryAction || !userId}
					onSelect={onBuildLibraryIndex}
				>
					<DatabaseBackup className="size-4" />
					{isBackfillingLibraryIndex
						? "Building index..."
						: "Build library index"}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={isRunningLibraryAction}
					onSelect={onBackfillReleaseYearSortKeys}
				>
					<DatabaseBackup className="size-4" />
					{isBackfillingReleaseYearSortKey
						? "Updating artist sort..."
						: "Update artist sort keys"}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={isRunningLibraryAction}
					onSelect={onBackfillTitleKeys}
				>
					<DatabaseBackup className="size-4" />
					{isBackfillingTitleKeys
						? "Backfilling title keys..."
						: "Backfill title keys"}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={isRunningLibraryAction}
					onSelect={onBackfillRymLinks}
				>
					<DatabaseBackup className="size-4" />
					{isBackfillingRymLinks
						? "Backfilling RYM links..."
						: "Backfill RYM links"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AllAlbumsEmptyState({
	hasFilters,
	canLoadMore,
	isLoadingMore,
	isBuildingLibraryIndex,
	canBuildLibraryIndex,
	onBuildLibraryIndex,
	onLoadMore,
}: {
	hasFilters: boolean;
	canLoadMore: boolean;
	isLoadingMore: boolean;
	isBuildingLibraryIndex: boolean;
	canBuildLibraryIndex: boolean;
	onBuildLibraryIndex: () => void;
	onLoadMore: () => void;
}) {
	if (canLoadMore) {
		return (
			<div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
				<div className="space-y-3 text-center">
					<p className="text-muted-foreground text-sm">
						No matches loaded yet. Load more to continue searching.
					</p>
					<LoadMoreAlbumsButton
						isLoadingMore={isLoadingMore}
						onLoadMore={onLoadMore}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
			<div className="text-center">
				<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
				<p className="mt-4 text-muted-foreground">
					{hasFilters
						? "No albums match the selected filters"
						: "No albums found"}
				</p>
				<p className="mt-1 text-muted-foreground text-sm">
					{hasFilters
						? "Try adjusting the filters to see more albums."
						: "Build the library index once, or sync Spotify history first."}
				</p>
				{!hasFilters && canBuildLibraryIndex ? (
					<Button
						type="button"
						className="mt-4"
						disabled={isBuildingLibraryIndex}
						onClick={onBuildLibraryIndex}
					>
						<DatabaseBackup className="size-4" />
						{isBuildingLibraryIndex
							? "Building index..."
							: "Build library index"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

function LoadMoreAlbumsButton({
	isLoadingMore,
	onLoadMore,
}: {
	isLoadingMore: boolean;
	onLoadMore: () => void;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			onClick={onLoadMore}
			disabled={isLoadingMore}
		>
			{isLoadingMore ? "Loading..." : "Load more"}
		</Button>
	);
}

function AlbumCardRow({
	album,
	onAddListen,
	onRate,
	onLinkRym,
	onSetRymNotOnSite,
}: {
	album: AlbumLibraryRowData;
	onAddListen: () => void;
	onRate: () => void;
	onLinkRym: () => void;
	onSetRymNotOnSite: (notOnSite: boolean) => Promise<void>;
}) {
	const artworkUrl = album.imageUrl;
	const [copiedField, setCopiedField] = useState<CopiedField | null>(null);
	const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimeoutRef.current) {
				clearTimeout(copiedTimeoutRef.current);
			}
		};
	}, []);

	async function handleCopyText(
		text: string,
		field: CopiedField,
	): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedField(field);

			if (copiedTimeoutRef.current) {
				clearTimeout(copiedTimeoutRef.current);
			}

			copiedTimeoutRef.current = setTimeout(() => {
				setCopiedField(null);
			}, 1400);
		} catch (error) {
			console.error("Failed to copy text:", error);
		}
	}

	return (
		<div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
			{/* Album Cover */}
			<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
				{artworkUrl ? (
					<img
						src={artworkUrl}
						alt={album.name}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>

			{/* Album Info */}
			<div className="min-w-0 flex-1">
				<p className="flex min-w-0 items-center gap-2 font-medium text-sm">
					<button
						type="button"
						className="min-w-0 truncate rounded-sm text-left underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Copy album name"
						onClick={() => void handleCopyText(album.name, "album")}
					>
						{album.name}
					</button>
					<CopiedIndicator visible={copiedField === "album"} />
				</p>
				<p className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
					<button
						type="button"
						className="min-w-0 truncate rounded-sm text-left underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Copy artist name"
						onClick={() => void handleCopyText(album.artistName, "artist")}
					>
						{album.artistName}
					</button>
					{album.releaseYear && (
						<span className="text-muted-foreground/60">
							{" · "}
							{album.releaseYear}
						</span>
					)}
					<CopiedIndicator visible={copiedField === "artist"} />
				</p>
				<div className="mt-1 flex flex-wrap gap-1">
					<RymStatusBadge album={album} onLinkRym={onLinkRym} />
					<RobRankingBadge years={album.robRankingYears} />
				</div>
				<TaxonomyLines album={album} />
			</div>

			{/* Listen Info */}
			<div className="flex flex-shrink-0 items-center gap-2">
				{album.lastListenedAt && (
					<span className="flex-shrink-0 text-muted-foreground text-xs">
						{formatRelativeTime(album.lastListenedAt)}
					</span>
				)}

				{album.rating !== undefined && (
					<AlbumRatingBadge
						rating={album.rating}
						onClick={(event) => {
							event.stopPropagation();
							onRate();
						}}
					/>
				)}

				{album.listenCount > 0 && (
					<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
						{album.listenCount}×
					</span>
				)}

				{artworkUrl ? (
					<>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								void copyArtworkUrl(artworkUrl);
							}}
							className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/50 transition-all hover:border-muted-foreground/40 hover:text-muted-foreground"
							title="Copy artwork URL"
							aria-label="Copy artwork URL"
						>
							<Copy className="h-3 w-3" />
							Copy art
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								void downloadArtwork(artworkUrl, album);
							}}
							className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/50 transition-all hover:border-muted-foreground/40 hover:text-muted-foreground"
							title="Download artwork"
							aria-label="Download artwork"
						>
							<Download className="h-3 w-3" />
							Download
						</button>
					</>
				) : null}

				{/* Add Listen Button */}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onAddListen();
					}}
					className="inline-flex items-center rounded-full border border-muted-foreground/20 border-dashed px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
					title="Add album listen"
				>
					+ Listen
				</button>
				<AlbumRymActionsMenu
					album={album}
					onLinkRym={onLinkRym}
					onSetRymNotOnSite={onSetRymNotOnSite}
				/>
			</div>
		</div>
	);
}

function CopiedIndicator({ visible }: { visible: boolean }) {
	if (!visible) {
		return null;
	}

	return (
		<span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-300">
			<Check className="size-3" />
			Copied
		</span>
	);
}

function RymStatusBadge({
	album,
	onLinkRym,
}: {
	album: AlbumLibraryRowData;
	onLinkRym: () => void;
}) {
	if (album.rymNotOnSite) {
		return (
			<span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
				Not on RYM
			</span>
		);
	}

	if (album.rymStatus === "linked") {
		return (
			<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs dark:text-emerald-300">
				RYM linked
			</span>
		);
	}

	return (
		<button
			type="button"
			onClick={onLinkRym}
			className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs transition-colors hover:border-amber-500/50 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
			title="Link RYM scrape"
		>
			Needs RYM
		</button>
	);
}

function AlbumRymActionsMenu({
	album,
	onLinkRym,
	onSetRymNotOnSite,
}: {
	album: AlbumLibraryRowData;
	onLinkRym: () => void;
	onSetRymNotOnSite: (notOnSite: boolean) => Promise<void>;
}) {
	const isLinked = album.rymStatus === "linked";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 p-0"
					aria-label="Open album actions"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel>RYM Actions</DropdownMenuLabel>
				{!isLinked && !album.rymNotOnSite ? (
					<DropdownMenuItem onSelect={onLinkRym}>
						Link RYM scrape
					</DropdownMenuItem>
				) : null}
				{album.rymNotOnSite ? (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(false)}>
						Clear not-on-RYM mark
					</DropdownMenuItem>
				) : !isLinked ? (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(true)}>
						Mark as Not on RYM
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem disabled>RYM already linked</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RobRankingBadge({ years }: { years: number[] }) {
	if (years.length === 0) return null;
	return (
		<span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
			Rob&apos;s Top 50 {years.slice(0, 3).join(", ")}
			{years.length > 3 ? ` +${years.length - 3}` : ""}
		</span>
	);
}

function TaxonomyLines({ album }: { album: AlbumLibraryRowData }) {
	if (
		album.primaryGenres.length === 0 &&
		album.secondaryGenres.length === 0 &&
		album.descriptors.length === 0
	) {
		return null;
	}

	return (
		<div className="mt-1 space-y-0.5">
			<TaxonomyLine tags={album.primaryGenres} className="text-sm" />
			<TaxonomyLine
				tags={album.secondaryGenres}
				className="text-muted-foreground text-xs"
			/>
			<TaxonomyLine
				tags={album.descriptors}
				className="text-muted-foreground text-xs"
			/>
		</div>
	);
}

function TaxonomyLine({
	tags,
	className,
}: {
	tags: Array<{ key: string; label: string }>;
	className: string;
}) {
	if (tags.length === 0) return null;

	return <p className={className}>{tags.map((tag) => tag.label).join(", ")}</p>;
}

export function parseAlbumLibraryFilterState(
	params: URLSearchParams,
): AlbumLibraryFilterState {
	return {
		searchQuery:
			params.get("search") ?? DEFAULT_ALBUM_LIBRARY_FILTERS.searchQuery,
		rymFilter: parseAlbumLibraryRymStatus(params.get("rym")),
		robRankingFilter: parseAlbumLibraryRobRankingStatus(params.get("rob")),
		listenFilter: parseAlbumLibraryListenStatus(params.get("listens")),
		albumTypeFilter: parseAlbumLibraryAlbumType(params.get("type")),
		yearFilter: parseAlbumLibraryYear(params.get("year")),
		sortBy: parseAlbumLibrarySort(params.get("sort")),
	};
}

function serializeAlbumLibraryFilterState(
	filters: AlbumLibraryFilterState,
	baseParams: URLSearchParams,
): URLSearchParams {
	for (const param of ALBUM_LIBRARY_QUERY_PARAMS) {
		baseParams.delete(param);
	}

	const search = filters.searchQuery.trim();
	if (search) baseParams.set("search", search);
	if (filters.rymFilter !== DEFAULT_ALBUM_LIBRARY_FILTERS.rymFilter) {
		baseParams.set("rym", filters.rymFilter);
	}
	if (
		filters.robRankingFilter !== DEFAULT_ALBUM_LIBRARY_FILTERS.robRankingFilter
	) {
		baseParams.set("rob", filters.robRankingFilter);
	}
	if (filters.listenFilter !== DEFAULT_ALBUM_LIBRARY_FILTERS.listenFilter) {
		baseParams.set("listens", filters.listenFilter);
	}
	if (
		filters.albumTypeFilter !== DEFAULT_ALBUM_LIBRARY_FILTERS.albumTypeFilter
	) {
		baseParams.set("type", filters.albumTypeFilter);
	}
	if (filters.yearFilter !== DEFAULT_ALBUM_LIBRARY_FILTERS.yearFilter) {
		baseParams.set("year", filters.yearFilter);
	}
	if (filters.sortBy !== DEFAULT_ALBUM_LIBRARY_FILTERS.sortBy) {
		baseParams.set("sort", filters.sortBy);
	}

	return baseParams;
}

function albumLibraryFiltersAreDefault(
	filters: AlbumLibraryFilterState,
): boolean {
	return (
		filters.searchQuery.trim() === DEFAULT_ALBUM_LIBRARY_FILTERS.searchQuery &&
		filters.rymFilter === DEFAULT_ALBUM_LIBRARY_FILTERS.rymFilter &&
		filters.robRankingFilter ===
			DEFAULT_ALBUM_LIBRARY_FILTERS.robRankingFilter &&
		filters.listenFilter === DEFAULT_ALBUM_LIBRARY_FILTERS.listenFilter &&
		filters.albumTypeFilter === DEFAULT_ALBUM_LIBRARY_FILTERS.albumTypeFilter &&
		filters.yearFilter === DEFAULT_ALBUM_LIBRARY_FILTERS.yearFilter &&
		filters.sortBy === DEFAULT_ALBUM_LIBRARY_FILTERS.sortBy
	);
}

function parseAlbumLibraryRymStatus(
	value: string | null,
): AlbumLibraryRymStatus {
	if (value === "linked" || value === "unlinked") return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.rymFilter;
}

function parseAlbumLibraryRobRankingStatus(
	value: string | null,
): AlbumLibraryRobRankingStatus {
	if (value === "appears" || value === "not_appears") return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.robRankingFilter;
}

function parseAlbumLibraryListenStatus(
	value: string | null,
): AlbumLibraryListenStatus {
	if (value === "listened" || value === "unlistened") return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.listenFilter;
}

function parseAlbumLibraryAlbumType(
	value: string | null,
): AlbumLibraryAlbumType {
	if (value === "all" || value === "single") return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.albumTypeFilter;
}

function parseAlbumLibraryYear(value: string | null): string {
	if (value && /^\d+$/.test(value)) return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.yearFilter;
}

export function getAlbumLibraryReleaseYearFilter(
	yearFilter: string,
): number | undefined {
	if (yearFilter === "all") return undefined;
	return Number.parseInt(yearFilter, 10);
}

function parseAlbumLibrarySort(value: string | null): AlbumLibrarySort {
	if (value === "artist") return value;
	return DEFAULT_ALBUM_LIBRARY_FILTERS.sortBy;
}

async function copyArtworkUrl(url: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(url);
		toast.success("Artwork URL copied");
	} catch {
		toast.error("Could not copy artwork URL");
	}
}

async function downloadArtwork(
	url: string,
	album: AlbumLibraryRowData,
): Promise<void> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error("Could not fetch artwork");
		}

		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = objectUrl;
		link.download = getArtworkFilename(album, blob.type);
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);
		toast.success("Artwork download started");
	} catch {
		toast.error("Could not download artwork");
	}
}

function getArtworkFilename(
	album: AlbumLibraryRowData,
	contentType: string,
): string {
	const extension = getImageExtension(contentType);
	const name = `${album.artistName}-${album.name}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return `${name || "album-artwork"}.${extension}`;
}

function getImageExtension(contentType: string): string {
	if (contentType.includes("png")) return "png";
	if (contentType.includes("webp")) return "webp";
	return "jpg";
}

"use client";

import { usePaginatedQuery } from "convex/react";
import { Disc3, SlidersHorizontal } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { SyncAlbumsButton } from "~/components/sync-albums-button";
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
import { badgeVariants } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import {
	groupListensByMonth,
	groupListensByWeek,
	sectionStats,
} from "~/lib/album-listens-grouping";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { useAlbums } from "../_context/albums-context";
import type { HistoryListen } from "../_utils/types";
import { ConvertListenDrawer } from "./convert-listen-drawer";
import { ListenHistoryRow, listenDayKey } from "./listen-history-row";
import {
	ListensFilters,
	type ListensGrouping,
	listensFiltersAreActive,
} from "./listens-filters";

const PAGE_SIZE = 100;

type HistoryViewProps = {
	albumRatings: Map<string, number>;
	onRateAlbum: (listen: HistoryListen) => void;
	onDeleteListen: (listenId: string, albumName: string) => void;
};

export function HistoryView({
	albumRatings,
	onRateAlbum,
	onDeleteListen,
}: HistoryViewProps): ReactNode {
	const { userId, isSyncing, syncHistory, lastSyncRun } = useAlbums();
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [convertTarget, setConvertTarget] = useState<HistoryListen | null>(
		null,
	);
	const [grouping, setGrouping] = useState<ListensGrouping>("week");
	const [onlyUnranked, setOnlyUnranked] = useState(false);
	const [onlyFirstListens, setOnlyFirstListens] = useState(false);
	const [yearMin, setYearMin] = useState<number | undefined>(undefined);
	const [yearMax, setYearMax] = useState<number | undefined>(undefined);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	const listensQuery = usePaginatedQuery(
		api.spotify.listUserAlbumListensPaginated,
		userId
			? {
					userId,
					onlyUnranked,
					onlyFirstListens,
					...(yearMin !== undefined ? { yearMin } : {}),
					...(yearMax !== undefined ? { yearMax } : {}),
				}
			: "skip",
		{ initialNumItems: PAGE_SIZE },
	);

	const listens = (listensQuery.results ?? []) as HistoryListen[];
	const isLoading = listensQuery.status === "LoadingFirstPage";
	const isLoadingMore = listensQuery.status === "LoadingMore";
	const canLoadMore = listensQuery.status === "CanLoadMore";

	const onLoadMore = useCallback(() => {
		listensQuery.loadMore(PAGE_SIZE);
	}, [listensQuery.loadMore]);

	const sections = useMemo(() => {
		return grouping === "week"
			? groupListensByWeek(listens)
			: groupListensByMonth(listens);
	}, [listens, grouping]);

	useEffect(() => {
		const node = loadMoreRef.current;
		if (!node || !canLoadMore || isLoadingMore) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					onLoadMore();
				}
			},
			{ rootMargin: "320px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [canLoadMore, isLoadingMore, onLoadMore]);

	const activeFilterCount =
		Number(onlyUnranked) +
		Number(onlyFirstListens) +
		Number(yearMin !== undefined || yearMax !== undefined);
	const filtersActive = listensFiltersAreActive({
		onlyUnranked,
		onlyFirstListens,
		yearMin,
		yearMax,
	});

	const filterControls = (
		<ListensFilters
			grouping={grouping}
			onGroupingChange={setGrouping}
			onlyUnranked={onlyUnranked}
			onOnlyUnrankedChange={setOnlyUnranked}
			onlyFirstListens={onlyFirstListens}
			onOnlyFirstListensChange={setOnlyFirstListens}
			yearMin={yearMin}
			yearMax={yearMax}
			onYearRangeCommit={({ yearMin: nextMin, yearMax: nextMax }) => {
				setYearMin(nextMin);
				setYearMax(nextMax);
			}}
		/>
	);

	if (isLoading) {
		return <HistoryViewSkeleton />;
	}

	if (listens.length === 0) {
		if (filtersActive) {
			return (
				<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
					<div className="w-full min-w-0 max-w-xl md:max-w-2xl xl:w-2xl xl:shrink-0">
						<div className="mb-4 xl:hidden">
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-expanded={filtersOpen}
								aria-controls="history-filters-sheet"
								onClick={() => setFiltersOpen(true)}
							>
								<SlidersHorizontal className="h-4 w-4" />
								Filters
								<span
									className={cn(
										badgeVariants(),
										"fade-in-0 zoom-in-90 ml-1 animate-in px-1.5 text-[0.65rem] duration-200",
									)}
								>
									{activeFilterCount}
								</span>
							</Button>
						</div>
						<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
							<p className="text-muted-foreground text-sm">
								No listens match the current filters
							</p>
						</div>
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
							id="history-filters-sheet"
							side="right"
							className="w-[17rem] gap-0"
						>
							<SheetHeader>
								<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
									Filters
								</SheetTitle>
								<SheetDescription>
									Group and narrow your listen history.
								</SheetDescription>
							</SheetHeader>
							<div className="flex flex-col gap-4 px-4 pb-6">
								{filterControls}
							</div>
						</SheetContent>
					</Sheet>
				</div>
			);
		}

		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">No album listens yet</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Click "Sync Albums" to start tracking your listening history
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			{/* xl+: [list | filters] cluster. Aside stretches so sticky rail has room.
			    top = header (3.5rem) + --albums-sticky-inset (page pt-4 + mt-2) so sticky locks at the rest gap. */}
			<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
				<div className="w-full min-w-0 max-w-xl md:max-w-2xl xl:w-2xl xl:shrink-0">
					<div className="mb-4 xl:hidden">
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-expanded={filtersOpen}
							aria-controls="history-filters-sheet"
							onClick={() => setFiltersOpen(true)}
						>
							<SlidersHorizontal className="h-4 w-4" />
							Filters
							{filtersActive ? (
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

					{sections.length === 0 ? (
						<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
							<p className="text-muted-foreground text-sm">
								No listens match the current filters
							</p>
						</div>
					) : (
						<div className="space-y-9">
							{sections.map((section, sectionIndex) => {
								const { albumCount, newCount } = sectionStats(section.items);

								return (
									<section
										key={`${grouping}-${section.key}`}
										style={{
											animation: `home-rise 420ms ease-out ${Math.min(
												sectionIndex * 40,
												160,
											)}ms both`,
										}}
									>
										{/* Title in content column (album-art inset); HR spans full row measure. */}
										<div className="mb-2.5 grid grid-cols-1 items-end border-border/60 border-b pb-1.5 md:grid-cols-[3.5rem_minmax(0,1fr)]">
											<span className="hidden md:block" aria-hidden />
											<div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 md:pl-3">
												<h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
													{section.label}
												</h2>
												<span className="text-muted-foreground text-xs">
													{albumCount} {albumCount === 1 ? "album" : "albums"} ·{" "}
													{newCount} new
												</span>
											</div>
										</div>
										<ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/60 bg-background md:rounded-none md:border-0 md:bg-transparent">
											{section.items.map((listen, index) => {
												const prev = section.items[index - 1];
												const showDay =
													!prev ||
													listenDayKey(listen.listenedAt) !==
														listenDayKey(prev.listenedAt);

												return (
													<li key={listen._id} className="leading-none">
														<ListenHistoryRow
															listen={listen}
															rating={albumRatings.get(listen.albumId)}
															showDay={showDay}
															onRate={() => onRateAlbum(listen)}
															onConvert={() => setConvertTarget(listen)}
															onDelete={() =>
																setDeleteTarget({
																	id: listen._id,
																	name: listen.album?.name ?? "Unknown Album",
																})
															}
														/>
													</li>
												);
											})}
										</ul>
									</section>
								);
							})}

							{(canLoadMore || isLoadingMore) && (
								<div
									ref={loadMoreRef}
									className="flex flex-col items-center gap-3 pt-2 pb-6"
									aria-hidden={!isLoadingMore}
								>
									{isLoadingMore ? (
										<ul className="w-full divide-y divide-border/40 overflow-hidden rounded-md border border-border/60 md:rounded-none md:border-0">
											{Array.from({ length: 3 }).map((_, index) => (
												<li key={`more-${index}`}>
													<ListenRowSkeleton />
												</li>
											))}
										</ul>
									) : (
										<span className="text-[11px] text-muted-foreground">
											Scroll for older listens
										</span>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				<aside className="hidden w-48 shrink-0 xl:block">
					<div className="max-h-[calc(100vh-3.5rem-var(--albums-sticky-inset,0px))] overflow-y-auto overscroll-contain border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-[calc(3.5rem+var(--albums-sticky-inset,0px))] xl:z-10">
						<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
							Filters
						</p>
						{filterControls}
						<div className="mt-6">
							<SyncAlbumsButton
								variant="status"
								isSyncing={isSyncing}
								onSync={syncHistory}
								lastSyncedAt={lastSyncRun?.completedAt}
							/>
						</div>
					</div>
				</aside>
			</div>

			<Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
				<SheetContent
					id="history-filters-sheet"
					side="right"
					className="w-[17rem] gap-0"
				>
					<SheetHeader>
						<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
							Filters
						</SheetTitle>
						<SheetDescription>
							Group and narrow your listen history.
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-4 px-4 pb-6">
						{filterControls}
						<div className="mt-2">
							<SyncAlbumsButton
								variant="status"
								isSyncing={isSyncing}
								onSync={syncHistory}
								lastSyncedAt={lastSyncRun?.completedAt}
							/>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this listen?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the listen for "{deleteTarget?.name}" from your
							history. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) {
									onDeleteListen(deleteTarget.id, deleteTarget.name);
									setDeleteTarget(null);
								}
							}}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ConvertListenDrawer
				listen={convertTarget}
				open={convertTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConvertTarget(null);
					}
				}}
			/>
		</>
	);
}

function HistoryViewSkeleton(): ReactNode {
	return (
		<div className="xl:flex xl:max-w-full xl:items-stretch xl:gap-8">
			<div className="w-full min-w-0 max-w-xl space-y-8 md:max-w-2xl xl:w-2xl xl:shrink-0">
				<div className="xl:hidden">
					<Skeleton className="h-8 w-24 rounded-md" />
				</div>
				{Array.from({ length: 2 }).map((_, sectionIndex) => (
					<section key={`sk-section-${sectionIndex}`} className="space-y-2.5">
						<div className="grid grid-cols-1 items-end border-border/60 border-b pb-1.5 md:grid-cols-[3.5rem_minmax(0,1fr)]">
							<span className="hidden md:block" aria-hidden />
							<div className="flex items-baseline gap-3 md:pl-3">
								<Skeleton className="h-6 w-40" />
								<Skeleton className="h-3 w-28" />
							</div>
						</div>
						<ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/60 md:rounded-none md:border-0">
							{Array.from({ length: sectionIndex === 0 ? 5 : 3 }).map(
								(_, rowIndex) => (
									<li key={`sk-row-${sectionIndex}-${rowIndex}`}>
										<ListenRowSkeleton />
									</li>
								),
							)}
						</ul>
					</section>
				))}
			</div>

			<aside className="hidden w-48 shrink-0 xl:block">
				<div className="max-h-[calc(100vh-3.5rem-var(--albums-sticky-inset,0px))] space-y-4 overflow-y-auto overscroll-contain border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-[calc(3.5rem+var(--albums-sticky-inset,0px))] xl:z-10">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-8 w-full rounded-md" />
					<div className="space-y-2 pt-2">
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-7 w-full rounded-md" />
						<Skeleton className="h-7 w-full rounded-md" />
					</div>
					<div className="space-y-2 pt-2">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-9 w-full rounded-md" />
					</div>
				</div>
			</aside>
		</div>
	);
}

function ListenRowSkeleton(): ReactNode {
	return (
		<>
			{/* Mobile stack */}
			<div className="flex items-stretch gap-3 px-3 py-3 md:hidden">
				<Skeleton className="h-24 w-24 shrink-0 rounded" />
				<div className="flex min-h-24 min-w-0 flex-1 flex-col">
					<div className="space-y-1.5">
						<Skeleton className="h-4 w-3/4 max-w-[14rem]" />
						<Skeleton className="h-3 w-1/2 max-w-[9rem]" />
					</div>
					<div className="mt-auto flex flex-col gap-1.5">
						<Skeleton className="h-2.5 w-2/3 max-w-[11rem]" />
						<div className="flex items-center justify-between gap-3">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-3 w-12" />
						</div>
					</div>
				</div>
			</div>
			{/* Desktop slim rail */}
			<div className="hidden grid-cols-[3.5rem_minmax(0,1fr)] md:grid">
				<div className="relative">
					<Skeleton className="absolute top-2 right-2.5 h-2.5 w-8" />
				</div>
				<div className="relative min-w-0">
					<span
						aria-hidden
						className="pointer-events-none absolute top-2 bottom-2 left-0 w-px bg-border/50"
					/>
					<div className="flex min-w-0 items-stretch gap-2.5 py-2 pr-1 pl-3">
						<Skeleton className="h-16 w-16 shrink-0 rounded" />
						<div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
							<Skeleton className="h-4 w-44 max-w-full" />
							<Skeleton className="mt-1.5 h-3 w-28 max-w-full" />
							<Skeleton className="mt-auto h-2.5 w-36 max-w-full" />
						</div>
						<Skeleton className="h-3 w-20 shrink-0 self-center" />
					</div>
				</div>
			</div>
		</>
	);
}

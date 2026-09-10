"use client";

import {
	Disc3,
	MoreHorizontal,
	RefreshCw,
	SlidersHorizontal,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Separator } from "~/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import {
	filterListens,
	groupListensByMonth,
	groupListensByWeek,
	sectionStats,
} from "~/lib/album-listens-grouping";
import { cn } from "~/lib/utils";
import { useAlbums } from "../_context/albums-context";
import type { HistoryListen } from "../_utils/types";
import { AlbumCard } from "./album-card";
import { ConvertListenDrawer } from "./convert-listen-drawer";
import {
	ListensFilters,
	type ListensGrouping,
	listensFiltersAreActive,
} from "./listens-filters";

type HistoryViewProps = {
	listens: HistoryListen[];
	albumRatings: Map<string, number>;
	onRateAlbum: (listen: HistoryListen) => void;
	onDeleteListen: (listenId: string, albumName: string) => void;
	isLoading: boolean;
};

export function HistoryView({
	listens,
	albumRatings,
	onRateAlbum,
	onDeleteListen,
	isLoading,
}: HistoryViewProps) {
	const { isSyncing, syncHistory, lastSyncRun } = useAlbums();
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

	const sections = useMemo(() => {
		const filtered = filterListens(listens, {
			onlyUnranked,
			onlyFirstListens,
			yearMin,
			yearMax,
			ratedAlbumIds: new Set(albumRatings.keys()),
		});
		return grouping === "week"
			? groupListensByWeek(filtered)
			: groupListensByMonth(filtered);
	}, [
		listens,
		albumRatings,
		grouping,
		onlyUnranked,
		onlyFirstListens,
		yearMin,
		yearMax,
	]);

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
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading history...</p>
			</div>
		);
	}

	if (listens.length === 0) {
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
			<div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
				<aside className="hidden lg:block">
					<div className="lg:sticky lg:top-20">
						<p className="mb-3 font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
							Filters
						</p>
						{filterControls}
						<div className="mt-6 space-y-3">
							<Separator />
							<SyncAlbumsButton
								variant="status"
								isSyncing={isSyncing}
								onSync={syncHistory}
								lastSyncedAt={lastSyncRun?.completedAt}
							/>
						</div>
					</div>
				</aside>

				<div className="min-w-0">
					<div className="mb-4 lg:hidden">
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
										<div className="mb-2.5 flex items-baseline gap-3 border-border/60 border-b pb-1.5">
											<h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight">
												{section.label}
											</h2>
											<span className="text-muted-foreground text-xs">
												{albumCount} {albumCount === 1 ? "album" : "albums"} ·{" "}
												{newCount} new
											</span>
										</div>
										<ul className="space-y-0.5">
											{section.items.map((listen) => (
												<li
													key={listen._id}
													className="flex items-center gap-1"
												>
													<div className="min-w-0 flex-1">
														<AlbumCard
															name={listen.album?.name ?? "Unknown Album"}
															artistName={
																listen.album?.artistName ?? "Unknown Artist"
															}
															imageUrl={listen.album?.imageUrl}
															listenedAt={listen.listenedAt}
															listenCount={listen.listenCount}
															isFirstListen={listen.isFirstListen}
															rating={albumRatings.get(listen.albumId)}
															showListenDate
															onRate={() => onRateAlbum(listen)}
														/>
													</div>
													<DropdownMenu modal={false}>
														<DropdownMenuTrigger asChild>
															<button
																type="button"
																className="rounded-md p-2 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground sm:p-1.5"
																aria-label="More options"
															>
																<MoreHorizontal className="h-4 w-4" />
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-40">
															<DropdownMenuItem
																onSelect={() => setConvertTarget(listen)}
															>
																<RefreshCw className="h-4 w-4" />
																Convert listen
															</DropdownMenuItem>
															<DropdownMenuItem
																variant="destructive"
																onSelect={() =>
																	setDeleteTarget({
																		id: listen._id,
																		name: listen.album?.name ?? "Unknown Album",
																	})
																}
															>
																<Trash2 className="h-4 w-4" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</li>
											))}
										</ul>
									</section>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
				<SheetContent
					id="history-filters-sheet"
					side="left"
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
						<div className="space-y-3">
							<Separator />
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

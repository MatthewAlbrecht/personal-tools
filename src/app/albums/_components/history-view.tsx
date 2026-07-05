"use client";

import { Disc3, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { extractReleaseYear } from "~/lib/album-tiers";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { HistoryListen } from "../_utils/types";
import { AlbumCard } from "./album-card";
import { ConvertListenDrawer } from "./convert-listen-drawer";

type HistoryViewProps = {
	listensByMonth: Map<string, HistoryListen[]>;
	listenOrdinals: Map<string, number>;
	albumRatings: Map<string, number>;
	latestRatingTimestamps: Record<string, number>;
	onRateAlbum: (listen: HistoryListen) => void;
	onDeleteListen: (listenId: string, albumName: string) => void;
	isLoading: boolean;
};

export function HistoryView({
	listensByMonth,
	listenOrdinals,
	albumRatings,
	latestRatingTimestamps,
	onRateAlbum,
	onDeleteListen,
	isLoading,
}: HistoryViewProps) {
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [convertTarget, setConvertTarget] = useState<HistoryListen | null>(
		null,
	);
	const [onlyUnranked, setOnlyUnranked] = useState(false);
	const [onlyFirstListens, setOnlyFirstListens] = useState(false);
	const [yearFilter, setYearFilter] = useState("all");

	const availableYears = useMemo(() => {
		const years = new Set<number>();
		for (const listens of listensByMonth.values()) {
			for (const listen of listens) {
				const year = extractReleaseYear(listen.album?.releaseDate);
				if (year !== null) years.add(year);
			}
		}
		return Array.from(years).sort((a, b) => b - a);
	}, [listensByMonth]);

	const filteredListensByMonth = useMemo(() => {
		const hasFilters =
			onlyUnranked || onlyFirstListens || yearFilter !== "all";
		if (!hasFilters) return listensByMonth;

		const selectedYear =
			yearFilter === "all" ? null : Number.parseInt(yearFilter, 10);

		const filtered = new Map<string, HistoryListen[]>();
		for (const [month, listens] of listensByMonth.entries()) {
			const matchingListens = listens.filter((listen) => {
				if (onlyUnranked && albumRatings.has(listen.albumId)) return false;
				if (onlyFirstListens && listenOrdinals.get(listen._id) !== 1) return false;
				if (selectedYear !== null) {
					const releaseYear = extractReleaseYear(listen.album?.releaseDate);
					if (releaseYear !== selectedYear) return false;
				}
				return true;
			});
			if (matchingListens.length > 0) {
				filtered.set(month, matchingListens);
			}
		}
		return filtered;
	}, [
		listensByMonth,
		albumRatings,
		listenOrdinals,
		onlyUnranked,
		onlyFirstListens,
		yearFilter,
	]);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading history...</p>
			</div>
		);
	}

	if (listensByMonth.size === 0) {
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
			{/* Filter Controls */}
			<div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id="only-unranked"
						checked={onlyUnranked}
						onChange={(e) => setOnlyUnranked(e.target.checked)}
						className="rounded border bg-background"
					/>
					<label htmlFor="only-unranked" className="font-medium text-sm">
						Only unranked
					</label>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id="only-first-listens"
						checked={onlyFirstListens}
						onChange={(e) => setOnlyFirstListens(e.target.checked)}
						className="rounded border bg-background"
					/>
					<label htmlFor="only-first-listens" className="font-medium text-sm">
						Only first listens
					</label>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="history-year-filter" className="font-medium text-sm">
						Year:
					</label>
					<select
						id="history-year-filter"
						value={yearFilter}
						onChange={(e) => setYearFilter(e.target.value)}
						className="rounded-md border bg-background px-2 py-1 text-sm"
					>
						<option value="all">All Years</option>
						{availableYears.map((year) => (
							<option key={year} value={year.toString()}>
								{year}
							</option>
						))}
					</select>
				</div>
			</div>

			{filteredListensByMonth.size === 0 ? (
				<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
					<p className="text-muted-foreground text-sm">
						No albums match the current filters
					</p>
				</div>
			) : (
				<div className="space-y-8">
					{Array.from(filteredListensByMonth.entries()).map(
						([month, listens]) => (
							<div key={month}>
								<h2 className="mb-3 font-semibold text-lg">{month}</h2>
								<div className="space-y-1">
									{listens.map((listen) => {
										const albumIdKey = String(listen.albumId);
										const lastRatedAt = latestRatingTimestamps[albumIdKey];
										// Show indicator if listen happened on a later DAY than the last rating
										// Compare dates only (not time) to avoid same-day timing issues
										const listenDate = new Date(listen.listenedAt).setHours(0, 0, 0, 0);
										const ratedDate = lastRatedAt
											? new Date(lastRatedAt).setHours(0, 0, 0, 0)
											: 0;
										const listenedAgain =
											lastRatedAt !== undefined && listenDate > ratedDate;

										return (
											<div key={listen._id} className="flex items-center gap-2">
												<div className="min-w-0 flex-1">
													<AlbumCard
														name={listen.album?.name ?? "Unknown Album"}
														artistName={
															listen.album?.artistName ?? "Unknown Artist"
														}
														imageUrl={listen.album?.imageUrl}
														listenedAt={listen.listenedAt}
														listenOrdinal={listenOrdinals.get(listen._id)}
														rating={albumRatings.get(listen.albumId)}
														listenedAgain={listenedAgain}
														showListenDate
														onRate={() => onRateAlbum(listen)}
													/>
												</div>
												<DropdownMenu modal={false}>
													<DropdownMenuTrigger asChild>
														<button
															type="button"
															className="rounded-md p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
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
											</div>
										);
									})}
								</div>
							</div>
						),
					)}
				</div>
			)}

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

"use client";

import { Disc3, MoreHorizontal, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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

type HistoryViewProps = {
	listensByMonth: Map<string, HistoryListen[]>;
	listenOrdinals: Map<string, number>;
	albumRatings: Map<string, number>;
	onRateAlbum: (listen: HistoryListen) => void;
	onDeleteListen: (listenId: string, albumName: string) => void;
	isLoading: boolean;
};

export function HistoryView({
	listensByMonth,
	listenOrdinals,
	albumRatings,
	onRateAlbum,
	onDeleteListen,
	isLoading,
}: HistoryViewProps) {
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [onlyUnranked, setOnlyUnranked] = useState(false);

	// Filter listens to only show unranked albums if toggle is on
	const filteredListensByMonth = useMemo(() => {
		if (!onlyUnranked) return listensByMonth;
		const filtered = new Map<string, HistoryListen[]>();
		for (const [month, listens] of listensByMonth.entries()) {
			const unrankedListens = listens.filter(
				(listen) => !albumRatings.has(listen.albumId),
			);
			if (unrankedListens.length > 0) {
				filtered.set(month, unrankedListens);
			}
		}
		return filtered;
	}, [listensByMonth, albumRatings, onlyUnranked]);

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
			<div className="mb-4 flex items-center gap-2">
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

			{filteredListensByMonth.size === 0 ? (
				<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
					<p className="text-muted-foreground text-sm">
						No unranked albums in history
					</p>
				</div>
			) : (
				<div className="space-y-8">
					{Array.from(filteredListensByMonth.entries()).map(
						([month, listens]) => (
							<div key={month}>
								<h2 className="mb-3 font-semibold text-lg">{month}</h2>
								<div className="space-y-1">
									{listens.map((listen) => (
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
												<DropdownMenuContent align="end" className="w-32">
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
									))}
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
		</>
	);
}

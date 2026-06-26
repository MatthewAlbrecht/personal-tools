"use client";

import { useMutation, useQuery } from "convex/react";
import { ExternalLink, ListMusic, PenLine, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LoginPrompt } from "~/components/login-prompt";
import { Button } from "~/components/ui/button";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AddAlbumDialog } from "./_components/add-album-dialog";
import { AddManualAlbumDialog } from "./_components/add-manual-album-dialog";
import { EditAlbumDialog } from "./_components/edit-album-dialog";
import { ImportPlaylistDialog } from "./_components/import-playlist-dialog";
import { RankingBoard } from "./_components/ranking-board";
import type { RankingAlbum } from "./_utils/types";

export default function RobsRankingsPage() {
	const {
		userId,
		isLoading: authLoading,
		getValidAccessToken,
	} = useSpotifyAuth();
	const [year, setYear] = useState<number | null>(null);
	const [yearId, setYearId] = useState<Id<"robRankingYears"> | null>(null);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isManualAddOpen, setIsManualAddOpen] = useState(false);
	const [editingAlbum, setEditingAlbum] = useState<RankingAlbum | null>(null);
	const initializedRef = useRef(false);

	const getOrCreateYear = useMutation(api.robRankings.getOrCreateYear);
	const addAlbumToYear = useMutation(api.robRankings.addAlbumToYear);
	const addManualAlbumToYear = useMutation(api.robRankings.addManualAlbumToYear);
	const updateRankingAlbumManual = useMutation(
		api.robRankings.updateRankingAlbumManual,
	);
	const removeAlbumFromYear = useMutation(api.robRankings.removeAlbumFromYear);
	const batchUpdatePositions = useMutation(
		api.robRankings.batchUpdatePositions,
	);
	const setYearPublished = useMutation(api.robRankings.setYearPublished);

	const rankingAlbums = useQuery(
		api.robRankings.getAlbumsForYear,
		yearId ? { yearId } : "skip",
	);
	const availableAlbums = useQuery(
		api.robRankings.getAvailableAlbums,
		yearId ? { yearId } : "skip",
	);
	const yearSummaries = useQuery(
		api.robRankings.listYearSummariesForUser,
		userId ? { userId } : "skip",
	);

	async function initializeYear(selectedYear: number) {
		if (!userId) return;
		const id = await getOrCreateYear({ userId, year: selectedYear });
		setYearId(id);
	}

	async function handleYearChange(newYear: number) {
		setYear(newYear);
		setYearId(null);
		await initializeYear(newYear);
	}

	useEffect(() => {
		if (initializedRef.current || !userId || authLoading) return;
		if (yearSummaries === undefined) return;

		initializedRef.current = true;

		const defaultYear =
			yearSummaries.length > 0
				? yearSummaries[0]?.year
				: new Date().getFullYear();
		if (defaultYear !== undefined) {
			setYear(defaultYear);
			void getOrCreateYear({ userId, year: defaultYear }).then(setYearId);
		}
	}, [userId, authLoading, yearSummaries, getOrCreateYear]);

	if (authLoading || (userId && year === null)) {
		return (
			<div className="container mx-auto max-w-4xl p-4">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={ListMusic}
				message="Sign in to edit Rob's Top 50 lists"
				redirectPath="/robs-rankings"
			/>
		);
	}

	const albums = rankingAlbums ?? [];
	const available = availableAlbums ?? [];
	const summaries = yearSummaries ?? [];
	const displayYear = year ?? new Date().getFullYear();
	const currentSummary = summaries.find((s) => s.year === displayYear);
	const isPublished = currentSummary?.published ?? false;

	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from(
		{ length: currentYear - 2015 },
		(_, i) => currentYear - i,
	);

	async function handlePublishToggle() {
		if (!yearId) return;
		try {
			await setYearPublished({
				yearId,
				published: !isPublished,
			});
			toast.success(isPublished ? "Year unpublished" : "Year published");
			if (!isPublished && albums.length < 50) {
				toast.info(`List has ${albums.length}/50 albums`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update publish status",
			);
		}
	}

	return (
		<div className="container mx-auto max-w-4xl p-4">
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-2xl">Rob&apos;s Top 50 — Editor</h1>
					<p className="text-muted-foreground text-sm">
						Import a playlist, reorder, and publish.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<label htmlFor="year-select" className="sr-only">
						Year
					</label>
					<select
						id="year-select"
						value={displayYear}
						onChange={(e) => void handleYearChange(Number(e.target.value))}
						className="rounded-md border bg-background px-3 py-1.5 text-sm"
					>
						{yearOptions.map((y) => {
							const summary = summaries.find((s) => s.year === y);
							const suffix = summary?.published
								? " ●"
								: summary && summary.entryCount > 0
									? " ✓"
									: "";
							return (
								<option key={y} value={y}>
									{y}
									{suffix}
								</option>
							);
						})}
					</select>
				</div>
			</div>

			{yearId && (
				<div className="mb-6 flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsImportOpen(true)}
					>
						<Upload className="mr-2 h-4 w-4" />
						Import from Spotify
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsAddOpen(true)}
						disabled={albums.length >= 50}
					>
						<Plus className="mr-2 h-4 w-4" />
						Add album
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsManualAddOpen(true)}
						disabled={albums.length >= 50}
					>
						<PenLine className="mr-2 h-4 w-4" />
						Add manual
					</Button>
					<Button
						type="button"
						variant={isPublished ? "secondary" : "default"}
						size="sm"
						onClick={() => void handlePublishToggle()}
						disabled={albums.length === 0 && !isPublished}
					>
						{isPublished ? "Unpublish" : "Publish"}
					</Button>
					{isPublished && (
						<Button type="button" variant="ghost" size="sm" asChild>
							<Link href="/public/robs-top-50" target="_blank">
								<ExternalLink className="mr-2 h-4 w-4" />
								View public page
							</Link>
						</Button>
					)}
				</div>
			)}

			{!yearId ? (
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading year data...</p>
				</div>
			) : albums.length === 0 ? (
				<div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed">
					<p className="text-muted-foreground">
						No albums yet for {displayYear}.
					</p>
					<Button type="button" onClick={() => setIsImportOpen(true)}>
						<Upload className="mr-2 h-4 w-4" />
						Import from Spotify
					</Button>
				</div>
			) : (
				<RankingBoard
					albums={albums}
					onBatchUpdatePositions={(positions) => {
						if (!yearId) return;
						void batchUpdatePositions({
							yearId,
							positions: positions.map((p) => ({
								rankingAlbumId: p.rankingAlbumId as Id<"robRankingAlbums">,
								position: p.position,
							})),
						});
					}}
					onEditAlbum={setEditingAlbum}
					onRemoveAlbum={(rankingAlbumId) => {
						void removeAlbumFromYear({
							rankingAlbumId: rankingAlbumId as Id<"robRankingAlbums">,
						});
					}}
				/>
			)}

			{yearId && (
				<>
					<ImportPlaylistDialog
						open={isImportOpen}
						onOpenChange={setIsImportOpen}
						yearId={yearId}
						userId={userId}
						hasExistingEntries={albums.length > 0}
						getAccessToken={getValidAccessToken}
					/>
					<AddAlbumDialog
						open={isAddOpen}
						onOpenChange={setIsAddOpen}
						availableAlbums={available}
						entryCount={albums.length}
						onAddAlbum={(albumId) => {
							void addAlbumToYear({ userId, yearId, albumId });
						}}
					/>
					<AddManualAlbumDialog
						open={isManualAddOpen}
						onOpenChange={setIsManualAddOpen}
						entryCount={albums.length}
						onAddManualAlbum={async (data) => {
							await addManualAlbumToYear({
								userId,
								yearId,
								artistName: data.artistName,
								albumTitle: data.albumTitle,
								imageUrl: data.imageUrl,
								position: data.position,
							});
						}}
					/>
					<EditAlbumDialog
						open={editingAlbum !== null}
						onOpenChange={(open) => {
							if (!open) setEditingAlbum(null);
						}}
						album={editingAlbum}
						onSave={async (data) => {
							if (!editingAlbum) return;
							await updateRankingAlbumManual({
								rankingAlbumId: editingAlbum._id,
								artistName: data.artistName,
								albumTitle: data.albumTitle,
								imageUrl: data.imageUrl,
							});
						}}
					/>
				</>
			)}
		</div>
	);
}

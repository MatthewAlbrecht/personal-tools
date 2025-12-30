"use client";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoginPrompt } from "~/components/login-prompt";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { AlbumPicker } from "./_components/album-picker";
import { RankingBoard } from "./_components/ranking-board";

type Mode = "picker" | "ranking";

export default function RobsRankingsPage() {
	const { userId, isLoading: authLoading } = useAuthToken();
	const [year, setYear] = useState<number | null>(null);
	const [mode, setMode] = useState<Mode>("ranking");
	const [yearId, setYearId] = useState<Id<"robRankingYears"> | null>(null);
	const initializedRef = useRef(false);

	// Mutations
	const getOrCreateYear = useMutation(api.robRankings.getOrCreateYear);
	const addAlbumToYear = useMutation(api.robRankings.addAlbumToYear);
	const removeAlbumFromYear = useMutation(api.robRankings.removeAlbumFromYear);
	const updateAlbumPosition = useMutation(api.robRankings.updateAlbumPosition);
	const updateAlbumStatus = useMutation(api.robRankings.updateAlbumStatus);

	// Queries - only run if we have a yearId
	const rankingAlbums = useQuery(
		api.robRankings.getAlbumsForYear,
		yearId ? { yearId } : "skip",
	);
	const availableAlbums = useQuery(
		api.robRankings.getAvailableAlbums,
		yearId ? { yearId } : "skip",
	);
	const existingYears = useQuery(
		api.robRankings.getYearsForUser,
		userId ? { userId } : "skip",
	);

	// Initialize year on first load
	async function initializeYear(selectedYear: number) {
		if (!userId) return;
		const id = await getOrCreateYear({ userId, year: selectedYear });
		setYearId(id);
	}

	// Handle year change
	async function handleYearChange(newYear: number) {
		setYear(newYear);
		setYearId(null);
		setMode("picker");
		await initializeYear(newYear);
	}

	// Initialize with latest existing year or current year
	useEffect(() => {
		if (initializedRef.current || !userId || authLoading) return;
		if (existingYears === undefined) return; // Still loading

		initializedRef.current = true;

		// Use latest existing year, or current year if none exist
		const defaultYear =
			existingYears.length > 0 ? existingYears[0] : new Date().getFullYear();
		if (defaultYear !== undefined) {
			setYear(defaultYear);
			initializeYear(defaultYear);
		}
	}, [userId, authLoading, existingYears]);

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
				message="Sign in to access Rob's Rankings"
				redirectPath="/robs-rankings"
			/>
		);
	}

	const albums = rankingAlbums ?? [];
	const available = availableAlbums ?? [];
	const years = existingYears ?? [];
	const displayYear = year ?? new Date().getFullYear();

	// Generate year options (current year down to 2020)
	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from(
		{ length: currentYear - 2019 },
		(_, i) => currentYear - i,
	);

	return (
		<div className="container mx-auto max-w-4xl p-4">
			{/* Header */}
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-2xl">Rob's Rankings</h1>
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<label
							htmlFor="year-select"
							className="text-muted-foreground text-sm"
						>
							Year:
						</label>
						<select
							id="year-select"
							value={displayYear}
							onChange={(e) => handleYearChange(Number(e.target.value))}
							className="rounded-md border bg-background px-3 py-1.5 text-sm"
						>
							{yearOptions.map((y) => (
								<option key={y} value={y}>
									{y}
									{years.includes(y) ? " ✓" : ""}
								</option>
							))}
						</select>
					</div>

					{/* Mode toggle - only show if we have albums */}
					{albums.length > 0 && (
						<div className="flex rounded-md border">
							<button
								type="button"
								onClick={() => setMode("picker")}
								className={`px-3 py-1.5 text-sm ${
									mode === "picker"
										? "bg-primary text-primary-foreground"
										: "hover:bg-muted"
								}`}
							>
								Edit Albums
							</button>
							<button
								type="button"
								onClick={() => setMode("ranking")}
								className={`px-3 py-1.5 text-sm ${
									mode === "ranking"
										? "bg-primary text-primary-foreground"
										: "hover:bg-muted"
								}`}
							>
								Rank
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Content */}
			{!yearId ? (
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading year data...</p>
				</div>
			) : mode === "picker" ? (
				<AlbumPicker
					availableAlbums={available}
					selectedAlbums={albums}
					year={displayYear}
					onAddAlbum={(albumId) => {
						if (yearId && userId) {
							addAlbumToYear({
								userId,
								yearId,
								albumId: albumId as Id<"spotifyAlbums">,
							});
						}
					}}
					onRemoveAlbum={(rankingAlbumId) => {
						removeAlbumFromYear({
							rankingAlbumId: rankingAlbumId as Id<"robRankingAlbums">,
						});
					}}
					onDone={() => setMode("ranking")}
				/>
			) : (
				<RankingBoard
					albums={albums}
					onUpdatePosition={(rankingAlbumId, newPosition) => {
						updateAlbumPosition({
							rankingAlbumId: rankingAlbumId as Id<"robRankingAlbums">,
							newPosition,
						});
					}}
					onUpdateStatus={(rankingAlbumId, status) => {
						updateAlbumStatus({
							rankingAlbumId: rankingAlbumId as Id<"robRankingAlbums">,
							status,
						});
					}}
				/>
			)}
		</div>
	);
}

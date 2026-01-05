"use client";

import { useMutation, useQuery } from "convex/react";
import { Disc3 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { LoginPrompt } from "~/components/login-prompt";
import { SyncAlbumsButton } from "~/components/sync-albums-button";
import {
	TIER_ORDER,
	type TierName,
	extractReleaseYear,
	getRatingsForTier,
	groupByMonth,
} from "~/lib/album-tiers";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { useSyncHistory } from "~/lib/hooks/use-sync-history";
import { SpotifyConnection } from "../spotify-playlister/_components/spotify-connection";
import { AddListenDrawer } from "./_components/add-listen-view";
import { AlbumRanker } from "./_components/album-ranker";
import { AllAlbumsView } from "./_components/all-albums-view";
import { HistoryView } from "./_components/history-view";
import { RankingsView } from "./_components/rankings-view";
import { TracksView } from "./_components/tracks-view";
import type {
	AlbumItem,
	AlbumToRate,
	HistoryListen,
	TrackItem,
} from "./_utils/types";

type TabValue = "history" | "rankings" | "tracks" | "albums";

export default function AlbumsPage() {
	const { userId, isLoading, connection, isConnected, getValidAccessToken } =
		useSpotifyAuth();
	const [activeTab, setActiveTab] = useState<TabValue>("history");
	const [yearFilter, setYearFilter] = useState<string | null>(null);
	const [albumToRate, setAlbumToRate] = useState<AlbumToRate | null>(null);
	const [trackToAddListen, setTrackToAddListen] = useState<TrackItem | null>(
		null,
	);
	const [albumToAddListen, setAlbumToAddListen] = useState<AlbumItem | null>(
		null,
	);
	const [isAddingListen, setIsAddingListen] = useState(false);

	const { isSyncing, syncHistory } = useSyncHistory({
		userId,
		isConnected,
		getValidAccessToken,
	});

	// Mutations
	const updateAlbumRating = useMutation(api.spotify.updateAlbumRating);
	const addManualAlbumListen = useMutation(api.spotify.addManualAlbumListen);
	const upsertAlbum = useMutation(api.spotify.upsertAlbum);
	const deleteAlbumListen = useMutation(api.spotify.deleteAlbumListen);

	// Fetch album listens (last 500)
	const albumListens = useQuery(
		api.spotify.getUserAlbumListens,
		userId ? { userId, limit: 500 } : "skip",
	);

	// Fetch all user albums (for checking if rated)
	const userAlbums = useQuery(
		api.spotify.getUserAlbums,
		userId ? { userId } : "skip",
	);

	// Fetch rated albums for the selected year (for the ranker)
	const currentYear =
		yearFilter === "all" || yearFilter === null
			? new Date().getFullYear()
			: Number.parseInt(yearFilter, 10);
	const ratedAlbumsForYear = useQuery(
		api.spotify.getRatedAlbumsForYear,
		userId ? { userId, year: currentYear } : "skip",
	);

	// Fetch recently played tracks (for tracks history tab)
	const recentTracks = useQuery(
		api.spotify.getRecentlyPlayedTracks,
		userId ? { userId, limit: 200 } : "skip",
	);

	// Fetch all albums (for albums tab)
	const allAlbums = useQuery(api.spotify.getAllAlbums, {});

	// Build a map of albumId -> rating for quick lookup
	const albumRatings = useMemo(() => {
		if (!userAlbums) return new Map<string, number>();
		const map = new Map<string, number>();
		for (const ua of userAlbums) {
			if (ua.rating !== undefined) {
				map.set(ua.albumId, ua.rating);
			}
		}
		return map;
	}, [userAlbums]);

	// Build a map from spotifyAlbums._id to userAlbums record
	type UserAlbumRecord = NonNullable<typeof userAlbums>[number];
	const userAlbumsMap = useMemo(() => {
		if (!userAlbums) return new Map<string, UserAlbumRecord>();
		return new Map(userAlbums.map((ua) => [ua.albumId, ua]));
	}, [userAlbums]);

	// Compute listen ordinals and group by month for history view
	const { listensByMonth, listenOrdinals } = useMemo(() => {
		if (!albumListens)
			return {
				listensByMonth: new Map<string, HistoryListen[]>(),
				listenOrdinals: new Map<string, number>(),
			};

		const ordinals = new Map<string, number>();
		const albumCounts = new Map<string, number>();

		const sortedOldestFirst = [...albumListens].reverse();
		for (const listen of sortedOldestFirst) {
			const albumId = listen.albumId;
			const currentCount = (albumCounts.get(albumId) ?? 0) + 1;
			albumCounts.set(albumId, currentCount);
			ordinals.set(listen._id, currentCount);
		}

		return {
			listensByMonth: groupByMonth(albumListens),
			listenOrdinals: ordinals,
		};
	}, [albumListens]);

	// Filter and group albums by tier for rankings view
	const { albumsByTier, availableYears } = useMemo(() => {
		if (!userAlbums)
			return { albumsByTier: new Map(), availableYears: [] as number[] };

		const years = new Set<number>();
		for (const ua of userAlbums) {
			const year = extractReleaseYear(ua.album?.releaseDate);
			if (year) years.add(year);
		}
		const sortedYears = Array.from(years).sort((a, b) => b - a);

		// Determine effective year filter - use most recent year with rated albums if not set
		const effectiveYearFilter = yearFilter ?? sortedYears[0]?.toString() ?? "all";

		const filtered = userAlbums.filter((ua) => {
			if (!ua.rating) return false;
			if (effectiveYearFilter === "all") return true;
			const year = extractReleaseYear(ua.album?.releaseDate);
			return year?.toString() === effectiveYearFilter;
		});

		const byTier = new Map<
			TierName,
			{ high: typeof filtered; med: typeof filtered; low: typeof filtered }
		>();
		for (const tier of TIER_ORDER) {
			const ratings = getRatingsForTier(tier);
			byTier.set(tier, {
				high: filtered.filter((ua) => ua.rating === ratings.high),
				med: filtered.filter((ua) => ua.rating === ratings.med),
				low: filtered.filter((ua) => ua.rating === ratings.low),
			});
		}

		return { albumsByTier: byTier, availableYears: sortedYears };
	}, [userAlbums, yearFilter]);

	// Initialize yearFilter to most recent year once we have data
	const resolvedYearFilter = yearFilter ?? availableYears[0]?.toString() ?? "all";

	function handleDisconnect() {
		window.location.href = "/spotify-playlister";
	}

	function handleRateAlbum(listen: HistoryListen) {
		const userAlbum = userAlbumsMap.get(listen.albumId);
		if (!userAlbum || !listen.album) return;

		setAlbumToRate({
			userAlbumId: userAlbum._id,
			albumId: listen.albumId,
			name: listen.album.name,
			artistName: listen.album.artistName,
			imageUrl: listen.album.imageUrl,
			releaseDate: listen.album.releaseDate,
		});
	}

	async function handleSaveRating(rating: number, position: number) {
		if (!albumToRate) return;

		const albumName = albumToRate.name;
		const userAlbumId = albumToRate.userAlbumId as Id<"userAlbums">;
		setAlbumToRate(null);

		try {
			await updateAlbumRating({
				userAlbumId,
				rating,
				position,
			});
			toast.success(`Rated "${albumName}"`);
		} catch (error) {
			console.error("Failed to save rating:", error);
			toast.error("Failed to save rating");
		}
	}

	async function handleDeleteListen(listenId: string, albumName: string) {
		try {
			await deleteAlbumListen({
				listenId: listenId as Id<"userAlbumListens">,
			});
			toast.success(`Deleted listen for "${albumName}"`);
		} catch (error) {
			console.error("Failed to delete listen:", error);
			toast.error("Failed to delete listen");
		}
	}

	async function handleAddListen(listenedAt: number) {
		const albumToUse = trackToAddListen || albumToAddListen;
		if (!albumToUse?.spotifyAlbumId || !userId) return;

		setIsAddingListen(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Not connected to Spotify");
				return;
			}

			const albumResponse = await fetch(
				`/api/spotify/album/${albumToUse.spotifyAlbumId}`,
				{ headers: { "X-Access-Token": accessToken } },
			);

			if (!albumResponse.ok) {
				throw new Error("Failed to fetch album from Spotify");
			}

			const albumData = await albumResponse.json();

			await upsertAlbum({
				spotifyAlbumId: albumData.spotifyAlbumId,
				name: albumData.name,
				artistName: albumData.artistName,
				imageUrl: albumData.imageUrl,
				releaseDate: albumData.releaseDate,
				totalTracks: albumData.totalTracks,
				genres: albumData.genres,
			});

			const result = await addManualAlbumListen({
				userId,
				spotifyAlbumId: albumToUse.spotifyAlbumId,
				listenedAt,
			});

			if (result.recorded) {
				toast.success(`Added listen for "${result.albumName}"`);
				setTrackToAddListen(null);
				setAlbumToAddListen(null);
			} else {
				toast.info("Listen already recorded for this date");
			}
		} catch (error) {
			console.error("Failed to add listen:", error);
			toast.error("Failed to add listen");
		} finally {
			setIsAddingListen(false);
		}
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
				message="Please log in to track your albums"
				redirectPath="/albums"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl p-6">
			{/* Header */}
			<div className="mb-6 flex items-start justify-between">
				<div>
					<h1 className="font-bold text-3xl">Album Tracker</h1>
					<p className="mt-2 text-muted-foreground">
						Track what albums you've listened to and when
					</p>
				</div>
				{isConnected && (
					<SyncAlbumsButton
						isSyncing={isSyncing}
						onSync={syncHistory}
						variant="outline"
					/>
				)}
			</div>

			{/* Spotify Connection */}
			<SpotifyConnection
				isConnected={isConnected}
				displayName={connection?.displayName}
				onDisconnect={handleDisconnect}
			/>

			{isConnected && (
				<div className="mt-6">
					{/* Tabs */}
					<div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
						<button
							type="button"
							onClick={() => setActiveTab("history")}
							className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition-colors ${
								activeTab === "history"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							History
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("rankings")}
							className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition-colors ${
								activeTab === "rankings"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Rankings
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("tracks")}
							className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition-colors ${
								activeTab === "tracks"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Tracks
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("albums")}
							className={`flex-1 rounded-md px-4 py-2 font-medium text-sm transition-colors ${
								activeTab === "albums"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Albums
						</button>
					</div>

					{/* History View */}
					{activeTab === "history" && (
						<HistoryView
							listensByMonth={listensByMonth}
							listenOrdinals={listenOrdinals}
							albumRatings={albumRatings}
							onRateAlbum={handleRateAlbum}
							onDeleteListen={handleDeleteListen}
							isLoading={albumListens === undefined}
						/>
					)}

					{/* Rankings View */}
					{activeTab === "rankings" && (
						<RankingsView
							albumsByTier={albumsByTier}
							availableYears={availableYears}
							yearFilter={resolvedYearFilter}
							onYearFilterChange={setYearFilter}
							isLoading={userAlbums === undefined}
							onUpdateRating={(userAlbumId, rating, position) => {
								updateAlbumRating({
									userAlbumId: userAlbumId as Id<"userAlbums">,
									rating,
									position,
								});
							}}
						/>
					)}

					{/* Tracks View */}
					{activeTab === "tracks" && (
						<TracksView
							tracks={recentTracks ?? []}
							isLoading={recentTracks === undefined}
							onAddListen={(track) => setTrackToAddListen(track)}
						/>
					)}

					{/* Albums View */}
					{activeTab === "albums" && (
						<AllAlbumsView
							albums={allAlbums ?? []}
							userAlbums={userAlbums ?? []}
							isLoading={allAlbums === undefined}
							onAddListen={(album) => setAlbumToAddListen(album)}
						/>
					)}
				</div>
			)}

			{/* Add Listen Drawer */}
			<AddListenDrawer
				track={
					trackToAddListen
						? trackToAddListen
						: albumToAddListen
							? {
									trackName: albumToAddListen.name,
									artistName: albumToAddListen.artistName,
									albumName: albumToAddListen.name,
									albumImageUrl: albumToAddListen.imageUrl,
									spotifyAlbumId: albumToAddListen.spotifyAlbumId,
									releaseDate: albumToAddListen.releaseDate,
								}
							: null
				}
				open={trackToAddListen !== null || albumToAddListen !== null}
				onOpenChange={(open) => {
					if (!open) {
						setTrackToAddListen(null);
						setAlbumToAddListen(null);
					}
				}}
				onSave={handleAddListen}
				isSaving={isAddingListen}
			/>

			{/* Album Ranker Drawer */}
			{ratedAlbumsForYear && (
				<AlbumRanker
					albumToRate={albumToRate}
					existingRankedAlbums={ratedAlbumsForYear}
					open={albumToRate !== null}
					onOpenChange={(open) => {
						if (!open) setAlbumToRate(null);
					}}
					onSave={handleSaveRating}
				/>
			)}
		</div>
	);
}

"use client";

import { useMutation, useQuery } from "convex/react";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { useSyncHistory } from "~/lib/hooks/use-sync-history";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	AlbumItem,
	AlbumToRate,
	HistoryListen,
	TrackItem,
} from "../_utils/types";

// Type for rated albums returned by getRatedAlbumsForYear query
type RankedAlbumForYear = {
	_id: Id<"userAlbums">;
	albumId: Id<"spotifyAlbums">;
	rating?: number;
	position?: number;
	album: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};

type AlbumsContextValue = {
	// Auth & Connection
	userId: string | null;
	isLoading: boolean;
	isConnected: boolean;
	connection: { displayName?: string } | null;
	getValidAccessToken: () => Promise<string | null>;
	handleDisconnect: () => void;

	// Sync
	isSyncing: boolean;
	syncHistory: () => Promise<{ tracksFromApi: number } | null>;
	lastSyncRun: { completedAt?: number } | null | undefined;

	// Album Rating Drawer
	albumToRate: AlbumToRate | null;
	openRatingDrawer: (listen: HistoryListen) => void;
	closeRatingDrawer: () => void;
	handleSaveRating: (rating: number, position: number) => Promise<void>;
	ratedAlbumsForYear: RankedAlbumForYear[] | undefined;

	// Add Listen Drawer
	trackToAddListen: TrackItem | null;
	albumToAddListen: AlbumItem | null;
	isAddingListen: boolean;
	openAddListenDrawer: (
		item: TrackItem | AlbumItem,
		type: "track" | "album",
	) => void;
	closeAddListenDrawer: () => void;
	handleAddListen: (listenedAt: number) => Promise<void>;

	// Mutations for views
	updateAlbumRating: (
		userAlbumId: string,
		rating: number,
		position: number,
	) => Promise<void>;
	deleteAlbumListen: (listenId: string, albumName: string) => Promise<void>;

	// Shared data
	userAlbumsMap: Map<string, UserAlbumRecord>;
	albumRatings: Map<string, number>;

	// Year filter (shared between rankings and albums views)
	yearFilter: string | null;
	setYearFilter: (year: string | null) => void;
};

type UserAlbumRecord = {
	_id: Id<"userAlbums">;
	albumId: string;
	rating?: number;
	position?: number;
	album?: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};

const AlbumsContext = createContext<AlbumsContextValue | null>(null);

export function AlbumsProvider({ children }: { children: React.ReactNode }) {
	const { userId, isLoading, connection, isConnected, getValidAccessToken } =
		useSpotifyAuth();

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

	// Fetch last sync run for display
	const lastSyncRun = useQuery(
		api.spotify.getLastSyncRun,
		userId ? { userId } : "skip",
	);

	// Fetch all user albums (for checking if rated)
	const userAlbums = useQuery(
		api.spotify.getUserAlbums,
		userId ? { userId } : "skip",
	);

	// Fetch rated albums for the ranker - use the album's release year when rating
	const albumToRateYear = albumToRate?.releaseDate
		? Number.parseInt(albumToRate.releaseDate.substring(0, 4), 10)
		: null;
	const yearForRanker =
		albumToRateYear ??
		(yearFilter === "all" || yearFilter === null
			? new Date().getFullYear()
			: Number.parseInt(yearFilter, 10));
	const ratedAlbumsForYear = useQuery(
		api.spotify.getRatedAlbumsForYear,
		userId ? { userId, year: yearForRanker } : "skip",
	);

	// Mutations
	const updateAlbumRatingMutation = useMutation(api.spotify.updateAlbumRating);
	const addManualAlbumListen = useMutation(api.spotify.addManualAlbumListen);
	const upsertAlbum = useMutation(api.spotify.upsertAlbum);
	const deleteAlbumListenMutation = useMutation(api.spotify.deleteAlbumListen);

	// Build maps
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

	const userAlbumsMap = useMemo(() => {
		if (!userAlbums) return new Map<string, UserAlbumRecord>();
		return new Map(userAlbums.map((ua) => [ua.albumId, ua]));
	}, [userAlbums]);

	// Handlers
	function handleDisconnect() {
		window.location.href = "/spotify-playlister";
	}

	const openRatingDrawer = useCallback(
		(listen: HistoryListen) => {
			const userAlbum = userAlbumsMap.get(listen.albumId);
			if (!userAlbum || !listen.album) return;

			setAlbumToRate({
				userAlbumId: userAlbum._id,
				albumId: listen.albumId,
				name: listen.album.name,
				artistName: listen.album.artistName,
				imageUrl: listen.album.imageUrl,
				releaseDate: listen.album.releaseDate,
				currentRating: userAlbum.rating,
				currentPosition: userAlbum.position,
			});
		},
		[userAlbumsMap],
	);

	const closeRatingDrawer = useCallback(() => {
		setAlbumToRate(null);
	}, []);

	const handleSaveRating = useCallback(
		async (rating: number, position: number) => {
			if (!albumToRate) return;

			const albumName = albumToRate.name;
			const userAlbumId = albumToRate.userAlbumId as Id<"userAlbums">;
			setAlbumToRate(null);

			try {
				await updateAlbumRatingMutation({
					userAlbumId,
					rating,
					position,
				});
				toast.success(`Rated "${albumName}"`);
			} catch (error) {
				console.error("Failed to save rating:", error);
				toast.error("Failed to save rating");
			}
		},
		[albumToRate, updateAlbumRatingMutation],
	);

	const openAddListenDrawer = useCallback(
		(item: TrackItem | AlbumItem, type: "track" | "album") => {
			if (type === "track") {
				setTrackToAddListen(item as TrackItem);
			} else {
				setAlbumToAddListen(item as AlbumItem);
			}
		},
		[],
	);

	const closeAddListenDrawer = useCallback(() => {
		setTrackToAddListen(null);
		setAlbumToAddListen(null);
	}, []);

	const handleAddListen = useCallback(
		async (listenedAt: number) => {
			// Get the spotifyAlbumId from the appropriate source
			const spotifyAlbumId = trackToAddListen
				? trackToAddListen.track.spotifyAlbumId
				: albumToAddListen?.spotifyAlbumId;
			if (!spotifyAlbumId || !userId) return;

			setIsAddingListen(true);
			try {
				const accessToken = await getValidAccessToken();
				if (!accessToken) {
					toast.error("Not connected to Spotify");
					return;
				}

				const albumResponse = await fetch(
					`/api/spotify/album/${spotifyAlbumId}`,
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
					spotifyAlbumId,
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
		},
		[
			trackToAddListen,
			albumToAddListen,
			userId,
			getValidAccessToken,
			upsertAlbum,
			addManualAlbumListen,
		],
	);

	const updateAlbumRating = useCallback(
		async (userAlbumId: string, rating: number, position: number) => {
			await updateAlbumRatingMutation({
				userAlbumId: userAlbumId as Id<"userAlbums">,
				rating,
				position,
			});
		},
		[updateAlbumRatingMutation],
	);

	const deleteAlbumListen = useCallback(
		async (listenId: string, albumName: string) => {
			try {
				await deleteAlbumListenMutation({
					listenId: listenId as Id<"userAlbumListens">,
				});
				toast.success(`Deleted listen for "${albumName}"`);
			} catch (error) {
				console.error("Failed to delete listen:", error);
				toast.error("Failed to delete listen");
			}
		},
		[deleteAlbumListenMutation],
	);

	const value: AlbumsContextValue = {
		userId,
		isLoading,
		isConnected,
		connection,
		getValidAccessToken,
		handleDisconnect,
		isSyncing,
		syncHistory,
		lastSyncRun,
		albumToRate,
		openRatingDrawer,
		closeRatingDrawer,
		handleSaveRating,
		ratedAlbumsForYear,
		trackToAddListen,
		albumToAddListen,
		isAddingListen,
		openAddListenDrawer,
		closeAddListenDrawer,
		handleAddListen,
		updateAlbumRating,
		deleteAlbumListen,
		userAlbumsMap,
		albumRatings,
		yearFilter,
		setYearFilter,
	};

	return (
		<AlbumsContext.Provider value={value}>{children}</AlbumsContext.Provider>
	);
}

export function useAlbums() {
	const context = useContext(AlbumsContext);
	if (!context) {
		throw new Error("useAlbums must be used within an AlbumsProvider");
	}
	return context;
}

"use client";

import { Disc3 } from "lucide-react";
import { useMemo, useState } from "react";
import { extractReleaseYear } from "~/lib/album-tiers";
import { formatRelativeTime } from "../_utils/formatters";
import type { AlbumItem, UserAlbumData } from "../_utils/types";

type UserAlbumRecord = {
	album: { spotifyAlbumId: string } | null;
	listenCount: number;
	lastListenedAt?: number;
	firstListenedAt?: number;
	rating?: number;
};

type AllAlbumsViewProps = {
	albums: AlbumItem[];
	userAlbums: UserAlbumRecord[];
	isLoading: boolean;
	onAddListen: (album: AlbumItem) => void;
};

export function AllAlbumsView({
	albums,
	userAlbums,
	isLoading,
	onAddListen,
}: AllAlbumsViewProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [hideSingles, setHideSingles] = useState(true);
	const [listenFilter, setListenFilter] = useState<
		"all" | "listened" | "unlistened"
	>("all");

	// Create a map for user album data lookup (keyed by spotifyAlbumId)
	const userAlbumsMap = useMemo(() => {
		const map = new Map<string, UserAlbumData>();
		for (const ua of userAlbums) {
			if (ua.album?.spotifyAlbumId) {
				map.set(ua.album.spotifyAlbumId, {
					listenCount: ua.listenCount,
					lastListenedAt: ua.lastListenedAt,
					firstListenedAt: ua.firstListenedAt,
					rating: ua.rating,
				});
			}
		}
		return map;
	}, [userAlbums]);

	const filteredAlbums = useMemo(() => {
		let result = albums;

		// Filter by listen status
		if (listenFilter === "listened") {
			result = result.filter((album) => {
				const userAlbumData = userAlbumsMap.get(album.spotifyAlbumId);
				return userAlbumData?.listenCount && userAlbumData.listenCount > 0;
			});
		} else if (listenFilter === "unlistened") {
			result = result.filter((album) => {
				const userAlbumData = userAlbumsMap.get(album.spotifyAlbumId);
				return (
					!userAlbumData ||
					!userAlbumData?.listenCount ||
					userAlbumData.listenCount === 0
				);
			});
		}

		// Filter out singles if enabled
		if (hideSingles) {
			result = result.filter(
				(album) => !album.totalTracks || album.totalTracks >= 3,
			);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(album) =>
					album.name.toLowerCase().includes(query) ||
					album.artistName.toLowerCase().includes(query),
			);
		}

		return result;
	}, [albums, userAlbumsMap, listenFilter, hideSingles, searchQuery]);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading albums...</p>
			</div>
		);
	}

	if (albums.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">No albums found</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Albums will appear here after syncing your Spotify history
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Filters */}
			<div className="space-y-3">
				{/* Search Input */}
				<div>
					<input
						type="text"
						placeholder="Search albums by name or artist..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>

				{/* Filter Controls */}
				<div className="flex flex-wrap items-center gap-4">
					{/* Listen Status Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="listen-filter" className="font-medium text-sm">
							Show:
						</label>
						<select
							id="listen-filter"
							value={listenFilter}
							onChange={(e) =>
								setListenFilter(
									e.target.value as "all" | "listened" | "unlistened",
								)
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Albums</option>
							<option value="listened">Listened</option>
							<option value="unlistened">Unlistened</option>
						</select>
					</div>

					{/* Hide Singles Checkbox */}
					<div className="flex items-center gap-2">
						<input
							type="checkbox"
							id="hide-singles"
							checked={hideSingles}
							onChange={(e) => setHideSingles(e.target.checked)}
							className="rounded border bg-background"
						/>
						<label htmlFor="hide-singles" className="font-medium text-sm">
							Hide singles
						</label>
					</div>
				</div>
			</div>

			{/* Albums List */}
			<div className="space-y-1">
				{filteredAlbums.length === 0 ? (
					<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
						<p className="text-muted-foreground text-sm">
							No albums match your search
						</p>
					</div>
				) : (
					filteredAlbums.map((album) => (
						<AlbumCardRow
							key={album._id}
							album={album}
							userAlbum={userAlbumsMap.get(album.spotifyAlbumId)}
							onAddListen={() => onAddListen(album)}
						/>
					))
				)}
			</div>
		</div>
	);
}

function AlbumCardRow({
	album,
	userAlbum,
	onAddListen,
}: {
	album: AlbumItem;
	userAlbum?: UserAlbumData;
	onAddListen: () => void;
}) {
	return (
		<div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
			{/* Album Cover */}
			<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
				{album.imageUrl ? (
					<img
						src={album.imageUrl}
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
				<p className="truncate font-medium text-sm">{album.name}</p>
				<p className="truncate text-muted-foreground text-xs">
					{album.artistName}
					{album.releaseDate && (
						<span className="text-muted-foreground/60">
							{" · "}
							{extractReleaseYear(album.releaseDate)}
						</span>
					)}
				</p>
			</div>

			{/* Listen Info */}
			<div className="flex flex-shrink-0 items-center gap-2">
				{userAlbum?.lastListenedAt && (
					<span className="flex-shrink-0 text-muted-foreground text-xs">
						{formatRelativeTime(userAlbum.lastListenedAt)}
					</span>
				)}

				{userAlbum?.listenCount && userAlbum.listenCount > 0 && (
					<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
						{userAlbum.listenCount}×
					</span>
				)}

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
			</div>
		</div>
	);
}

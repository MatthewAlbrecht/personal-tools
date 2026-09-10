"use client";

import { Disc3 } from "lucide-react";
import { usePathname } from "next/navigation";
import { AlbumRatingDrawer } from "~/components/album-rating-drawer";
import { LoginPrompt } from "~/components/login-prompt";
import { SyncAlbumsButton } from "~/components/sync-albums-button";
import { SpotifyConnection } from "../spotify-playlister/_components/spotify-connection";
import { AddListenDrawer } from "./_components/add-listen-view";
import { AlbumsProvider, useAlbums } from "./_context/albums-context";

const VIEW_TITLES: Record<string, { title: string; blurb: string }> = {
	"/albums/recent": {
		title: "Listens",
		blurb: "Chronological listens — rate what still needs a mark.",
	},
	"/albums/rated": {
		title: "Rankings",
		blurb: "Year tiers and on-page ranking.",
	},
	"/albums/up-next": {
		title: "Queue",
		blurb: "Prioritized queue from saves and picks.",
	},
	"/albums/library": {
		title: "Library",
		blurb: "Searchable catalog of albums you track.",
	},
	"/albums/tracks": {
		title: "Tracks",
		blurb: "Recent Spotify track plays.",
	},
};

function getViewMeta(pathname: string): { title: string; blurb: string } {
	for (const [path, meta] of Object.entries(VIEW_TITLES)) {
		if (pathname === path || pathname.startsWith(`${path}/`)) {
			return meta;
		}
	}
	return {
		title: "Albums",
		blurb: "Your listening archive and queue.",
	};
}

function AlbumsLayoutContent({ children }: { children: React.ReactNode }) {
	const pathname = usePathname() ?? "";
	const {
		userId,
		isLoading,
		isConnected,
		connection,
		handleDisconnect,
		isSyncing,
		syncHistory,
		lastSyncRun,
		albumToRate,
		closeRatingDrawer,
		handleSaveRating,
		ratedAlbumsForYear,
		trackToAddListen,
		albumToAddListen,
		isAddingListen,
		closeAddListenDrawer,
		handleAddListen,
	} = useAlbums();

	const viewMeta = getViewMeta(pathname);

	if (isLoading) {
		return (
			<div className="w-full p-6">
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

	const showHistorySync =
		pathname.startsWith("/albums/recent") ||
		pathname.startsWith("/albums/rated") ||
		pathname.startsWith("/albums/library") ||
		pathname.startsWith("/albums/tracks");

	return (
		<div className="w-full p-6">
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<p className="mb-1 font-semibold text-[0.65rem] text-teal-800 uppercase tracking-[0.16em]">
						My Albums
					</p>
					<h1 className="font-[family-name:var(--font-display)] font-semibold text-3xl tracking-tight">
						{viewMeta.title}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">{viewMeta.blurb}</p>
				</div>
				{isConnected && showHistorySync ? (
					<SyncAlbumsButton
						isSyncing={isSyncing}
						onSync={syncHistory}
						variant="outline"
						lastSyncedAt={lastSyncRun?.completedAt}
					/>
				) : null}
			</div>

			{showHistorySync ? (
				<SpotifyConnection
					isConnected={isConnected}
					displayName={connection?.displayName}
					onDisconnect={handleDisconnect}
				/>
			) : null}

			{isConnected || pathname.startsWith("/albums/up-next") ? (
				<div className={showHistorySync ? "mt-6" : undefined}>{children}</div>
			) : (
				<div className="mt-6 rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
					Connect Spotify to use this view.
				</div>
			)}

			<AddListenDrawer
				track={
					trackToAddListen
						? {
								trackName: trackToAddListen.track.trackName,
								artistName: trackToAddListen.track.artistName,
								albumName: trackToAddListen.track.albumName,
								albumImageUrl: trackToAddListen.track.albumImageUrl,
								spotifyAlbumId: trackToAddListen.track.spotifyAlbumId,
								releaseDate: trackToAddListen.releaseDate,
							}
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
						closeAddListenDrawer();
					}
				}}
				onSave={handleAddListen}
				isSaving={isAddingListen}
			/>

			<AlbumRatingDrawer
				albumToRate={albumToRate}
				ratedAlbumsForYear={ratedAlbumsForYear}
				open={albumToRate !== null}
				onOpenChange={(open) => {
					if (!open) closeRatingDrawer();
				}}
				onSave={handleSaveRating}
			/>
		</div>
	);
}

export default function AlbumsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AlbumsProvider>
			<AlbumsLayoutContent>{children}</AlbumsLayoutContent>
		</AlbumsProvider>
	);
}

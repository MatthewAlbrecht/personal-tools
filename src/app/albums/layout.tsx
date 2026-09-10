"use client";

import { Disc3 } from "lucide-react";
import { usePathname } from "next/navigation";
import { AlbumRatingDrawer } from "~/components/album-rating-drawer";
import { LoginPrompt } from "~/components/login-prompt";
import { SyncAlbumsButton } from "~/components/sync-albums-button";
import { SpotifyConnection } from "../spotify-playlister/_components/spotify-connection";
import { AddListenDrawer } from "./_components/add-listen-view";
import { AlbumsProvider, useAlbums } from "./_context/albums-context";

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
			{isConnected && showHistorySync ? (
				<div className="mb-4 flex justify-end">
					<SyncAlbumsButton
						isSyncing={isSyncing}
						onSync={syncHistory}
						variant="outline"
						lastSyncedAt={lastSyncRun?.completedAt}
					/>
				</div>
			) : null}

			{showHistorySync ? (
				<SpotifyConnection
					isConnected={isConnected}
					displayName={connection?.displayName}
					onDisconnect={handleDisconnect}
				/>
			) : null}

			{isConnected || pathname.startsWith("/albums/up-next") ? (
				<div className={showHistorySync && isConnected ? "mt-4" : undefined}>
					{children}
				</div>
			) : (
				<div className="mt-4 rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
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

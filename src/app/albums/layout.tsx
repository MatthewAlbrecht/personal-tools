"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginPrompt } from "~/components/login-prompt";
import { SyncAlbumsButton } from "~/components/sync-albums-button";
import { SpotifyConnection } from "../spotify-playlister/_components/spotify-connection";
import { AddListenDrawer } from "./_components/add-listen-view";
import { AlbumRanker } from "./_components/album-ranker";
import { AlbumsProvider, useAlbums } from "./_context/albums-context";

const TABS = [
	{ href: "/albums/history", label: "History" },
	{ href: "/albums/rankings", label: "Rankings" },
	{ href: "/albums/tracks", label: "Tracks" },
	{ href: "/albums/all", label: "Albums" },
] as const;

function AlbumsLayoutContent({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
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
						lastSyncedAt={lastSyncRun?.completedAt}
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
						{TABS.map((tab) => {
							const isActive = pathname === tab.href;
							return (
								<Link
									key={tab.href}
									href={tab.href}
									className={`flex-1 rounded-md px-4 py-2 text-center font-medium text-sm transition-colors ${
										isActive
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{tab.label}
								</Link>
							);
						})}
					</div>

					{/* Page Content */}
					{children}
				</div>
			)}

			{/* Add Listen Drawer */}
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

			{/* Album Ranker Drawer */}
			{ratedAlbumsForYear && (
				<AlbumRanker
					albumToRate={albumToRate}
					existingRankedAlbums={ratedAlbumsForYear}
					open={albumToRate !== null}
					onOpenChange={(open) => {
						if (!open) closeRatingDrawer();
					}}
					onSave={handleSaveRating}
				/>
			)}
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

"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

export type SyncStats = {
	durationMs: number;
	tracksFromApi: number;
	uniqueTracksFromApi: number;
	newTracksAdded: number;
	existingTracksUpdated: number;
	uniqueAlbumsFromApi: number;
	albumsAlreadyInDb: number;
	newAlbumsDiscovered: number;
	albumsFetchFailed: number;
	tracksBackfilledFromAlbums: number;
	albumsCheckedForListens: number;
	albumListensRecorded: number;
	newAlbumNames: string[];
	recordedListenAlbumNames: string[];
};

type UseSyncHistoryReturn = {
	isSyncing: boolean;
	syncHistory: () => Promise<SyncStats | null>;
};

type UseSyncHistoryProps = {
	userId: string | null;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	onSuccess?: () => void;
};

export function useSyncHistory({
	userId,
	isConnected,
	getValidAccessToken,
	onSuccess,
}: UseSyncHistoryProps): UseSyncHistoryReturn {
	const [isSyncing, setIsSyncing] = useState(false);

	const syncHistory = useCallback(async (): Promise<SyncStats | null> => {
		if (!userId || !isConnected) return null;

		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				throw new Error("No valid access token");
			}

			const res = await fetch("/api/spotify/sync-history", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({ userId }),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Sync failed");
			}

			const data = (await res.json()) as SyncStats;

			// Build detailed toast message
			const lines = [
				`⏱️ Completed in ${(data.durationMs / 1000).toFixed(1)}s`,
				"",
				"📀 Tracks:",
				`  • ${data.tracksFromApi} from API (${data.uniqueTracksFromApi} unique)`,
				`  • ${data.newTracksAdded} new, ${data.existingTracksUpdated} updated`,
				"",
				"💿 Albums:",
				`  • ${data.uniqueAlbumsFromApi} unique in batch`,
				`  • ${data.albumsAlreadyInDb} already known`,
				`  • ${data.newAlbumsDiscovered} newly discovered`,
				data.albumsFetchFailed > 0
					? `  • ${data.albumsFetchFailed} failed to fetch`
					: null,
				data.tracksBackfilledFromAlbums > 0
					? `  • ${data.tracksBackfilledFromAlbums} tracks backfilled`
					: null,
				"",
				"🎧 Listens:",
				`  • ${data.albumsCheckedForListens} albums checked`,
				`  • ${data.albumListensRecorded} listens recorded`,
			].filter(Boolean);

			// Add album names if any
			if (data.newAlbumNames?.length > 0) {
				lines.push(
					"",
					"🆕 New albums:",
					...data.newAlbumNames.map((n) => `  • ${n}`),
				);
			}
			if (data.recordedListenAlbumNames?.length > 0) {
				lines.push(
					"",
					"✅ Listened to:",
					...data.recordedListenAlbumNames.map((n) => `  • ${n}`),
				);
			}

			toast.success(
				<div className="whitespace-pre-wrap font-mono text-xs">
					{lines.join("\n")}
				</div>,
				{ duration: 10000 },
			);

			onSuccess?.();
			return data;
		} catch (error) {
			console.error("Sync history error:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to sync history",
			);
			return null;
		} finally {
			setIsSyncing(false);
		}
	}, [userId, isConnected, getValidAccessToken, onSuccess]);

	return {
		isSyncing,
		syncHistory,
	};
}

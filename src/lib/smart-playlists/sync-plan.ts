import type { SmartPlaylistSyncMode } from "./types";

export type SyncPlan =
	| { action: "skip" }
	| { action: "replaceAll"; uris: string[] }
	| {
			action: "append";
			uris: string[];
			nextSyncedAlbumIds: string[];
			nextSyncedUris: string[];
	  };

export function planPlaylistSync(args: {
	syncMode: SmartPlaylistSyncMode;
	desiredUris: string[];
	syncedUris: string[];
	desiredAlbumIds: string[];
	syncedAlbumIds: string[];
	desiredAlbumTrackUris?: Record<string, string[]>;
}): SyncPlan {
	if (args.syncMode === "mirror") {
		if (urisEqual(args.desiredUris, args.syncedUris)) {
			return { action: "skip" };
		}
		return { action: "replaceAll", uris: args.desiredUris };
	}

	const syncedAlbumIdSet = new Set(args.syncedAlbumIds);
	const newAlbumIds = args.desiredAlbumIds.filter(
		(id) => !syncedAlbumIdSet.has(id),
	);

	if (newAlbumIds.length === 0) {
		return { action: "skip" };
	}

	const urisToAppend: string[] = [];
	for (const albumId of newAlbumIds) {
		const trackUris = args.desiredAlbumTrackUris?.[albumId] ?? [];
		urisToAppend.push(...trackUris);
	}

	if (urisToAppend.length === 0) {
		return { action: "skip" };
	}

	const nextSyncedAlbumIds = [...args.syncedAlbumIds, ...newAlbumIds];

	return {
		action: "append",
		uris: urisToAppend,
		nextSyncedAlbumIds,
		nextSyncedUris: [...args.syncedUris, ...urisToAppend],
	};
}

function urisEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

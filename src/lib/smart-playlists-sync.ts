import { ConvexHttpClient } from "convex/browser";
import { env } from "~/env.js";
import { hashTrackUris } from "~/lib/smart-playlists/content-hash";
import { expandAlbumsToTrackUris } from "~/lib/smart-playlists/expand-tracks";
import { planPlaylistSync } from "~/lib/smart-playlists/sync-plan";
import {
	addItemsToPlaylist,
	getAlbumTrackUris,
	replacePlaylistItems,
} from "~/lib/spotify";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const SPOTIFY_PLAYLIST_URI_CHUNK = 100;

export type SmartPlaylistSyncResult = {
	success: boolean;
	recipeId: string;
	skipped?: boolean;
	action?: "skip" | "replaceAll" | "append";
	matchAlbumCount?: number;
	matchTrackCount?: number;
	durationMs: number;
	error?: string;
};

export type SmartPlaylistSyncAllResult = {
	results: SmartPlaylistSyncResult[];
};

export async function syncSmartPlaylistRecipe({
	accessToken,
	userId,
	recipeId,
	convexUrl = env.NEXT_PUBLIC_CONVEX_URL,
}: {
	accessToken: string;
	userId: string;
	recipeId: Id<"smartPlaylists">;
	convexUrl?: string;
}): Promise<SmartPlaylistSyncResult> {
	const startedAt = Date.now();
	const convex = new ConvexHttpClient(convexUrl);

	try {
		const recipe = await convex.query(api.smartPlaylists.getRecipe, {
			userId,
			recipeId,
		});

		if (!recipe) {
			return {
				success: false,
				recipeId,
				durationMs: Date.now() - startedAt,
				error: "Recipe not found",
			};
		}

		const now = Date.now();
		const matched = await convex.query(api.smartPlaylists.resolveMatches, {
			userId,
			source: recipe.source,
			filters: recipe.filters,
			now,
		});

		const albumsWithTracks: Array<{
			albumId: string;
			trackUris: string[];
		}> = [];
		const desiredAlbumTrackUris: Record<string, string[]> = {};

		for (const album of matched) {
			const trackUris = await loadAlbumTrackUris({
				convex,
				accessToken,
				spotifyAlbumId: album.spotifyAlbumId,
				totalTracks: album.totalTracks,
			});
			albumsWithTracks.push({
				albumId: album.spotifyAlbumId,
				trackUris,
			});
			desiredAlbumTrackUris[album.spotifyAlbumId] = trackUris;
		}

		const desiredUris = expandAlbumsToTrackUris(
			albumsWithTracks,
			recipe.trackSelection,
		);
		const contentHash = hashTrackUris(desiredUris);
		const desiredAlbumIds = matched.map((album) => album.spotifyAlbumId);
		const matchAlbumCount = matched.length;
		const matchTrackCount = desiredUris.length;

		const plan = planPlaylistSync({
			syncMode: recipe.syncMode,
			desiredUris,
			syncedUris: recipe.syncedTrackUris,
			desiredAlbumIds,
			syncedAlbumIds: recipe.syncedAlbumIds,
			desiredAlbumTrackUris,
		});

		if (plan.action === "skip") {
			await convex.mutation(api.smartPlaylists.commitSyncSuccess, {
				userId,
				recipeId,
				syncedAlbumIds: recipe.syncedAlbumIds,
				syncedTrackUris: recipe.syncedTrackUris,
				contentHash,
				matchAlbumCount,
				matchTrackCount,
				lastSyncedAt: now,
			});

			return {
				success: true,
				recipeId,
				skipped: true,
				action: "skip",
				matchAlbumCount,
				matchTrackCount,
				durationMs: Date.now() - startedAt,
			};
		}

		if (plan.action === "replaceAll") {
			await replacePlaylistItemsInChunks(
				accessToken,
				recipe.spotifyPlaylistId,
				plan.uris,
			);

			await convex.mutation(api.smartPlaylists.commitSyncSuccess, {
				userId,
				recipeId,
				syncedAlbumIds: desiredAlbumIds,
				syncedTrackUris: desiredUris,
				contentHash,
				matchAlbumCount,
				matchTrackCount,
				lastSyncedAt: now,
			});

			return {
				success: true,
				recipeId,
				action: "replaceAll",
				matchAlbumCount,
				matchTrackCount,
				durationMs: Date.now() - startedAt,
			};
		}

		// append
		await addPlaylistItemsInChunks(
			accessToken,
			recipe.spotifyPlaylistId,
			plan.uris,
		);

		await convex.mutation(api.smartPlaylists.commitSyncSuccess, {
			userId,
			recipeId,
			syncedAlbumIds: plan.nextSyncedAlbumIds,
			syncedTrackUris: plan.nextSyncedUris,
			contentHash,
			matchAlbumCount,
			matchTrackCount,
			lastSyncedAt: now,
		});

		return {
			success: true,
			recipeId,
			action: "append",
			matchAlbumCount,
			matchTrackCount,
			durationMs: Date.now() - startedAt,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error
				? error.message
				: "Unknown smart playlist sync error";

		try {
			await convex.mutation(api.smartPlaylists.commitSyncFailure, {
				userId,
				recipeId,
				lastError: errorMessage,
			});
		} catch (commitError) {
			console.error(
				"Failed to commit smart playlist sync failure:",
				commitError,
			);
		}

		console.error("Smart playlist sync error:", error);

		return {
			success: false,
			recipeId,
			durationMs: Date.now() - startedAt,
			error: errorMessage,
		};
	}
}

export async function syncAllSmartPlaylistsForUser({
	accessToken,
	userId,
	convexUrl = env.NEXT_PUBLIC_CONVEX_URL,
}: {
	accessToken: string;
	userId: string;
	convexUrl?: string;
}): Promise<SmartPlaylistSyncAllResult> {
	const convex = new ConvexHttpClient(convexUrl);
	const recipes = await convex.query(
		api.smartPlaylists.listActiveRecipesForUser,
		{ userId },
	);

	const results: SmartPlaylistSyncResult[] = [];

	for (const recipe of recipes) {
		const result = await syncSmartPlaylistRecipe({
			accessToken,
			userId,
			recipeId: recipe._id,
			convexUrl,
		});
		results.push(result);
	}

	return { results };
}

async function loadAlbumTrackUris({
	convex,
	accessToken,
	spotifyAlbumId,
	totalTracks,
}: {
	convex: ConvexHttpClient;
	accessToken: string;
	spotifyAlbumId: string;
	totalTracks: number;
}): Promise<string[]> {
	const canonicalUris = await convex.query(
		api.smartPlaylists.listCanonicalTrackUrisByAlbum,
		{ spotifyAlbumId },
	);

	if (totalTracks > 0 && canonicalUris.length === totalTracks) {
		return canonicalUris;
	}

	return await getAlbumTrackUris(accessToken, spotifyAlbumId);
}

async function replacePlaylistItemsInChunks(
	accessToken: string,
	playlistId: string,
	uris: string[],
): Promise<void> {
	const firstChunk = uris.slice(0, SPOTIFY_PLAYLIST_URI_CHUNK);
	await replacePlaylistItems(accessToken, playlistId, firstChunk);

	const remaining = uris.slice(SPOTIFY_PLAYLIST_URI_CHUNK);
	await addPlaylistItemsInChunks(accessToken, playlistId, remaining);
}

async function addPlaylistItemsInChunks(
	accessToken: string,
	playlistId: string,
	uris: string[],
): Promise<void> {
	for (
		let index = 0;
		index < uris.length;
		index += SPOTIFY_PLAYLIST_URI_CHUNK
	) {
		const chunk = uris.slice(index, index + SPOTIFY_PLAYLIST_URI_CHUNK);
		await addItemsToPlaylist(accessToken, playlistId, chunk);
	}
}

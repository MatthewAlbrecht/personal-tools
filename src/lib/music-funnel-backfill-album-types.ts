import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { getAlbums } from "~/lib/spotify";

export async function backfillMusicFunnelAlbumTypes({
	convex,
	userId,
	accessToken,
}: {
	convex: ConvexHttpClient;
	userId: string;
	accessToken: string;
}): Promise<{ albumIds: number; patchedEncounters: number }> {
	const albumIds = await convex.query(
		api.musicFunnel.listAlbumIdsMissingSpotifyAlbumType,
		{ userId },
	);
	if (albumIds.length === 0) {
		return { albumIds: 0, patchedEncounters: 0 };
	}

	const albums = await getAlbums(accessToken, albumIds);
	const patches = albums
		.filter(
			(
				album,
			): album is NonNullable<typeof album> & {
				album_type: "album" | "single" | "compilation";
			} =>
				album !== null &&
				(album.album_type === "album" ||
					album.album_type === "single" ||
					album.album_type === "compilation"),
		)
		.map((album) => ({
			spotifyAlbumId: album.id,
			spotifyAlbumType: album.album_type,
		}));

	if (patches.length === 0) {
		return { albumIds: albumIds.length, patchedEncounters: 0 };
	}

	const result = await convex.mutation(
		api.musicFunnel.patchEncountersSpotifyAlbumType,
		{ userId, patches },
	);
	return {
		albumIds: albumIds.length,
		patchedEncounters: result.patchedEncounters,
	};
}

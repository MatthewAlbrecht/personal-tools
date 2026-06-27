import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { extractOrderedUniqueAlbumIds } from "~/lib/rob-top-50-import";
import { getAlbum, getAllPlaylistTracks } from "~/lib/spotify";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type ImportRequest = {
	playlistId: string;
	yearId: string;
	userId: string;
	accessToken: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as ImportRequest;
		const { playlistId, yearId, userId, accessToken } = body;

		if (!playlistId || !yearId || !userId || !accessToken) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 },
			);
		}

		const tracks = await getAllPlaylistTracks(accessToken, playlistId);
		const extracted = extractOrderedUniqueAlbumIds(
			tracks.map((t) => ({ albumId: t.album?.id })),
		);

		if (extracted.albumIds.length === 0) {
			return NextResponse.json(
				{ error: "No albums found in playlist" },
				{ status: 400 },
			);
		}

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const convexAlbumIds: Id<"spotifyAlbums">[] = [];

		for (const spotifyAlbumId of extracted.albumIds) {
			const album = await getAlbum(accessToken, spotifyAlbumId);
			const albumId = await convex.mutation(api.spotify.upsertAlbum, {
				spotifyAlbumId: album.id,
				name: album.name,
				artistName: album.artists.map((a) => a.name).join(", "),
				imageUrl: album.images[0]?.url,
				releaseDate: album.release_date,
				totalTracks: album.total_tracks,
				genres: album.genres,
				rawData: JSON.stringify(album),
			});
			await convex.mutation(api.spotify.attemptRymMatchForAlbum, {
				albumId,
			});
			convexAlbumIds.push(albumId);
		}

		await convex.mutation(api.robRankings.replaceYearFromAlbums, {
			userId,
			yearId: yearId as Id<"robRankingYears">,
			albumIds: convexAlbumIds,
		});

		return NextResponse.json({
			imported: extracted.albumIds.length,
			duplicatesSkipped: extracted.duplicatesSkipped,
			totalTracks: extracted.totalTracks,
			truncated: extracted.truncated,
		});
	} catch (error) {
		console.error("[import-robs-top-50]", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Import failed",
			},
			{ status: 500 },
		);
	}
}

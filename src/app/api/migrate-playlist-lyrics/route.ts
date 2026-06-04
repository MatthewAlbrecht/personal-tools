import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../convex/_generated/api";

export async function POST(request: NextRequest) {
	try {
		const session = request.cookies.get("session")?.value;
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const devUrl = env.NEXT_PUBLIC_CONVEX_URL;
		const prodUrl = env.NEXT_PUBLIC_CONVEX_PROD_URL;

		if (!prodUrl) {
			return NextResponse.json(
				{ error: "Production Convex URL not configured" },
				{ status: 500 },
			);
		}

		const devClient = new ConvexHttpClient(devUrl);
		const prodClient = new ConvexHttpClient(prodUrl);

		console.log("Fetching playlist lyrics from dev...");
		const playlists = await devClient.query(api.playlistLyrics.listForSync);

		let playlistsSynced = 0;
		let scrapesSynced = 0;
		let failed = 0;

		for (const { playlist, songs } of playlists) {
			try {
				console.log(`Migrating playlist lyrics: ${playlist.title}`);

				const prodPlaylistId = await prodClient.mutation(
					api.playlistLyrics.upsertPlaylistForSync,
					{
						title: playlist.title,
						slug: playlist.slug,
						theme: playlist.theme,
						description: playlist.description,
						notes: playlist.notes,
						zineSpotifyQrImageUrl: playlist.zineSpotifyQrImageUrl,
						zineAppleMusicQrImageUrl: playlist.zineAppleMusicQrImageUrl,
						zineShowSpotifyQr: playlist.zineShowSpotifyQr,
						zineShowAppleMusicQr: playlist.zineShowAppleMusicQr,
						status: playlist.status,
						createdAt: playlist.createdAt,
						updatedAt: playlist.updatedAt,
					},
				);

				await prodClient.mutation(api.playlistLyrics.replaceItemsForSync, {
					playlistId: prodPlaylistId,
					items: songs.map((song) => ({
						position: song.position,
						userNote: song.userNote,
						introContent: song.introContent,
						songTitleOverride: song.songTitleOverride,
						artistNameOverride: song.artistNameOverride,
						albumTitleOverride: song.albumTitleOverride,
						albumArtUrlOverride: song.albumArtUrlOverride,
						durationSecondsOverride: song.durationSecondsOverride,
						pendingUrl: song.pendingUrl,
						scrapeState: song.scrapeState,
						createdAt: song.createdAt,
						updatedAt: song.updatedAt,
						scrape: song.scrape
							? {
									canonicalUrl: song.scrape.canonicalUrl,
									songTitle: song.scrape.songTitle,
									artistName: song.scrape.artistName,
									albumTitle: song.scrape.albumTitle,
									albumYear: song.scrape.albumYear,
									albumArtUrl: song.scrape.albumArtUrl,
									lyrics: song.scrape.lyrics,
									about: song.scrape.about,
									lastScrapedAt: song.scrape.lastScrapedAt,
									createdAt: song.scrape.createdAt,
									updatedAt: song.scrape.updatedAt,
								}
							: undefined,
					})),
				});

				playlistsSynced++;
				scrapesSynced += songs.filter((song) => song.scrape).length;
			} catch (error) {
				failed++;
				console.error(
					`Failed to migrate playlist lyrics: ${playlist.title}`,
					error,
				);
			}
		}

		return NextResponse.json({
			success: failed === 0,
			playlistsSynced,
			scrapesSynced,
			failed,
			total: playlists.length,
		});
	} catch (error) {
		console.error("Playlist lyrics migration failed:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Playlist lyrics migration failed",
			},
			{ status: 500 },
		);
	}
}

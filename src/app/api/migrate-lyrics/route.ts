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

		console.log("Fetching album lyrics from dev...");
		const albums = await devClient.query(api.geniusAlbums.listAlbumsForSync);

		let albumsSynced = 0;
		let failed = 0;

		for (const { album, songs } of albums) {
			try {
				console.log(`Migrating album lyrics: ${album.artistName} - ${album.albumTitle}`);

				const prodAlbumId = await prodClient.mutation(
					api.geniusAlbums.upsertAlbumForSync,
					album,
				);

				await prodClient.mutation(api.geniusAlbums.replaceSongsForSync, {
					albumId: prodAlbumId,
					songs,
				});

				albumsSynced++;
			} catch (error) {
				failed++;
				console.error(
					`Failed to migrate album lyrics: ${album.artistName} - ${album.albumTitle}`,
					error,
				);
			}
		}

		return NextResponse.json({
			success: failed === 0,
			albumsSynced,
			failed,
			total: albums.length,
		});
	} catch (error) {
		console.error("Migration failed:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Migration failed",
			},
			{ status: 500 },
		);
	}
}

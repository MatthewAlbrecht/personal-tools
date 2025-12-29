import { type NextRequest, NextResponse } from "next/server";
import { getAlbum } from "~/lib/spotify";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ albumId: string }> },
): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const { albumId } = await params;

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	if (!albumId) {
		return NextResponse.json({ error: "Album ID required" }, { status: 400 });
	}

	try {
		const album = await getAlbum(accessToken, albumId);

		// Return the album data in the format expected by the upsertAlbum mutation
		return NextResponse.json({
			spotifyAlbumId: album.id,
			name: album.name,
			artistName: album.artists.map((a) => a.name).join(", "),
			imageUrl: album.images[0]?.url,
			releaseDate: album.release_date,
			totalTracks: album.total_tracks,
			genres: album.genres,
		});
	} catch (error) {
		console.error("Error fetching album:", error);
		return NextResponse.json(
			{ error: "Failed to fetch album" },
			{ status: 500 },
		);
	}
}

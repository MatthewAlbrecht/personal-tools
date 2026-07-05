import { type NextRequest, NextResponse } from "next/server";
import { getAlbum } from "~/lib/spotify";

export async function POST(
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

		return NextResponse.json({
			spotifyAlbumId: album.id,
			albumName: album.name,
			albumImageUrl: album.images[0]?.url,
			rawData: JSON.stringify(album),
			tracks: album.tracks.items.map((track) => ({
				spotifyTrackId: track.id,
				trackName: track.name,
				artistName: track.artists.map((artist) => artist.name).join(", "),
				artistIds: track.artists.map((artist) => artist.id),
				trackNumber: track.track_number,
				durationMs: track.duration_ms,
			})),
		});
	} catch (error) {
		console.error("Error fetching Spotify album tracks:", error);
		return NextResponse.json(
			{ error: "Failed to fetch Spotify album tracks" },
			{ status: 500 },
		);
	}
}

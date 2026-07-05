import { type NextRequest, NextResponse } from "next/server";
import { getAlbum, getArtistDiscographyAlbums } from "~/lib/spotify";
import { extractReleaseYear } from "~/lib/zine/spotify-discography-import";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ albumId: string }> },
): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const { albumId } = await params;

	if (!accessToken) {
		return NextResponse.json(
			{ error: "Missing access token" },
			{ status: 401 },
		);
	}

	if (!albumId) {
		return NextResponse.json({ error: "Album ID required" }, { status: 400 });
	}

	try {
		const album = await getAlbum(accessToken, albumId);
		const primaryArtist = album.artists[0];

		if (!primaryArtist) {
			return NextResponse.json(
				{ error: "Album has no artist metadata" },
				{ status: 400 },
			);
		}

		const discographyAlbums = await getArtistDiscographyAlbums(
			accessToken,
			primaryArtist.id,
		);

		const releases = discographyAlbums.map((discographyAlbum) => ({
			spotifyAlbumId: discographyAlbum.id,
			albumTitle: discographyAlbum.name,
			artistName: discographyAlbum.artists
				.map((artist) => artist.name)
				.join(", "),
			year: extractReleaseYear(discographyAlbum.release_date),
			imageUrl: discographyAlbum.images[0]?.url,
			albumType: discographyAlbum.album_type,
			releaseDate: discographyAlbum.release_date,
			totalTracks: discographyAlbum.total_tracks,
		}));

		return NextResponse.json({
			sourceSpotifyAlbumId: album.id,
			artistId: primaryArtist.id,
			artistName: primaryArtist.name,
			releases,
		});
	} catch (error) {
		console.error("[API] Error fetching discography from album:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: `Failed to fetch discography: ${errorMessage}` },
			{ status: 500 },
		);
	}
}

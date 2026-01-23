import { type NextRequest, NextResponse } from "next/server";
import { getArtistAlbums } from "~/lib/spotify";

type RouteParams = {
	params: Promise<{ artistId: string }>;
};

export async function GET(
	request: NextRequest,
	{ params }: RouteParams,
): Promise<NextResponse> {
	try {
		const { artistId } = await params;
		const accessToken = request.headers.get("X-Access-Token");

		if (!accessToken) {
			return NextResponse.json(
				{ error: "Missing access token" },
				{ status: 401 },
			);
		}

		if (!artistId) {
			return NextResponse.json(
				{ error: "Missing artistId parameter" },
				{ status: 400 },
			);
		}

		// Get include_groups from query params, default to album,single
		const searchParams = request.nextUrl.searchParams;
		const includeGroups = searchParams.get("include_groups")?.split(",") ?? [
			"album",
			"single",
		];
		const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);

		const albums = await getArtistAlbums(
			accessToken,
			artistId,
			includeGroups,
			limit,
		);

		return NextResponse.json({ albums });
	} catch (error) {
		console.error("[API] Error fetching artist albums:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: `Failed to fetch artist albums: ${errorMessage}` },
			{ status: 500 },
		);
	}
}

import { type NextRequest, NextResponse } from "next/server";
import { getUserPlaylists } from "~/lib/spotify";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	try {
		const items = await getUserPlaylists(accessToken, 50);
		return NextResponse.json({ items });
	} catch (error) {
		console.error("Error fetching playlists:", error);
		return NextResponse.json(
			{ error: "Failed to fetch playlists" },
			{ status: 500 },
		);
	}
}

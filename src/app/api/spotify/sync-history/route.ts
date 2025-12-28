import { type NextRequest, NextResponse } from "next/server";
import { syncSpotifyHistory } from "~/lib/spotify-sync";

export async function POST(request: NextRequest): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const body = await request.json();
	const { userId } = body as { userId: string };

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	if (!userId) {
		return NextResponse.json({ error: "No userId provided" }, { status: 400 });
	}

	const result = await syncSpotifyHistory(accessToken, userId, "manual");

	if (!result.success) {
		return NextResponse.json(
			{ error: "Failed to sync history", details: result.error },
			{ status: 500 },
		);
	}

	return NextResponse.json(result);
}

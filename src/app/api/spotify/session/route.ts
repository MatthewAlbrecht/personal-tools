import { type NextRequest, NextResponse } from "next/server";
import {
	deleteSpotifyConnection,
	getSpotifyConnection,
} from "~/server/convex-server";
import { getSessionUserId } from "~/server/session-user";

// Browser-facing view of the Spotify connection. Returns only what the UI
// renders; Spotify tokens never leave the server through this route.

export async function GET(request: NextRequest): Promise<NextResponse> {
	const userId = await getSessionUserId(request);
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const connection = await getSpotifyConnection(userId);
		return NextResponse.json({
			isConnected: connection !== null,
			spotifyUserId: connection?.spotifyUserId ?? null,
			displayName: connection?.displayName ?? null,
		});
	} catch (error) {
		console.error("Spotify session lookup failed:", error);
		return NextResponse.json(
			{ error: "Failed to load Spotify connection" },
			{ status: 500 },
		);
	}
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
	const userId = await getSessionUserId(request);
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		await deleteSpotifyConnection(userId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Spotify disconnect failed:", error);
		return NextResponse.json(
			{ error: "Failed to disconnect Spotify" },
			{ status: 500 },
		);
	}
}

import { type NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "~/lib/spotify";
import {
	getSpotifyConnection,
	updateSpotifyTokens,
} from "~/server/convex-server";
import { getSessionUserId } from "~/server/session-user";

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		// The user comes from the signed session cookie, never from the request body.
		const userId = await getSessionUserId(request);

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get current connection
		const connection = await getSpotifyConnection(userId);

		if (!connection) {
			return NextResponse.json(
				{ error: "No connection found" },
				{ status: 404 },
			);
		}

		// Check if token is expired (with 5 min buffer)
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (!isExpired) {
			// Token still valid - calculate remaining time in seconds
			const remainingMs = connection.expiresAt - now;
			return NextResponse.json({
				accessToken: connection.accessToken,
				expiresIn: Math.floor(remainingMs / 1000),
				refreshed: false,
			});
		}

		// Refresh the token
		console.log("Refreshing Spotify token for user:", userId);
		const newTokens = await refreshAccessToken(connection.refreshToken);

		// Update in Convex
		await updateSpotifyTokens({
			userId,
			accessToken: newTokens.access_token,
			expiresIn: newTokens.expires_in,
			refreshToken: newTokens.refresh_token,
		});

		return NextResponse.json({
			accessToken: newTokens.access_token,
			expiresIn: newTokens.expires_in,
			refreshed: true,
		});
	} catch (error) {
		console.error("Token refresh error:", error);
		return NextResponse.json(
			{ error: "Failed to refresh token" },
			{ status: 500 },
		);
	}
}

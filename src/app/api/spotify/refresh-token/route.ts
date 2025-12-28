import { fetchMutation, fetchQuery } from "convex/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "~/lib/spotify";
import { api } from "../../../../../convex/_generated/api";

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const { userId } = (await request.json()) as { userId: string };

		if (!userId) {
			return NextResponse.json({ error: "No userId" }, { status: 400 });
		}

		// Get current connection
		const connection = await fetchQuery(api.spotify.getConnection, { userId });

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
		await fetchMutation(api.spotify.updateTokens, {
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

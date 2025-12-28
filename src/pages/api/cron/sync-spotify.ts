import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env";
import { refreshAccessToken } from "~/lib/spotify";
import { syncSpotifyHistory } from "~/lib/spotify-sync";
import { api } from "../../../../convex/_generated/api";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// Only allow GET requests (QStash sends GET by default for schedules)
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	// Verify this is a legitimate cron request
	const authHeader = req.headers.authorization;
	const expectedAuth = `Bearer ${env.CRON_SECRET}`;

	if (!authHeader || authHeader !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userId = env.SPOTIFY_SYNC_USER_ID;

	try {
		console.log("🔄 Starting scheduled Spotify sync for user:", userId);

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

		// Get current connection
		const connection = await convex.query(api.spotify.getConnection, {
			userId,
		});

		if (!connection) {
			console.error("❌ No Spotify connection found for user:", userId);
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		// Check if token needs refresh (with 5 min buffer)
		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			console.log("🔑 Refreshing Spotify access token...");
			const newTokens = await refreshAccessToken(connection.refreshToken);

			// Update tokens in Convex
			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: newTokens.access_token,
				expiresIn: newTokens.expires_in,
				refreshToken: newTokens.refresh_token,
			});

			accessToken = newTokens.access_token;
			console.log("✅ Token refreshed successfully");
		}

		// Run the sync
		console.log("🔄 Syncing Spotify history...");
		const result = await syncSpotifyHistory(accessToken, userId, "cron");

		if (!result.success) {
			console.error("❌ Sync failed:", result.error);
			return res.status(500).json({
				error: "Sync failed",
				details: result.error,
				timestamp: new Date().toISOString(),
			});
		}

		console.log("✅ Sync completed:", JSON.stringify(result, null, 2));
		console.log("📊 Sync details:");
		console.log(`   - Tracks from API: ${result.tracksFromApi}`);
		console.log(`   - New tracks: ${result.newTracksAdded}`);
		console.log(`   - Albums discovered: ${result.newAlbumsDiscovered}`);
		console.log(`   - Album listens recorded: ${result.albumListensRecorded}`);

		res.status(200).json({
			success: true,
			result,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Cron sync failed:", error);

		res.status(500).json({
			error: "Sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
}

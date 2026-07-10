import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env.js";
import { syncForLaterAlbums } from "~/lib/for-later-albums-sync";
import { refreshAccessToken } from "~/lib/spotify";
import { api } from "../../../../convex/_generated/api";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const userParam = req.query.user;
	const userId =
		typeof userParam === "string" && userParam.trim()
			? userParam.trim()
			: env.SPOTIFY_SYNC_USER_ID;

	try {
		console.log("🔄 Starting scheduled For Later sync for user:", userId);

		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const connection = await convex.query(api.spotify.getConnection, {
			userId,
		});
		if (!connection) {
			console.error("❌ No Spotify connection found for user:", userId);
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		let accessToken = connection.accessToken;
		if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
			console.log("🔑 Refreshing Spotify access token...");
			const tokens = await refreshAccessToken(connection.refreshToken);
			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
			accessToken = tokens.access_token;
			console.log("✅ Token refreshed successfully");
		}

		const result = await syncForLaterAlbums({
			accessToken,
			userId,
			source: "cron",
		});

		if (!result.success) {
			console.error("❌ For Later sync failed:", result.error);
			return res.status(500).json({
				error: "For Later sync failed",
				details: result.error,
				timestamp: new Date().toISOString(),
			});
		}

		console.log(
			"✅ For Later sync completed:",
			JSON.stringify(result, null, 2),
		);

		return res.status(200).json({
			success: true,
			result,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Cron For Later sync failed:", error);

		return res.status(500).json({
			error: "For Later sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
}

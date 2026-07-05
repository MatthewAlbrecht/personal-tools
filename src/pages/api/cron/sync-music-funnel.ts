import { ConvexHttpClient } from "convex/browser";
import type { NextApiRequest, NextApiResponse } from "next";
import { env } from "~/env.js";
import { syncMusicFunnel } from "~/lib/music-funnel-sync";
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
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const connection = await convex.query(api.spotify.getConnection, {
			userId,
		});
		if (!connection) {
			return res.status(404).json({ error: "No Spotify connection found" });
		}

		let accessToken = connection.accessToken;
		if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
			const tokens = await refreshAccessToken(connection.refreshToken);
			await convex.mutation(api.spotify.updateTokens, {
				userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
			accessToken = tokens.access_token;
		}

		const result = await syncMusicFunnel({
			accessToken,
			userId,
			source: "cron",
		});
		return res
			.status(result.success ? 200 : 500)
			.json({ success: result.success, result });
	} catch (error) {
		return res.status(500).json({
			error: "Music funnel sync failed",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import {
	syncMusicFunnel,
	syncMusicFunnelSource,
} from "~/lib/music-funnel-sync";
import { refreshAccessToken } from "~/lib/spotify";
import {
	getSpotifyConnection,
	updateSpotifyTokens,
} from "~/server/convex-server";
import { getSessionUserId } from "~/server/session-user";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function POST(request: NextRequest): Promise<NextResponse> {
	const userId = await getSessionUserId(request);
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const body = (await request.json()) as { sourceId?: string };

	try {
		const connection = await getSpotifyConnection(userId);

		if (!connection) {
			return NextResponse.json(
				{ error: "No Spotify connection found" },
				{ status: 401 },
			);
		}

		let accessToken = connection.accessToken;
		if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
			const tokens = await refreshAccessToken(connection.refreshToken);
			await updateSpotifyTokens({
				userId: userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
			accessToken = tokens.access_token;
		}

		const result = body.sourceId
			? await syncMusicFunnelSource({
					accessToken,
					userId: userId,
					sourceId: body.sourceId as Id<"musicFunnelSources">,
				})
			: await syncMusicFunnel({
					accessToken,
					userId: userId,
					source: "manual",
				});

		if (!result.success && result.sourcesScanned === 0 && result.errors.length > 0) {
			return NextResponse.json(result, { status: 400 });
		}

		return NextResponse.json(result, { status: result.success ? 200 : 500 });
	} catch (error) {
		console.error("Music funnel sync failed:", error);
		return NextResponse.json(
			{
				error: "Music funnel sync failed",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

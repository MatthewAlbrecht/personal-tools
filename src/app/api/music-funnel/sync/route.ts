import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { syncMusicFunnel } from "~/lib/music-funnel-sync";
import { refreshAccessToken } from "~/lib/spotify";
import { api } from "../../../../../convex/_generated/api";

export async function POST(request: NextRequest): Promise<NextResponse> {
	const body = (await request.json()) as { userId?: string };
	if (!body.userId) {
		return NextResponse.json({ error: "Missing userId" }, { status: 400 });
	}

	try {
		const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
		const connection = await convex.query(api.spotify.getConnection, {
			userId: body.userId,
		});

		if (!connection) {
			return NextResponse.json(
				{ error: "No Spotify connection found" },
				{ status: 401 },
			);
		}

		let accessToken = connection.accessToken;
		if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
			const tokens = await refreshAccessToken(connection.refreshToken);
			await convex.mutation(api.spotify.updateTokens, {
				userId: body.userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
			accessToken = tokens.access_token;
		}

		const result = await syncMusicFunnel({
			accessToken,
			userId: body.userId,
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

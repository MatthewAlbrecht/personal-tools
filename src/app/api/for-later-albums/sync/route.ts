import { type NextRequest, NextResponse } from "next/server";
import { syncForLaterAlbums } from "~/lib/for-later-albums-sync";

type SyncForLaterAlbumsRequest = {
	userId?: string;
	source?: "manual" | "cron";
	fullPlaylist?: boolean;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	const accessToken = request.headers.get("X-Access-Token");
	const body = (await request.json()) as SyncForLaterAlbumsRequest;
	const { userId, source = "manual", fullPlaylist = false } = body;

	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	if (!userId) {
		return NextResponse.json({ error: "No userId provided" }, { status: 400 });
	}

	if (source !== "manual" && source !== "cron") {
		return NextResponse.json(
			{ error: "source must be manual or cron" },
			{ status: 400 },
		);
	}

	try {
		const result = await syncForLaterAlbums({
			accessToken,
			userId,
			source,
			fullPlaylist,
		});

		if (!result.success) {
			return NextResponse.json(
				{ error: "Failed to sync For Later albums", details: result.error },
				{ status: 500 },
			);
		}

		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown For Later sync error";

		return NextResponse.json(
			{ error: "Failed to sync For Later albums", details: message },
			{ status: 500 },
		);
	}
}

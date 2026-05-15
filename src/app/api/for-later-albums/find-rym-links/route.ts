import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { env } from "~/env.js";

type FindRymLinksBody = {
	userId?: string;
	forLaterAlbumItemIds?: string[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	let body: FindRymLinksBody;
	try {
		body = (await request.json()) as FindRymLinksBody;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const userId = typeof body.userId === "string" ? body.userId.trim() : "";
	const ids = Array.isArray(body.forLaterAlbumItemIds)
		? body.forLaterAlbumItemIds
		: [];

	if (!userId) {
		return NextResponse.json({ error: "userId is required" }, { status: 400 });
	}

	if (ids.length === 0) {
		return NextResponse.json(
			{ error: "forLaterAlbumItemIds must be non-empty" },
			{ status: 400 },
		);
	}

	const capped = ids.slice(0, 25).filter((id): id is string => typeof id === "string");

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(api.forLaterAlbums.queueForLaterRymDiscovery, {
			userId,
			forLaterAlbumItemIds: capped as Id<"forLaterAlbumItems">[],
		});

		return NextResponse.json({
			ok: true,
			queued: result.queued,
			message:
				"Items marked queued for RYM discovery (Phase 3 AI worker can process these).",
		});
	} catch (error) {
		console.error("[for-later-albums/find-rym-links]", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import { unauthorizedIfNotEnrichmentSecret } from "../_auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const unauthorized = unauthorizedIfNotEnrichmentSecret(request);
	if (unauthorized) {
		return unauthorized;
	}

	const q = request.nextUrl.searchParams.get("q");
	if (!q?.trim()) {
		return NextResponse.json(
			{ error: "Missing required query param: q" },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.query(api.albumEnrichment.resolveAlbum, {
			userId: env.SPOTIFY_SYNC_USER_ID,
			q: q.trim(),
		});

		if (result === null) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error("[album-enrichment/resolve] Convex query failed", error);
		const message =
			error instanceof Error ? error.message : "Convex query failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

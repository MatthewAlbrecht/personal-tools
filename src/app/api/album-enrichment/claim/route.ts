import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import { unauthorizedIfNotEnrichmentSecret } from "../_auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
	const unauthorized = unauthorizedIfNotEnrichmentSecret(request);
	if (unauthorized) {
		return unauthorized;
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(
			api.albumEnrichment.claimNextForLater,
			{ userId: env.SPOTIFY_SYNC_USER_ID },
		);
		return NextResponse.json(result);
	} catch (error) {
		console.error("[album-enrichment/claim] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

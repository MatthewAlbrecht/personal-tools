import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { captureEbayListings } from "~/server/convex-server";

// The extension posts each eBay search-results page here with the shared
// extension secret (as for RYM and Bandcamp). Listings are forwarded over the
// secret-guarded Convex server channel to an internal mutation, which checks
// every field.
export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!env.RYM_EXTENSION_INGEST_SECRET) {
		return NextResponse.json(
			{ error: "RYM_EXTENSION_INGEST_SECRET is not set on the server" },
			{ status: 503 },
		);
	}

	const authHeader = request.headers.get("authorization");
	const bearer = authHeader?.startsWith("Bearer ")
		? authHeader.slice("Bearer ".length).trim()
		: null;
	if (!bearer || bearer !== env.RYM_EXTENSION_INGEST_SECRET) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const listings =
		typeof body === "object" && body !== null && "listings" in body
			? body.listings
			: undefined;
	if (!Array.isArray(listings)) {
		return NextResponse.json(
			{ error: "Expected { listings: [...] }" },
			{ status: 400 },
		);
	}

	try {
		return NextResponse.json(await captureEbayListings(listings));
	} catch (error) {
		console.error("[yugioh/ebay-capture] forward to Convex failed", error);
		return NextResponse.json(
			{ error: "Couldn't save the Listings" },
			{ status: 502 },
		);
	}
}

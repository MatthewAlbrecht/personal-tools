import { type NextRequest, NextResponse } from "next/server";
import { captureEbayListings } from "~/server/convex-server";
import { rejectUnlessExtension } from "~/server/extension-ingest";

// The extension posts each eBay search-results page here with the shared
// extension secret (as for RYM and Bandcamp). Listings are forwarded over the
// secret-guarded Convex server channel to an internal mutation, which checks
// every field.
export async function POST(request: NextRequest): Promise<NextResponse> {
	const rejected = rejectUnlessExtension(request);
	if (rejected) return rejected;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const fields: Record<string, unknown> =
		typeof body === "object" && body !== null ? { ...body } : {};
	const listings = fields.listings;
	if (!Array.isArray(listings)) {
		return NextResponse.json(
			{ error: "Expected { listings: [...] }" },
			{ status: 400 },
		);
	}
	// The Search page's URL, so the reply can say which Deck's Listings it fed.
	const searchUrl =
		typeof fields.searchUrl === "string" ? fields.searchUrl : null;

	try {
		return NextResponse.json(await captureEbayListings(listings, searchUrl));
	} catch (error) {
		console.error("[yugioh/ebay-capture] forward to Convex failed", error);
		return NextResponse.json(
			{ error: "Couldn't save the Listings" },
			{ status: 502 },
		);
	}
}

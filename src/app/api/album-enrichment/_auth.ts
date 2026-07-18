import { NextResponse } from "next/server";
import { env } from "~/env.js";

export function unauthorizedIfNotEnrichmentSecret(
	request: Request,
): NextResponse | null {
	const expected = `Bearer ${env.ALBUM_ENRICHMENT_SECRET}`;
	if (request.headers.get("authorization") !== expected) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}

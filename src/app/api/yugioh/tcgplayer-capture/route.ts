import { type NextRequest, NextResponse } from "next/server";
import { captureTcgplayerProduct } from "~/server/convex-server";
import { rejectUnlessExtension } from "~/server/extension-ingest";

// The extension posts each TCGplayer product page here with the shared
// extension secret. The page is forwarded over the secret-guarded Convex
// server channel to an internal mutation, which checks every field.
export async function POST(request: NextRequest): Promise<NextResponse> {
	const rejected = rejectUnlessExtension(request);
	if (rejected) return rejected;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const product =
		typeof body === "object" && body !== null && "product" in body
			? body.product
			: undefined;
	if (typeof product !== "object" || product === null) {
		return NextResponse.json(
			{ error: "Expected { product: {...} }" },
			{ status: 400 },
		);
	}

	try {
		return NextResponse.json(await captureTcgplayerProduct(product));
	} catch (error) {
		console.error("[yugioh/tcgplayer-capture] forward to Convex failed", error);
		return NextResponse.json(
			{ error: "Couldn't save the TCGplayer page" },
			{ status: 502 },
		);
	}
}

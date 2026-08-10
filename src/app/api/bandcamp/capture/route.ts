import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";

type BandcampCapturePayload = {
	bandcampUrl?: unknown;
	name?: unknown;
	artistName?: unknown;
	imageUrl?: unknown;
	releaseDate?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(body: unknown): BandcampCapturePayload | null {
	if (!isRecord(body)) {
		return null;
	}

	return body;
}

function trimmedString(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim() || undefined : undefined;
}

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

	let bodyUnknown: unknown;
	try {
		bodyUnknown = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const body = parsePayload(bodyUnknown);
	if (!body) {
		return NextResponse.json(
			{ error: "Expected JSON object body" },
			{ status: 400 },
		);
	}

	const bandcampUrl = trimmedString(body.bandcampUrl);
	const name = trimmedString(body.name);
	const artistName = trimmedString(body.artistName);

	if (!bandcampUrl || !name || !artistName) {
		return NextResponse.json(
			{ error: "Missing required fields: bandcampUrl, name, artistName" },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(
			api.spotify.captureBandcampAlbumToLibrary,
			{
				userId: env.SPOTIFY_SYNC_USER_ID,
				bandcampUrl,
				name,
				artistName,
				imageUrl: trimmedString(body.imageUrl),
				releaseDate: trimmedString(body.releaseDate),
			},
		);

		return NextResponse.json({
			ok: true,
			albumId: result.albumId,
			alreadyExists: result.alreadyExists,
			alreadyInLibrary: result.alreadyInLibrary,
		});
	} catch (error) {
		console.error("[bandcamp/capture] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

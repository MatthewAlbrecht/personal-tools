import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";

type NamedLink = {
	name: string;
	href?: string | null;
};

type ExtensionPayload = {
	rymUrl?: string;
	url?: string;
	releaseType?: string;
	albumTitle?: string;
	artists?: NamedLink[];
	primaryGenres?: NamedLink[];
	secondaryGenres?: NamedLink[];
	descriptors?: string[];
	spotifyAlbumId?: string | null;
	spotifyAlbumUrl?: string | null;
	capturedAt?: number;
};

function normalizeNamedLinks(items: NamedLink[] | undefined) {
	if (!items?.length) {
		return [];
	}
	return items.map((item) => ({
		name: item.name,
		...(item.href ? { href: item.href } : {}),
	}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(body: unknown): ExtensionPayload | null {
	if (!isRecord(body)) {
		return null;
	}
	return body as ExtensionPayload;
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

	const rymUrl =
		(typeof body.rymUrl === "string" && body.rymUrl.trim()) ||
		(typeof body.url === "string" && body.url.trim()) ||
		"";

	const albumTitle =
		typeof body.albumTitle === "string" ? body.albumTitle.trim() : "";

	if (!rymUrl || !albumTitle) {
		return NextResponse.json(
			{ error: "Missing required fields: rymUrl (or url), albumTitle" },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const scrapeId = await convex.mutation(
			api.rateYourMusicScrapes.upsertRateYourMusicScrape,
			{
				rymUrl,
				releaseTypeLabel:
					typeof body.releaseType === "string"
						? body.releaseType.trim() || undefined
						: undefined,
				albumTitle,
				artists: normalizeNamedLinks(body.artists),
				primaryGenres: normalizeNamedLinks(body.primaryGenres),
				secondaryGenres: normalizeNamedLinks(body.secondaryGenres),
				descriptors: Array.isArray(body.descriptors)
					? body.descriptors.filter((d): d is string => typeof d === "string")
					: [],
				spotifyAlbumId:
					body.spotifyAlbumId === null || body.spotifyAlbumId === undefined
						? undefined
						: String(body.spotifyAlbumId).trim() || undefined,
				spotifyAlbumUrl:
					body.spotifyAlbumUrl === null || body.spotifyAlbumUrl === undefined
						? undefined
						: String(body.spotifyAlbumUrl).trim() || undefined,
				lastScrapedAt:
					typeof body.capturedAt === "number" ? body.capturedAt : undefined,
			},
		);

		return NextResponse.json({
			ok: true,
			scrapeId,
		});
	} catch (error) {
		console.error("[rate-your-music/scrape] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

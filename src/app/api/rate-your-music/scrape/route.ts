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
	tracklistingTotalSeconds?: number;
	averageRating?: number;
	ratingsCount?: number;
	reviewsCount?: number;
	releaseDateLabel?: string;
	coverImageUrl?: string;
};

type MutationArgs = {
	rymUrl: string;
	releaseTypeLabel?: string;
	albumTitle: string;
	artists: Array<{ name: string; href?: string }>;
	primaryGenres: Array<{ name: string; href?: string }>;
	secondaryGenres: Array<{ name: string; href?: string }>;
	descriptors: string[];
	spotifyAlbumId?: string;
	spotifyAlbumUrl?: string;
	lastScrapedAt?: number;
	tracklistingTotalSeconds?: number;
	averageRating?: number;
	ratingsCount?: number;
	reviewsCount?: number;
	releaseDateLabel?: string;
	coverImageUrl?: string;
};

const MAX_BATCH = 250;

function normalizeNamedLinks(
	items: NamedLink[] | undefined,
): Array<{ name: string; href?: string }> {
	if (!items?.length) {
		return [];
	}
	const out: Array<{ name: string; href?: string }> = [];
	for (const item of items) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const name =
			typeof item.name === "string"
				? item.name.replace(/\s+/g, " ").trim()
				: "";
		if (!name) {
			continue;
		}
		const hrefRaw = item.href;
		const hrefTrimmed =
			hrefRaw !== undefined && hrefRaw !== null && String(hrefRaw).trim()
				? String(hrefRaw).trim()
				: "";
		if (hrefTrimmed) {
			out.push({ name, href: hrefTrimmed });
		} else {
			out.push({ name });
		}
	}
	return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalPositiveInt(value: unknown, max: number): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	const n = Math.round(value);
	if (n < 0 || n > max) {
		return undefined;
	}
	return n;
}

function optionalRating(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	if (value < 0 || value > 5) {
		return undefined;
	}
	return value;
}

function isOurHostedCoverUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (host.includes("snmc.io") || host.includes("sonemic.net")) {
			return false;
		}
		if (host.includes("rateyourmusic.com")) {
			return false;
		}
		return host.includes("cloudfront.net") || host === env.CLOUDFRONT_DOMAIN;
	} catch {
		return false;
	}
}

function optionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed || undefined;
}

function mutationArgsFromPayload(body: ExtensionPayload): MutationArgs | null {
	const rymUrl =
		(typeof body.rymUrl === "string" && body.rymUrl.trim()) ||
		(typeof body.url === "string" && body.url.trim()) ||
		"";

	const albumTitle =
		typeof body.albumTitle === "string" ? body.albumTitle.trim() : "";

	if (!rymUrl || !albumTitle) {
		return null;
	}

	let tracklistingTotalSeconds: number | undefined;
	if (
		typeof body.tracklistingTotalSeconds === "number" &&
		Number.isFinite(body.tracklistingTotalSeconds)
	) {
		const n = Math.round(body.tracklistingTotalSeconds);
		if (n > 0 && n <= 24 * 3600) {
			tracklistingTotalSeconds = n;
		}
	}

	const averageRating = optionalRating(body.averageRating);
	const ratingsCount = optionalPositiveInt(body.ratingsCount, 50_000_000);
	const reviewsCount = optionalPositiveInt(body.reviewsCount, 1_000_000);
	const releaseDateLabel = optionalTrimmedString(body.releaseDateLabel);
	const coverImageUrlRaw = optionalTrimmedString(body.coverImageUrl);
	const coverImageUrl =
		coverImageUrlRaw && isOurHostedCoverUrl(coverImageUrlRaw)
			? coverImageUrlRaw
			: undefined;

	return {
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
			? body.descriptors
					.filter((d): d is string => typeof d === "string")
					.map((d) => d.replace(/\s+/g, " ").trim())
					.filter(Boolean)
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
		...(tracklistingTotalSeconds !== undefined
			? { tracklistingTotalSeconds }
			: {}),
		...(averageRating !== undefined ? { averageRating } : {}),
		...(ratingsCount !== undefined ? { ratingsCount } : {}),
		...(reviewsCount !== undefined ? { reviewsCount } : {}),
		...(releaseDateLabel !== undefined ? { releaseDateLabel } : {}),
		...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
	};
}

function payloadsFromBody(bodyUnknown: unknown): ExtensionPayload[] | null {
	if (!isRecord(bodyUnknown)) {
		return null;
	}
	if (Array.isArray(bodyUnknown.items)) {
		return bodyUnknown.items.filter(isRecord) as ExtensionPayload[];
	}
	return [bodyUnknown as ExtensionPayload];
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

	const payloads = payloadsFromBody(bodyUnknown);
	if (!payloads || payloads.length === 0) {
		return NextResponse.json(
			{ error: "Expected JSON object body or { items: [...] }" },
			{ status: 400 },
		);
	}
	if (payloads.length > MAX_BATCH) {
		return NextResponse.json(
			{ error: `Batch too large (max ${MAX_BATCH})` },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	const scrapeIds: string[] = [];
	let failed = 0;

	try {
		for (const payload of payloads) {
			const args = mutationArgsFromPayload(payload);
			if (!args) {
				failed += 1;
				continue;
			}
			const scrapeId = await convex.mutation(
				api.rateYourMusicScrapes.upsertRateYourMusicScrape,
				args,
			);
			scrapeIds.push(scrapeId);
		}

		if (scrapeIds.length === 0) {
			return NextResponse.json(
				{ error: "No valid scrape items (need rymUrl and albumTitle)" },
				{ status: 400 },
			);
		}

		return NextResponse.json({
			ok: true,
			scrapeId: scrapeIds[0],
			scrapeIds,
			upserted: scrapeIds.length,
			failed,
		});
	} catch (error) {
		console.error("[rate-your-music/scrape] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

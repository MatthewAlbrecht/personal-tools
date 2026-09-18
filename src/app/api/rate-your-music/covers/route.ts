import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import { uploadToS3 } from "../../../../../convex/s3Helper";

const MAX_COVERS = 25;
const MAX_BYTES = 400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJpegBase64(raw: string): Uint8Array | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}
	const comma = trimmed.indexOf(",");
	const b64 = trimmed.startsWith("data:")
		? comma >= 0
			? trimmed.slice(comma + 1)
			: ""
		: trimmed;
	if (!b64) {
		return null;
	}
	try {
		const buf = Buffer.from(b64, "base64");
		if (buf.length < 24 || buf.length > MAX_BYTES) {
			return null;
		}
		if (buf[0] !== 0xff || buf[1] !== 0xd8) {
			return null;
		}
		return new Uint8Array(buf);
	} catch {
		return null;
	}
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

	if (!isRecord(bodyUnknown) || !Array.isArray(bodyUnknown.covers)) {
		return NextResponse.json(
			{ error: "Expected { covers: [...] }" },
			{ status: 400 },
		);
	}
	if (bodyUnknown.covers.length > MAX_COVERS) {
		return NextResponse.json(
			{ error: `Too many covers (max ${MAX_COVERS})` },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
	let uploaded = 0;
	let skipped = 0;
	let failed = 0;

	for (const item of bodyUnknown.covers) {
		if (!isRecord(item)) {
			failed += 1;
			continue;
		}
		const rymUrl = typeof item.rymUrl === "string" ? item.rymUrl.trim() : "";
		const jpegBase64 =
			typeof item.jpegBase64 === "string" ? item.jpegBase64 : "";
		if (!rymUrl || !jpegBase64) {
			failed += 1;
			continue;
		}

		const existing = await convex.query(
			api.rateYourMusicScrapes.getRateYourMusicScrapeByUrl,
			{ rymUrl },
		);
		if (!existing) {
			failed += 1;
			continue;
		}
		if (existing.coverImageUrl?.includes(env.CLOUDFRONT_DOMAIN)) {
			skipped += 1;
			continue;
		}

		const bytes = decodeJpegBase64(jpegBase64);
		if (!bytes) {
			failed += 1;
			continue;
		}

		const hash = createHash("sha256").update(bytes).digest("hex");
		try {
			const { cdnUrl } = await uploadToS3({
				content: bytes,
				filename: `rym-covers/${hash}.jpg`,
				contentType: "image/jpeg",
			});
			await convex.mutation(api.rateYourMusicScrapes.setRateYourMusicScrapeCover, {
				rymUrl,
				coverImageUrl: cdnUrl,
			});
			uploaded += 1;
		} catch (error) {
			console.error("[rate-your-music/covers] upload failed", error);
			failed += 1;
		}
	}

	return NextResponse.json({
		ok: true,
		uploaded,
		skipped,
		failed,
	});
}

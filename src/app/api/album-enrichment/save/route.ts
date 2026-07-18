import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { unauthorizedIfNotEnrichmentSecret } from "../_auth";

type IdentityPacket = {
	title: string;
	artists: string[];
	releaseYear?: number;
	coverImageUrl?: string;
	rymUrl?: string;
};

type ArtistContextPayload = {
	origin?: string;
	activeSince?: string;
	instagramUrl?: string;
	artistWriteup?: string;
	listenIfYouLike?: string[];
};

type WhyListenPayload = {
	whyListenPitch: string;
};

type TagPayload = {
	tags: Array<{ label: string }>;
};

type SaveSlicesBody = {
	albumId?: unknown;
	identityPacket?: unknown;
	artistContext?: unknown;
	whyListen?: unknown;
	coverDescriptors?: unknown;
	occasions?: unknown;
	mode?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const unauthorized = unauthorizedIfNotEnrichmentSecret(request);
	if (unauthorized) {
		return unauthorized;
	}

	let bodyUnknown: unknown;
	try {
		bodyUnknown = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!isRecord(bodyUnknown)) {
		return NextResponse.json(
			{ error: "Expected JSON object body" },
			{ status: 400 },
		);
	}

	const body = bodyUnknown as SaveSlicesBody;

	if (typeof body.albumId !== "string" || !body.albumId.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: albumId" },
			{ status: 400 },
		);
	}

	if (!isRecord(body.identityPacket)) {
		return NextResponse.json(
			{ error: "Missing required field: identityPacket" },
			{ status: 400 },
		);
	}

	if (body.mode !== "gaps" && body.mode !== "overwrite") {
		return NextResponse.json(
			{ error: "mode must be 'gaps' or 'overwrite'" },
			{ status: 400 },
		);
	}

	if (
		!body.artistContext &&
		!body.whyListen &&
		!body.coverDescriptors &&
		!body.occasions
	) {
		return NextResponse.json(
			{
				error:
					"At least one slice payload is required: artistContext, whyListen, coverDescriptors, or occasions",
			},
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(api.albumEnrichment.saveSlices, {
			albumId: body.albumId as Id<"spotifyAlbums">,
			identityPacket: body.identityPacket as IdentityPacket,
			artistContext: body.artistContext as ArtistContextPayload | undefined,
			whyListen: body.whyListen as WhyListenPayload | undefined,
			coverDescriptors: body.coverDescriptors as TagPayload | undefined,
			occasions: body.occasions as TagPayload | undefined,
			mode: body.mode,
		});
		return NextResponse.json(result);
	} catch (error) {
		console.error("[album-enrichment/save] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

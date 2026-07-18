import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { unauthorizedIfNotEnrichmentSecret } from "../_auth";

const SLICE_KEYS = [
	"artistContext",
	"whyListen",
	"coverDescriptors",
	"occasions",
] as const;
type SliceKey = (typeof SLICE_KEYS)[number];

function isSliceKey(value: unknown): value is SliceKey {
	return (
		typeof value === "string" &&
		(SLICE_KEYS as readonly string[]).includes(value)
	);
}

type TrialBody = {
	trialRunId?: unknown;
	albumId?: unknown;
	slice?: unknown;
	variantId?: unknown;
	promptPath?: unknown;
	payload?: unknown;
	model?: unknown;
};

type ArtistContextTrialPayload = {
	origin?: string;
	activeSince?: string;
	instagramUrl?: string;
	artistWriteup?: string;
	listenIfYouLike?: string[];
};

type WhyListenTrialPayload = {
	whyListenPitch: string;
};

type TagTrialPayload = {
	tags: Array<{ label: string }>;
};

type TrialPayload =
	| ArtistContextTrialPayload
	| WhyListenTrialPayload
	| TagTrialPayload;

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

	const body = bodyUnknown as TrialBody;

	if (typeof body.trialRunId !== "string" || !body.trialRunId.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: trialRunId" },
			{ status: 400 },
		);
	}
	if (typeof body.albumId !== "string" || !body.albumId.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: albumId" },
			{ status: 400 },
		);
	}
	if (!isSliceKey(body.slice)) {
		return NextResponse.json(
			{
				error: `slice must be one of: ${SLICE_KEYS.join(", ")}`,
			},
			{ status: 400 },
		);
	}
	if (typeof body.variantId !== "string" || !body.variantId.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: variantId" },
			{ status: 400 },
		);
	}
	if (typeof body.promptPath !== "string" || !body.promptPath.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: promptPath" },
			{ status: 400 },
		);
	}
	if (!isRecord(body.payload)) {
		return NextResponse.json(
			{ error: "Missing required field: payload" },
			{ status: 400 },
		);
	}
	if (body.model !== undefined && typeof body.model !== "string") {
		return NextResponse.json(
			{ error: "model must be a string when present" },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(api.albumEnrichmentTrials.saveTrial, {
			trialRunId: body.trialRunId,
			albumId: body.albumId as Id<"spotifyAlbums">,
			slice: body.slice,
			variantId: body.variantId,
			promptPath: body.promptPath,
			...(body.model !== undefined ? { model: body.model } : {}),
			payload: body.payload as TrialPayload,
		});
		return NextResponse.json(result);
	} catch (error) {
		console.error("[album-enrichment/trial] Convex mutation failed", error);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

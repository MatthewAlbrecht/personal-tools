import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env.js";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { unauthorizedIfNotEnrichmentSecret } from "../_auth";

type PromoteTrialBody = {
	trialId?: unknown;
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

	const body = bodyUnknown as PromoteTrialBody;

	if (typeof body.trialId !== "string" || !body.trialId.trim()) {
		return NextResponse.json(
			{ error: "Missing required field: trialId" },
			{ status: 400 },
		);
	}

	const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

	try {
		const result = await convex.mutation(
			api.albumEnrichmentTrials.promoteTrial,
			{ trialId: body.trialId as Id<"albumEnrichmentTrials"> },
		);
		return NextResponse.json(result);
	} catch (error) {
		console.error(
			"[album-enrichment/promote-trial] Convex mutation failed",
			error,
		);
		const message =
			error instanceof Error ? error.message : "Convex mutation failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import {
	MIN_SERVER_SECRET_LENGTH,
	bearerMatchesSecret,
} from "./_utils/serverSecret";
import type { VisitReport } from "./model/yugioh/automation";
import { MAX_LISTINGS_PER_CAPTURE } from "./model/yugioh/listings";
import type { CapturedTcgplayerProduct } from "./model/yugioh/tcgplayerCapture";

// Server-to-Convex channel. Next.js route handlers and crons call these with
// `Authorization: Bearer $CONVEX_SERVER_SECRET`; the functions behind them are
// internal and have no public `api` entry. Covers Spotify OAuth tokens and
// Yu-Gi-Oh marketplace captures (forwarded by `/api/yugioh/*` routes).

const http = httpRouter();

type Body = Record<string, unknown>;
type Handler = (ctx: ActionCtx, body: Body) => Promise<Response>;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function badRequest(): Response {
	return json({ error: "Invalid request body" }, 400);
}

function serverRoute(handler: Handler) {
	return httpAction(async (ctx, request) => {
		const secret = process.env.CONVEX_SERVER_SECRET;
		if (!secret || secret.length < MIN_SERVER_SECRET_LENGTH) {
			return json({ error: "Server channel not configured" }, 503);
		}
		if (
			!(await bearerMatchesSecret(request.headers.get("Authorization"), secret))
		) {
			return json({ error: "Unauthorized" }, 401);
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return badRequest();
		}
		if (typeof body !== "object" || body === null || Array.isArray(body)) {
			return badRequest();
		}
		return await handler(ctx, body as Body);
	});
}

function str(body: Body, key: string): string | null {
	const value = body[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalStr(body: Body, key: string): string | undefined | null {
	const value = body[key];
	if (value === undefined || value === null) return undefined;
	return typeof value === "string" ? value : null;
}

function num(body: Body, key: string): number | null {
	const value = body[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

http.route({
	path: "/server/spotify/get-connection",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const userId = str(body, "userId");
		if (!userId) return badRequest();
		return json(await ctx.runQuery(internal.spotify.getConnection, { userId }));
	}),
});

http.route({
	path: "/server/spotify/update-tokens",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const userId = str(body, "userId");
		const accessToken = str(body, "accessToken");
		const expiresIn = num(body, "expiresIn");
		const refreshToken = optionalStr(body, "refreshToken");
		if (
			!userId ||
			!accessToken ||
			expiresIn === null ||
			refreshToken === null
		) {
			return badRequest();
		}
		await ctx.runMutation(internal.spotify.updateTokens, {
			userId,
			accessToken,
			expiresIn,
			refreshToken,
		});
		return json({ ok: true });
	}),
});

http.route({
	path: "/server/spotify/upsert-connection",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const userId = str(body, "userId");
		const accessToken = str(body, "accessToken");
		const refreshToken = str(body, "refreshToken");
		const expiresIn = num(body, "expiresIn");
		const spotifyUserId = str(body, "spotifyUserId");
		const displayName = optionalStr(body, "displayName");
		if (
			!userId ||
			!accessToken ||
			!refreshToken ||
			expiresIn === null ||
			!spotifyUserId ||
			displayName === null
		) {
			return badRequest();
		}
		await ctx.runMutation(internal.spotify.upsertConnection, {
			userId,
			accessToken,
			refreshToken,
			expiresIn,
			spotifyUserId,
			displayName,
		});
		return json({ ok: true });
	}),
});

http.route({
	path: "/server/spotify/delete-connection",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const userId = str(body, "userId");
		if (!userId) return badRequest();
		await ctx.runMutation(internal.spotify.deleteConnection, { userId });
		return json({ ok: true });
	}),
});

http.route({
	path: "/server/yugioh/ebay-listings",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const listings = body.listings;
		if (
			!Array.isArray(listings) ||
			listings.length > MAX_LISTINGS_PER_CAPTURE
		) {
			return badRequest();
		}
		const searchUrl = str(body, "searchUrl") ?? undefined;
		try {
			// The mutation's argument validator checks each Listing's shape.
			return json(
				await ctx.runMutation(internal.yugioh.listings.ingestEbayListings, {
					listings,
					searchUrl,
				}),
			);
		} catch (error) {
			console.error("[yugioh/ebay-listings] ingest failed", error);
			return badRequest();
		}
	}),
});

http.route({
	path: "/server/yugioh/tcgplayer-product",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const product = body.product;
		if (typeof product !== "object" || product === null) return badRequest();
		try {
			// The mutation's argument validator checks the page's shape.
			return json(
				await ctx.runMutation(internal.yugioh.listings.ingestTcgplayerProduct, {
					product: product as CapturedTcgplayerProduct,
				}),
			);
		} catch (error) {
			console.error("[yugioh/tcgplayer-product] ingest failed", error);
			return badRequest();
		}
	}),
});

// Automated browser runs: one route, one `op` per step. The script asks for a
// run ("request") and waits on it ("status", "finish" when it gives up); the
// extension claims it ("claim"), reports each page ("visit") and ends it
// ("finish"). The functions' argument validators check every field.
const automationOps: Record<
	string,
	(ctx: ActionCtx, body: Body) => Promise<unknown>
> = {
	request: (ctx, body) =>
		ctx.runMutation(internal.yugioh.automation.requestRun, {
			trigger: body.trigger as "manual",
		}),
	claim: async (ctx) => ({
		run: await ctx.runMutation(internal.yugioh.automation.claimRun, {}),
	}),
	visit: async (ctx, body) => ({
		running: await ctx.runMutation(internal.yugioh.automation.recordVisit, {
			runId: body.runId as Id<"yugiohAutomationRuns">,
			visit: body.visit as VisitReport,
		}),
	}),
	finish: async (ctx, body) => {
		await ctx.runMutation(internal.yugioh.automation.finishRun, {
			runId: body.runId as Id<"yugiohAutomationRuns">,
			error: (body.error ?? null) as string | null,
		});
		return { ok: true };
	},
	status: async (ctx, body) => ({
		run: await ctx.runQuery(internal.yugioh.automation.getRun, {
			runId: body.runId as Id<"yugiohAutomationRuns">,
		}),
	}),
};

http.route({
	path: "/server/yugioh/automation",
	method: "POST",
	handler: serverRoute(async (ctx, body) => {
		const op = str(body, "op");
		const run =
			op !== null && Object.hasOwn(automationOps, op)
				? automationOps[op]
				: undefined;
		if (!run) return badRequest();
		try {
			return json(await run(ctx, body));
		} catch (error) {
			console.error(`[yugioh/automation] ${op} failed`, error);
			return badRequest();
		}
	}),
});

export default http;

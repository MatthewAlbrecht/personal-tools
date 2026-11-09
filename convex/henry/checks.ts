import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import * as Checks from "../model/henry/checks";
import { SIGHTMAP_URL, slimSightmapResponse } from "../model/henry/sightmap";
import { henryCheckResultValidator } from "../model/henry/validators";

const FETCH_TIMEOUT_MS = 30_000;

/**
 * The hourly check: reads The Henry's availability from SightMap and hands it
 * to `recordCheck`. Does nothing else. Run by hand on dev with
 * `npx convex run henry/checks:checkSightmap`.
 */
export const checkSightmap = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const result = await fetchSightmap();
		await ctx.runMutation(internal.henry.checks.recordCheck, {
			now: Date.now(),
			result,
		});
		return null;
	},
});

/**
 * Records one check from SightMap's response (or the fetch failure). The test
 * seam: tests feed it edited copies of a real response.
 */
export const recordCheck = internalMutation({
	args: { now: v.number(), result: henryCheckResultValidator },
	returns: v.null(),
	handler: async (ctx, args) => {
		await Checks.recordCheck(ctx, args.now, args.result);
		return null;
	},
});

async function fetchSightmap(): Promise<Checks.HenryCheckResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(SIGHTMAP_URL, {
			headers: { accept: "application/json" },
			signal: controller.signal,
		});
		if (!response.ok) {
			return { kind: "fetchFailed", reason: `HTTP ${response.status}` };
		}
		return {
			kind: "response",
			body: slimSightmapResponse(await response.text()),
		};
	} catch (error) {
		return {
			kind: "fetchFailed",
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

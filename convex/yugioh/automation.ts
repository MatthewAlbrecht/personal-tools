import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Automation from "../model/yugioh/automation";
import {
	yugiohAutomationRunValidator,
	yugiohPlannedVisitValidator,
	yugiohRunKindValidator,
	yugiohRunTriggerValidator,
	yugiohVisitReportValidator,
} from "../model/yugioh/validators";

// Automated browser runs. The internal functions are reached only through
// the secret-guarded server channel (`/server/yugioh/automation` in
// convex/http.ts), which the Next route `/api/yugioh/automation` forwards to
// with the extension secret checked. The queries feed the app.

const runValidator = yugiohAutomationRunValidator.extend({
	_id: v.id("yugiohAutomationRuns"),
});

/**
 * The script asks for a run; an open run is returned instead of a new one.
 * A scheduled ask with nothing due gets a null `runId` and `kind`.
 */
export const requestRun = internalMutation({
	args: { trigger: yugiohRunTriggerValidator },
	returns: v.object({
		runId: v.union(v.id("yugiohAutomationRuns"), v.null()),
		alreadyOpen: v.boolean(),
		kind: v.union(yugiohRunKindValidator, v.null()),
	}),
	handler: async (ctx, args) =>
		await Automation.requestRun(ctx, args.trigger, Date.now()),
});

/** The extension claims the oldest run asked for, with its visit plan. */
export const claimRun = internalMutation({
	args: {},
	returns: v.union(
		v.object({
			runId: v.id("yugiohAutomationRuns"),
			visits: v.array(yugiohPlannedVisitValidator),
		}),
		v.null(),
	),
	handler: async (ctx) => await Automation.claimRun(ctx, Date.now()),
});

/** The extension reports one visited page; false tells it the run has ended. */
export const recordVisit = internalMutation({
	args: {
		runId: v.id("yugiohAutomationRuns"),
		visit: yugiohVisitReportValidator,
	},
	returns: v.boolean(),
	handler: async (ctx, args) =>
		await Automation.recordVisit(ctx, args.runId, args.visit, Date.now()),
});

/** The extension (done) or the script (gave up waiting) ends a run. */
export const finishRun = internalMutation({
	args: {
		runId: v.id("yugiohAutomationRuns"),
		error: v.union(v.string(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await Automation.finishRun(ctx, args.runId, args.error, Date.now());
		return null;
	},
});

/** One run, for the script waiting on it. */
export const getRun = internalQuery({
	args: { runId: v.id("yugiohAutomationRuns") },
	returns: v.union(runValidator, v.null()),
	handler: async (ctx, args) => await Automation.readRun(ctx, args.runId),
});

/** The latest automated runs, newest first, for Settings. */
export const listRuns = query({
	args: {},
	returns: v.array(runValidator),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await Automation.listRuns(ctx);
	},
});

/** When a capture last saw a Listing, for the Deck's "Last captured" note. */
export const getLastCapturedAt = query({
	args: {},
	returns: v.union(v.number(), v.null()),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await Automation.readLastCapturedAt(ctx);
	},
});

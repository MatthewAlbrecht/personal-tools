import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

export const importUserBundle = internalMutation({
	args: {
		userId: v.string(),
		settings: v.union(v.null(), v.any()),
		sources: v.array(v.any()),
		runs: v.array(v.any()),
		sourceRuns: v.array(v.any()),
		encounters: v.array(v.any()),
		playlistWrites: v.array(v.any()),
	},
	returns: v.object({
		settings: v.number(),
		sources: v.number(),
		runs: v.number(),
		sourceRuns: v.number(),
		encounters: v.number(),
		playlistWrites: v.number(),
	}),
	handler: async (ctx, args) => {
		await deleteUserMusicFunnelData(ctx, args.userId);

		const sourceIdMap = new Map<string, Id<"musicFunnelSources">>();
		const runIdMap = new Map<string, Id<"musicFunnelRuns">>();
		const sourceRunIdMap = new Map<string, Id<"musicFunnelSourceRuns">>();

		let settingsCount = 0;
		if (args.settings) {
			const doc = stripSystemFields(args.settings);
			await ctx.db.insert(
				"musicFunnelSettings",
				toInsert<"musicFunnelSettings">(doc, { userId: args.userId }),
			);
			settingsCount = 1;
		}

		for (const source of args.sources) {
			const prodId = String(source._id);
			const doc = stripSystemFields(source);
			const newId = await ctx.db.insert(
				"musicFunnelSources",
				toInsert<"musicFunnelSources">(doc, { userId: args.userId }),
			);
			sourceIdMap.set(prodId, newId);
		}

		for (const run of args.runs) {
			const prodId = String(run._id);
			const doc = stripSystemFields(run);
			const newId = await ctx.db.insert(
				"musicFunnelRuns",
				toInsert<"musicFunnelRuns">(doc, { userId: args.userId }),
			);
			runIdMap.set(prodId, newId);
		}

		for (const sourceRun of args.sourceRuns) {
			const prodId = String(sourceRun._id);
			const doc = stripSystemFields(sourceRun);
			const sourceId = sourceIdMap.get(String(sourceRun.sourceId));
			const runId = runIdMap.get(String(sourceRun.runId));
			if (!sourceId || !runId) {
				throw new Error(`Missing source/run mapping for source run ${prodId}`);
			}
			const newId = await ctx.db.insert(
				"musicFunnelSourceRuns",
				toInsert<"musicFunnelSourceRuns">(doc, {
					userId: args.userId,
					sourceId,
					runId,
				}),
			);
			sourceRunIdMap.set(prodId, newId);
		}

		for (const encounter of args.encounters) {
			const doc = stripSystemFields(encounter);
			const sourceId = sourceIdMap.get(String(encounter.sourceId));
			const runId = runIdMap.get(String(encounter.runId));
			const sourceRunId = sourceRunIdMap.get(String(encounter.sourceRunId));
			if (!sourceId || !runId || !sourceRunId) {
				throw new Error(
					`Missing mapping for encounter ${String(encounter._id)}`,
				);
			}
			await ctx.db.insert(
				"musicFunnelTrackEncounters",
				toInsert<"musicFunnelTrackEncounters">(doc, {
					userId: args.userId,
					sourceId,
					runId,
					sourceRunId,
				}),
			);
		}

		for (const write of args.playlistWrites) {
			const doc = stripSystemFields(write);
			const runId = runIdMap.get(String(write.runId));
			if (!runId) {
				throw new Error(`Missing run mapping for playlist write ${String(write._id)}`);
			}
			const sourceRunId = write.sourceRunId
				? sourceRunIdMap.get(String(write.sourceRunId))
				: undefined;
			await ctx.db.insert(
				"musicFunnelPlaylistWrites",
				toInsert<"musicFunnelPlaylistWrites">(doc, {
					userId: args.userId,
					runId,
					sourceRunId,
				}),
			);
		}

		return {
			settings: settingsCount,
			sources: args.sources.length,
			runs: args.runs.length,
			sourceRuns: args.sourceRuns.length,
			encounters: args.encounters.length,
			playlistWrites: args.playlistWrites.length,
		};
	},
});

function stripSystemFields(
	doc: Record<string, unknown>,
): Record<string, unknown> {
	const { _id: _unusedId, _creationTime: _unusedCreationTime, ...rest } = doc;
	return rest;
}

function toInsert<TTableName extends keyof DataModel>(
	doc: Record<string, unknown>,
	overrides: Record<string, unknown>,
): WithoutSystemFields<DataModel[TTableName]["document"]> {
	return { ...doc, ...overrides } as WithoutSystemFields<
		DataModel[TTableName]["document"]
	>;
}

type DataModel = import("../_generated/dataModel").DataModel;
type WithoutSystemFields<T> = Omit<T, "_id" | "_creationTime">;

async function deleteUserMusicFunnelData(
	ctx: MutationCtx,
	userId: string,
): Promise<void> {
	const playlistWrites = await ctx.db
		.query("musicFunnelPlaylistWrites")
		.withIndex("by_userId_writtenAt", (q) => q.eq("userId", userId))
		.collect();
	for (const row of playlistWrites) {
		await ctx.db.delete(row._id);
	}

	const encounters = await ctx.db
		.query("musicFunnelTrackEncounters")
		.withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
		.collect();
	for (const row of encounters) {
		await ctx.db.delete(row._id);
	}

	const sourceRuns = await ctx.db
		.query("musicFunnelSourceRuns")
		.withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
		.collect();
	for (const row of sourceRuns) {
		await ctx.db.delete(row._id);
	}

	const runs = await ctx.db
		.query("musicFunnelRuns")
		.withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
		.collect();
	for (const row of runs) {
		await ctx.db.delete(row._id);
	}

	const sources = await ctx.db
		.query("musicFunnelSources")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();
	for (const row of sources) {
		await ctx.db.delete(row._id);
	}

	const settings = await ctx.db
		.query("musicFunnelSettings")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.first();
	if (settings) {
		await ctx.db.delete(settings._id);
	}
}

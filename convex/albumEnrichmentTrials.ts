import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	autoJudgeArtistContext,
	autoJudgeCoverDescriptors,
} from "./_utils/albumEnrichmentAutoJudge";
import { judgeKindForSlice } from "./_utils/albumEnrichmentJudgeKinds";
import type { EnrichmentSliceKey } from "./_utils/albumEnrichmentSlices";
import {
	albumEnrichmentTrialPayloadValidator,
	enrichmentSliceKeyValidator,
} from "./_utils/albumEnrichmentTrialValidators";
import type { SaveSlicesArgs } from "./albumEnrichment";
import {
	parseReleaseYear,
	saveSlicesHandler,
	splitArtistNames,
} from "./albumEnrichment";

const judgeKindValidator = v.union(
	v.literal("auto"),
	v.literal("human"),
	v.literal("mixed"),
);

const humanVerdictValidator = v.union(
	v.literal("win"),
	v.literal("reject"),
	v.literal("undecided"),
);

const autoEvalValidator = v.object({
	passed: v.boolean(),
	checks: v.array(
		v.object({ id: v.string(), passed: v.boolean(), note: v.string() }),
	),
	notes: v.string(),
});

const albumEnrichmentTrialDocValidator = v.object({
	_id: v.id("albumEnrichmentTrials"),
	_creationTime: v.number(),
	trialRunId: v.string(),
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	slice: enrichmentSliceKeyValidator,
	variantId: v.string(),
	promptPath: v.string(),
	model: v.optional(v.string()),
	payload: albumEnrichmentTrialPayloadValidator,
	judgeKind: judgeKindValidator,
	autoEval: v.optional(autoEvalValidator),
	humanVerdict: v.optional(humanVerdictValidator),
	promotedAt: v.optional(v.number()),
	createdAt: v.number(),
});

type TrialPayload = Doc<"albumEnrichmentTrials">["payload"];

function runAutoJudgeForSlice(
	slice: EnrichmentSliceKey,
	payload: TrialPayload,
) {
	if (slice === "artistContext") {
		return autoJudgeArtistContext(
			payload as {
				origin?: string;
				activeSince?: string;
				instagramUrl?: string;
			},
		);
	}
	if (slice === "coverDescriptors") {
		return autoJudgeCoverDescriptors(
			payload as { tags: Array<{ label: string }> },
		);
	}
	return undefined;
}

function buildSliceSaveArgs(
	slice: EnrichmentSliceKey,
	payload: TrialPayload,
): Pick<
	SaveSlicesArgs,
	"artistContext" | "whyListen" | "coverDescriptors" | "occasions"
> {
	switch (slice) {
		case "artistContext":
			return { artistContext: payload as SaveSlicesArgs["artistContext"] };
		case "whyListen":
			return { whyListen: payload as SaveSlicesArgs["whyListen"] };
		case "coverDescriptors":
			return {
				coverDescriptors: payload as SaveSlicesArgs["coverDescriptors"],
			};
		case "occasions":
			return { occasions: payload as SaveSlicesArgs["occasions"] };
	}
}

/**
 * Persists one prompt-eval variant result. Never touches `albumEnrichments`
 * or the facet tables — trials are storage-only until `promoteTrial`.
 */
export const saveTrial = mutation({
	args: {
		trialRunId: v.string(),
		albumId: v.id("spotifyAlbums"),
		slice: enrichmentSliceKeyValidator,
		variantId: v.string(),
		promptPath: v.string(),
		model: v.optional(v.string()),
		payload: albumEnrichmentTrialPayloadValidator,
	},
	returns: v.object({
		trialId: v.id("albumEnrichmentTrials"),
		judgeKind: judgeKindValidator,
		autoEval: v.optional(autoEvalValidator),
	}),
	handler: async (ctx, args) => {
		const album = await ctx.db.get(args.albumId);
		if (!album) {
			throw new Error("Album not found");
		}

		const judgeKind = judgeKindForSlice(args.slice);
		const autoEval = runAutoJudgeForSlice(args.slice, args.payload);

		const trialId = await ctx.db.insert("albumEnrichmentTrials", {
			trialRunId: args.trialRunId,
			albumId: args.albumId,
			spotifyAlbumId: album.spotifyAlbumId,
			slice: args.slice,
			variantId: args.variantId,
			promptPath: args.promptPath,
			...(args.model !== undefined ? { model: args.model } : {}),
			payload: args.payload,
			judgeKind,
			...(autoEval ? { autoEval } : {}),
			humanVerdict: "undecided",
			createdAt: Date.now(),
		});

		return { trialId, judgeKind, ...(autoEval ? { autoEval } : {}) };
	},
});

export const listTrialsForAlbum = query({
	args: { albumId: v.id("spotifyAlbums") },
	returns: v.array(albumEnrichmentTrialDocValidator),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("albumEnrichmentTrials")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.collect();
	},
});

export const setTrialVerdict = mutation({
	args: {
		trialId: v.id("albumEnrichmentTrials"),
		verdict: humanVerdictValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const trial = await ctx.db.get(args.trialId);
		if (!trial) {
			throw new Error("Trial not found");
		}
		await ctx.db.patch(args.trialId, { humanVerdict: args.verdict });
		return null;
	},
});

/**
 * Copies a winning trial's payload into the live enrichment for that slice
 * only, reusing `saveSlicesHandler` (the same write semantics as a live
 * single-slice `saveSlices` overwrite). Marks sibling `undecided` trials in
 * the same `trialRunId` + slice as `reject`.
 */
export const promoteTrial = mutation({
	args: { trialId: v.id("albumEnrichmentTrials") },
	returns: v.object({
		albumId: v.id("spotifyAlbums"),
		slice: enrichmentSliceKeyValidator,
		promotedAt: v.number(),
		savedSlices: v.array(enrichmentSliceKeyValidator),
	}),
	handler: async (ctx, args) => {
		const trial = await ctx.db.get(args.trialId);
		if (!trial) {
			throw new Error("Trial not found");
		}
		if (trial.promotedAt != null) {
			throw new Error("Trial already promoted");
		}

		const album = await ctx.db.get(trial.albumId);
		if (!album) {
			throw new Error("Album not found");
		}

		const existingEnrichment = await ctx.db
			.query("albumEnrichments")
			.withIndex("by_albumId", (q) => q.eq("albumId", trial.albumId))
			.first();

		const releaseYear = parseReleaseYear(album.releaseDate);
		const identityPacket = existingEnrichment?.identityPacket ?? {
			title: album.name,
			artists: splitArtistNames(album.artistName),
			...(releaseYear !== undefined ? { releaseYear } : {}),
			...(album.imageUrl ? { coverImageUrl: album.imageUrl } : {}),
		};

		const { savedSlices } = await saveSlicesHandler(ctx, {
			albumId: trial.albumId,
			identityPacket,
			mode: "overwrite",
			...buildSliceSaveArgs(trial.slice, trial.payload),
		});

		const now = Date.now();
		await ctx.db.patch(trial._id, { promotedAt: now, humanVerdict: "win" });

		const siblings = await ctx.db
			.query("albumEnrichmentTrials")
			.withIndex("by_trialRunId", (q) => q.eq("trialRunId", trial.trialRunId))
			.collect();
		for (const sibling of siblings) {
			if (
				sibling._id !== trial._id &&
				sibling.slice === trial.slice &&
				sibling.humanVerdict === "undecided"
			) {
				await ctx.db.patch(sibling._id, { humanVerdict: "reject" });
			}
		}

		return {
			albumId: trial.albumId,
			slice: trial.slice,
			promotedAt: now,
			savedSlices,
		};
	},
});

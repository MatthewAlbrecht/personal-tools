/**
 * Mirrors `src/lib/album-enrichment/judge-kinds.ts`. Convex cannot import
 * from `src/lib`, so this logic is duplicated here — keep both in sync.
 */

import type { EnrichmentSliceKey } from "./albumEnrichmentSlices";

export type JudgeKind = "auto" | "human" | "mixed";

const JUDGE_KIND_BY_SLICE: Record<EnrichmentSliceKey, JudgeKind> = {
	artistContext: "mixed",
	whyListen: "human",
	coverDescriptors: "auto",
	occasions: "human",
};

export function judgeKindForSlice(slice: EnrichmentSliceKey): JudgeKind {
	return JUDGE_KIND_BY_SLICE[slice];
}

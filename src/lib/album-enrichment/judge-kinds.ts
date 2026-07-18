import type { EnrichmentSliceKey } from "./types";

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

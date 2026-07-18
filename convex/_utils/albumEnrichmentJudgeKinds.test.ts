import assert from "node:assert/strict";
import test from "node:test";
import { judgeKindForSlice } from "./albumEnrichmentJudgeKinds";

test("judgeKindForSlice returns the locked judge kind per slice", () => {
	assert.equal(judgeKindForSlice("artistContext"), "mixed");
	assert.equal(judgeKindForSlice("whyListen"), "human");
	assert.equal(judgeKindForSlice("coverDescriptors"), "auto");
	assert.equal(judgeKindForSlice("occasions"), "human");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	REQUIRED_ENRICHMENT_SLICES,
	isEnrichmentComplete,
	missingEnrichmentSlices,
	normalizeEnrichmentTagKey,
	normalizeEnrichmentTags,
} from "./albumEnrichmentSlices";

test("REQUIRED_ENRICHMENT_SLICES has four keys", () => {
	assert.deepEqual(REQUIRED_ENRICHMENT_SLICES, [
		"artistContext",
		"whyListen",
		"coverDescriptors",
		"occasions",
	]);
});

test("missingEnrichmentSlices treats undefined as all missing", () => {
	assert.deepEqual(missingEnrichmentSlices(undefined), [
		"artistContext",
		"whyListen",
		"coverDescriptors",
		"occasions",
	]);
});

test("missingEnrichmentSlices returns only absent keys", () => {
	assert.deepEqual(
		missingEnrichmentSlices({
			artistContext: { updatedAt: 1 },
			whyListen: { updatedAt: 1 },
		}),
		["coverDescriptors", "occasions"],
	);
});

test("isEnrichmentComplete true only when all required present", () => {
	assert.equal(isEnrichmentComplete(undefined), false);
	assert.equal(
		isEnrichmentComplete({
			artistContext: { updatedAt: 1 },
			whyListen: { updatedAt: 1 },
			coverDescriptors: { updatedAt: 1 },
			occasions: { updatedAt: 1 },
		}),
		true,
	);
});

test("normalizeEnrichmentTagKey lowercases and kebab-cases", () => {
	assert.equal(normalizeEnrichmentTagKey("  Live Show "), "live-show");
	assert.equal(normalizeEnrichmentTagKey("Dinner Party"), "dinner-party");
});

test("normalizeEnrichmentTags dedupes by key and trims labels", () => {
	assert.deepEqual(
		normalizeEnrichmentTags([
			{ label: "Green" },
			{ label: " green " },
			{ label: "Live Show" },
		]),
		[
			{ key: "green", label: "Green" },
			{ key: "live-show", label: "Live Show" },
		],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	buildMissingSliceEntries,
	formatScanDisclosure,
	getSliceLabel,
} from "./presentation";

test("maps enrichment slice keys to operator-facing labels", () => {
	assert.equal(getSliceLabel("artistContext"), "Artist context");
	assert.equal(getSliceLabel("whyListen"), "Why listen");
	assert.equal(getSliceLabel("coverDescriptors"), "Cover descriptors");
	assert.equal(getSliceLabel("occasions"), "Occasions");
});

test("builds missing-slice entries in a stable order", () => {
	assert.deepEqual(
		buildMissingSliceEntries({
			artistContext: 7,
			whyListen: 3,
			coverDescriptors: 5,
			occasions: 2,
		}),
		[
			{ key: "artistContext", label: "Artist context", count: 7 },
			{ key: "whyListen", label: "Why listen", count: 3 },
			{ key: "coverDescriptors", label: "Cover descriptors", count: 5 },
			{ key: "occasions", label: "Occasions", count: 2 },
		],
	);
});

test("discloses bounded and complete queue scans", () => {
	assert.equal(
		formatScanDisclosure({ scanned: 1000, capped: true }),
		"Scanned 1,000 active records · capped result",
	);
	assert.equal(
		formatScanDisclosure({ scanned: 42, capped: false }),
		"Scanned all 42 active records",
	);
});

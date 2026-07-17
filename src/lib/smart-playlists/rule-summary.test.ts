import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleSummary } from "./rule-summary";

test("for later folk primary under 30m with exclusion count", () => {
	const s = formatRuleSummary({
		source: "forLater",
		filters: {
			genreClauses: [
				{ genreKey: "folk", mode: "include", role: "primary" },
			],
			genreMatch: "any",
			descriptorKeys: [],
			descriptorMatch: "any",
			ratingMin: 1,
			ratingMax: 15,
			durationOpenLow: true,
			durationOpenHigh: false,
			durationMaxMinutes: 30,
			excludedAlbumIds: ["k17abc"],
		},
		genreLabels: { folk: "Folk" },
	});
	assert.match(s, /For Later/);
	assert.match(s, /Folk \(primary\)/);
	assert.match(s, /under 30m|30m/);
	assert.match(s, /−1 excluded|1 excluded/);
});

test("exclude genre renders with bang", () => {
	const s = formatRuleSummary({
		source: "rankings",
		filters: {
			genreClauses: [
				{ genreKey: "jazz", mode: "exclude", role: "secondary" },
			],
			genreMatch: "any",
			descriptorKeys: [],
			descriptorMatch: "any",
			ratingMin: 13,
			ratingMax: 15,
			durationOpenLow: true,
			durationOpenHigh: true,
			excludedAlbumIds: [],
		},
		genreLabels: { jazz: "Jazz" },
	});
	assert.match(s, /!Jazz \(secondary\)/);
	assert.match(s, /13|Holy Moly|rating/);
});

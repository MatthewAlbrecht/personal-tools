import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleSummary } from "./rule-summary";

test("for later folk primary under 30m", () => {
	const s = formatRuleSummary({
		source: "forLater",
		filters: {
			genreKeys: ["folk"],
			genreMatch: "any",
			primaryGenresOnly: true,
			descriptorKeys: [],
			descriptorMatch: "any",
			durationMaxMinutes: 30,
		},
		genreLabels: { folk: "Folk" },
	});
	assert.match(s, /For Later/);
	assert.match(s, /Folk/);
	assert.match(s, /primary/i);
	assert.match(s, /30/);
});

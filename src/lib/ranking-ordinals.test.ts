import assert from "node:assert/strict";
import test from "node:test";
import {
	assignOrdinals,
	bandForOrdinal,
	compareManualRank,
	decadeLabel,
	frameManualBoard,
} from "./ranking-ordinals";

test("compareManualRank prefers higher rating then lower position", () => {
	const a = { rating: 15, position: 2 };
	const b = { rating: 15, position: 1 };
	const c = { rating: 14, position: 0 };
	assert.ok(compareManualRank(b, a) < 0);
	assert.ok(compareManualRank(a, c) < 0);
});

test("frameManualBoard splits 50 / 15 edge / rest", () => {
	const items = Array.from({ length: 80 }, (_, i) => ({
		_id: String(i),
		rating: 15 - Math.floor(i / 10),
		position: i,
		releaseYear: 2026,
	}));
	const ranked = assignOrdinals([...items].sort(compareManualRank));
	const framed = frameManualBoard(ranked, { fullYear: false });
	assert.equal(framed.top50.length, 50);
	assert.equal(framed.edge51to65.length, 15);
	assert.equal(framed.rest.length, 0);
	const full = frameManualBoard(ranked, { fullYear: true });
	assert.equal(full.rest.length, 15);
});

test("bandForOrdinal and decadeLabel", () => {
	assert.equal(bandForOrdinal(1), "hero");
	assert.equal(bandForOrdinal(3), "podium");
	assert.equal(bandForOrdinal(51), "edge");
	assert.equal(bandForOrdinal(66), "rest");
	assert.equal(bandForOrdinal(80), "rest");
	assert.equal(decadeLabel(1), "1–10");
	assert.equal(decadeLabel(65), "61–65");
	assert.equal(decadeLabel(66), "66–70");
	assert.equal(decadeLabel(71), "71–80");
	assert.equal(decadeLabel(80), "71–80");
});

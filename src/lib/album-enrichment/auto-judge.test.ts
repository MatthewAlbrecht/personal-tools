import assert from "node:assert/strict";
import test from "node:test";
import {
	autoJudgeArtistContext,
	autoJudgeCoverDescriptors,
} from "./auto-judge";

test("autoJudgeCoverDescriptors fails empty tags", () => {
	const result = autoJudgeCoverDescriptors({ tags: [] });
	assert.equal(result.passed, false);
	const check = result.checks.find((c) => c.id === "has-tags");
	assert.equal(check?.passed, false);
});

test("autoJudgeCoverDescriptors passes clean grounded tags", () => {
	const result = autoJudgeCoverDescriptors({
		tags: [{ label: "Desert" }, { label: "Neon" }, { label: "Silhouette" }],
	});
	assert.equal(result.passed, true);
	assert.ok(result.checks.every((c) => c.passed));
});

test("autoJudgeCoverDescriptors rejects generic filler tags", () => {
	const result = autoJudgeCoverDescriptors({
		tags: [{ label: "Album Cover" }, { label: "Blue" }],
	});
	assert.equal(result.passed, false);
	const check = result.checks.find((c) => c.id === "no-generic-noise");
	assert.equal(check?.passed, false);
});

test("autoJudgeCoverDescriptors rejects RYM-musical genre bleed words", () => {
	const result = autoJudgeCoverDescriptors({
		tags: [{ label: "Shoegaze" }, { label: "Purple" }],
	});
	assert.equal(result.passed, false);
	const check = result.checks.find((c) => c.id === "no-genre-bleed");
	assert.equal(check?.passed, false);
});

test("autoJudgeCoverDescriptors genre-bleed check is case-insensitive", () => {
	const result = autoJudgeCoverDescriptors({ tags: [{ label: "ROCK" }] });
	const check = result.checks.find((c) => c.id === "no-genre-bleed");
	assert.equal(check?.passed, false);
});

test("autoJudgeArtistContext passes complete plausible fields", () => {
	const result = autoJudgeArtistContext({
		origin: "Portland, Oregon",
		activeSince: "2015",
		instagramUrl: "https://www.instagram.com/some_band/",
	});
	assert.equal(result.passed, true);
	assert.ok(result.checks.every((c) => c.passed));
});

test("autoJudgeArtistContext fails missing origin", () => {
	const result = autoJudgeArtistContext({
		activeSince: "2015",
	});
	const check = result.checks.find((c) => c.id === "origin-present");
	assert.equal(check?.passed, false);
	assert.equal(result.passed, false);
});

test("autoJudgeArtistContext accepts a year-range activeSince", () => {
	const result = autoJudgeArtistContext({
		origin: "London, UK",
		activeSince: "2008-present",
	});
	const check = result.checks.find((c) => c.id === "active-since-shape");
	assert.equal(check?.passed, true);
});

test("autoJudgeArtistContext rejects an implausible activeSince year", () => {
	const result = autoJudgeArtistContext({
		origin: "London, UK",
		activeSince: "1850",
	});
	const check = result.checks.find((c) => c.id === "active-since-shape");
	assert.equal(check?.passed, false);
});

test("autoJudgeArtistContext rejects a non-year activeSince", () => {
	const result = autoJudgeArtistContext({
		origin: "London, UK",
		activeSince: "a long time ago",
	});
	const check = result.checks.find((c) => c.id === "active-since-shape");
	assert.equal(check?.passed, false);
});

test("autoJudgeArtistContext treats missing instagramUrl as a non-failing pass", () => {
	const result = autoJudgeArtistContext({
		origin: "London, UK",
		activeSince: "2008",
	});
	const check = result.checks.find((c) => c.id === "instagram-url-shape");
	assert.equal(check?.passed, true);
	assert.equal(result.passed, true);
});

test("autoJudgeArtistContext rejects a malformed instagramUrl", () => {
	const result = autoJudgeArtistContext({
		origin: "London, UK",
		activeSince: "2008",
		instagramUrl: "https://instagram.com",
	});
	const check = result.checks.find((c) => c.id === "instagram-url-shape");
	assert.equal(check?.passed, false);
	assert.equal(result.passed, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	parseIntroContent,
	resolveAlbumIntroContent,
} from "./zine-intro-content";

test("parseIntroContent returns empty array for blank content", () => {
	assert.deepEqual(parseIntroContent(""), []);
	assert.deepEqual(parseIntroContent("   \n\n  "), []);
});

test("parseIntroContent splits paragraphs on blank lines", () => {
	assert.deepEqual(parseIntroContent("First paragraph.\n\nSecond paragraph."), [
		[{ text: "First paragraph." }],
		[{ text: "Second paragraph." }],
	]);
});

test("parseIntroContent preserves single newlines as line breaks", () => {
	assert.deepEqual(parseIntroContent("Line one\nLine two"), [
		[{ text: "Line one" }, { text: "Line two", lineBreakBefore: true }],
	]);
});

test("parseIntroContent parses bold and italic spans", () => {
	assert.deepEqual(parseIntroContent("Hello *bold* and _italic_."), [
		[
			{ text: "Hello " },
			{ text: "bold", bold: true },
			{ text: " and " },
			{ text: "italic", italic: true },
			{ text: "." },
		],
	]);
});

test("parseIntroContent treats unmatched markers as plain text", () => {
	assert.deepEqual(parseIntroContent("*unclosed bold"), [
		[{ text: "*unclosed bold" }],
	]);
});

test("resolveAlbumIntroContent prefers intro page content over summary", () => {
	assert.equal(resolveAlbumIntroContent("Intro page", "Summary"), "Intro page");
});

test("resolveAlbumIntroContent falls back to summary override", () => {
	assert.equal(resolveAlbumIntroContent("", "Album summary"), "Album summary");
	assert.equal(
		resolveAlbumIntroContent(undefined, "Legacy summary"),
		"Legacy summary",
	);
});

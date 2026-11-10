import { describe, expect, it } from "vitest";
import { collapseRepeatedLyrics } from "./collapse-repeated-lyrics";

describe("collapseRepeatedLyrics", () => {
	it("marks a line repeated back to back with its count", () => {
		expect(
			collapseRepeatedLyrics(
				[
					"There is so much, there is so-so-so... so-so-much",
					"There is so much, there is so-so-so... so-so-much",
					"There is so much, there is so-so-so... so-so-much",
					"There is so much, there is so-so-so... so-so-much",
					"There is so much, there is so-so-so... so-much",
				].join("\n"),
			),
		).toBe(
			[
				"There is so much, there is so-so-so... so-so-much (4x)",
				"There is so much, there is so-so-so... so-much",
			].join("\n"),
		);
	});

	it("marks a repeated couplet on its last line", () => {
		expect(
			collapseRepeatedLyrics(
				[
					"Update yourself, update yourself, update yourself",
					"Update your brand",
					"Update yourself, update yourself, update yourself",
					"Update your brand",
					"Update yourself, update yourself",
				].join("\n"),
			),
		).toBe(
			[
				"Update yourself, update yourself, update yourself",
				"Update your brand (2x)",
				"Update yourself, update yourself",
			].join("\n"),
		);
	});

	it("leaves non-repeating lyrics and stanza breaks alone", () => {
		const lyrics =
			"Talk like a bum\nBe a failure\n\nBe a failure\nLiving by the press";
		expect(collapseRepeatedLyrics(lyrics)).toBe(lyrics);
	});

	it("never collapses across a blank line or a section label", () => {
		const lyrics = ["Hey", "", "Hey", "[Chorus]", "[Chorus]"].join("\n");
		expect(collapseRepeatedLyrics(lyrics)).toBe(lyrics);
	});

	it("keeps a line's parenthesised echo before the count", () => {
		expect(
			collapseRepeatedLyrics("Bark (Bark)\nBark (Bark)\nBark (Bark)"),
		).toBe("Bark (Bark) (3x)");
	});
});

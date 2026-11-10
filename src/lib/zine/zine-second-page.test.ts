import { describe, expect, it } from "vitest";
import { buildZinePages } from "./zine-pages";
import { findFirstOverflowLine, lyricsFromLine } from "./zine-second-page";
import type { ZineSongDisplayInput } from "./zine-types";

const clip = { left: 0, top: 0, right: 200, bottom: 100 };

function rect(left: number, top: number, right: number, bottom: number) {
	return { left, top, right, bottom };
}

describe("findFirstOverflowLine", () => {
	it("returns the first line drawn outside the page's lyrics area", () => {
		expect(
			findFirstOverflowLine(
				[
					{ line: 0, rects: [rect(0, 0, 90, 10)] },
					{ line: 1, rects: [rect(110, 80, 190, 95)] },
					// spilled into a third column, clipped off the right edge
					{ line: 3, rects: [rect(220, 0, 300, 10)] },
					{ line: 4, rects: [rect(220, 10, 300, 20)] },
				],
				clip,
				5,
			),
		).toBe(3);
	});

	it("moves a wrapped line whose second row is cut off", () => {
		expect(
			findFirstOverflowLine(
				[
					{ line: 0, rects: [rect(0, 0, 90, 10)] },
					{ line: 1, rects: [rect(110, 90, 190, 100), rect(210, 0, 260, 10)] },
				],
				clip,
				2,
			),
		).toBe(1);
	});

	it("returns the line count when everything fits", () => {
		expect(
			findFirstOverflowLine(
				[{ line: 0, rects: [rect(0, 0, 90, 10)] }],
				clip,
				4,
			),
		).toBe(4);
	});
});

describe("lyricsFromLine", () => {
	it("keeps the lyrics from the cut line on, without leading blank lines", () => {
		expect(lyricsFromLine("one\ntwo\n\nthree\nfour", 2)).toBe("three\nfour");
	});

	it("is empty when the cut is past the end", () => {
		expect(lyricsFromLine("one\ntwo", 2)).toBe("");
	});
});

function song(
	id: string,
	position: number,
	lyrics: string,
	continueOnSecondPage?: boolean,
): ZineSongDisplayInput {
	return {
		id,
		position,
		title: `Track ${position}`,
		artistName: "Hesse Kassel",
		lyrics,
		continueOnSecondPage,
	};
}

describe("buildZinePages with a second page", () => {
	const lyrics = "line 1\nline 2\n\nline 3\nline 4";

	it("keeps all lyrics on page one and puts the measured overflow on page two", () => {
		const pages = buildZinePages({
			playlistTitle: "Morir Saltando",
			songs: [song("t1", 1, lyrics, true), song("t2", 2, "Next song")],
			secondPageCutLines: { t1: 3 },
		});

		expect(pages.map((page) => page.kind).slice(0, 4)).toEqual([
			"cover",
			"song",
			"song-continued",
			"song",
		]);
		const [first, continued] = [pages[1], pages[2]];
		if (first?.kind !== "song" || continued?.kind !== "song-continued") {
			throw new Error("expected song then song-continued");
		}
		expect(first.continuesOnNextPage).toBe(true);
		expect(first.lyrics).toBe(lyrics);
		expect(continued.lyrics).toBe("line 3\nline 4");
		expect(pages.length % 4).toBe(0);
	});

	it("leaves page two empty until page one has been measured", () => {
		const pages = buildZinePages({
			playlistTitle: "Morir Saltando",
			songs: [song("t1", 1, lyrics, true)],
		});

		const continued = pages[2];
		expect(continued?.kind).toBe("song-continued");
		expect(continued?.kind === "song-continued" && continued.lyrics).toBe("");
	});

	it("keeps the track on one page when it is off", () => {
		const pages = buildZinePages({
			playlistTitle: "Morir Saltando",
			songs: [song("t1", 1, lyrics)],
			secondPageCutLines: { t1: 3 },
		});

		expect(pages.some((page) => page.kind === "song-continued")).toBe(false);
	});
});

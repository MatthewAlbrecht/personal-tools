import { describe, expect, it } from "vitest";
import { buildZinePages } from "./zine-pages";
import {
	getSecondPageFirstShare,
	splitLyricsForSecondPage,
} from "./zine-second-page";
import type { ZineSongDisplayInput } from "./zine-types";

function stanza(label: string, lineCount: number): string {
	return Array.from(
		{ length: lineCount },
		(_, i) => `${label} line ${i + 1}`,
	).join("\n");
}

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

describe("splitLyricsForSecondPage", () => {
	const fourStanzas = ["A", "B", "C", "D"].map((label) => stanza(label, 4));

	it("splits at the stanza break nearest the first page's share", () => {
		expect(splitLyricsForSecondPage(fourStanzas.join("\n\n"), 0.5)).toEqual({
			first: fourStanzas.slice(0, 2).join("\n\n"),
			second: fourStanzas.slice(2).join("\n\n"),
		});
		expect(
			splitLyricsForSecondPage(fourStanzas.join("\n\n"), 0.25)?.first,
		).toBe(fourStanzas[0]);
	});

	it("weighs long lines as the rows they wrap to", () => {
		const longLine = "x".repeat(200);
		const lyrics = [
			`${longLine}\n${longLine}`,
			stanza("B", 2),
			stanza("C", 2),
			stanza("D", 2),
		].join("\n\n");

		expect(splitLyricsForSecondPage(lyrics, 0.5)?.first).toBe(
			`${longLine}\n${longLine}`,
		);
	});

	it("never splits inside a stanza", () => {
		const split = splitLyricsForSecondPage(
			`${stanza("A", 3)}\n\n${stanza("B", 20)}`,
			0.5,
		);

		expect(split?.first).toBe(stanza("A", 3));
		expect(split?.second).toBe(stanza("B", 20));
	});

	it("returns null when there is only one stanza", () => {
		expect(splitLyricsForSecondPage(stanza("A", 40), 0.5)).toBeNull();
	});

	it("gives the first page less when it shows album art", () => {
		expect(getSecondPageFirstShare({ hasAlbumArt: true })).toBeLessThan(
			getSecondPageFirstShare({ hasAlbumArt: false }),
		);
	});
});

describe("buildZinePages with a second page", () => {
	const longLyrics = ["A", "B", "C", "D"].map((l) => stanza(l, 6)).join("\n\n");

	it("adds a continued page right after the track when it is turned on", () => {
		const pages = buildZinePages({
			playlistTitle: "Morir Saltando",
			songs: [song("t1", 1, longLyrics, true), song("t2", 2, "Next song")],
		});

		const kinds = pages.map((page) => page.kind);
		expect(kinds.slice(0, 4)).toEqual([
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
		expect(`${first.lyrics}\n\n${continued.lyrics}`).toBe(longLyrics);
		expect(continued.songId).toBe("t1");
		expect(pages.length % 4).toBe(0);
	});

	it("keeps the track on one page when it is off", () => {
		const pages = buildZinePages({
			playlistTitle: "Morir Saltando",
			songs: [song("t1", 1, longLyrics)],
		});

		expect(pages.some((page) => page.kind === "song-continued")).toBe(false);
		const first = pages[1];
		expect(first?.kind === "song" && first.lyrics).toBe(longLyrics);
	});
});

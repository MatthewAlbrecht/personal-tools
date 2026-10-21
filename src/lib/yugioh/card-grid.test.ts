import { describe, expect, test } from "vitest";
import {
	largeTcgplayerImage,
	parseGridColumns,
	priorityFilterFromParam,
	sectionsWithPriority,
	shownGridColumns,
	tileCopies,
	tilePrintings,
} from "./card-grid";

describe("parseGridColumns", () => {
	test("reads a saved 2, 3 or 4", () => {
		expect(parseGridColumns("2")).toBe(2);
		expect(parseGridColumns("4")).toBe(4);
	});

	test("falls back to 3 for nothing saved or anything else", () => {
		expect(parseGridColumns(null)).toBe(3);
		expect(parseGridColumns("5")).toBe(3);
		expect(parseGridColumns("wide")).toBe(3);
	});
});

describe("shownGridColumns", () => {
	test("a wide screen shows the choice", () => {
		expect(shownGridColumns(4, false)).toBe(4);
		expect(shownGridColumns(2, false)).toBe(2);
	});

	test("a phone shows at most 3 columns", () => {
		expect(shownGridColumns(4, true)).toBe(3);
		expect(shownGridColumns(3, true)).toBe(3);
		expect(shownGridColumns(2, true)).toBe(2);
	});
});

function candidate(printingId: string, imageUrl: string | null) {
	return {
		printingId,
		setCode: `RA01-EN00${printingId}`,
		rarity: "Secret Rare",
		tcgplayer: { imageUrl },
	};
}

const IMG = "https://tcgplayer-cdn.tcgplayer.com/product/1_in_400x400.jpg";
const IMG2 = "https://tcgplayer-cdn.tcgplayer.com/product/2_in_400x400.jpg";

describe("tilePrintings", () => {
	test("a Chosen Printing is named and pictured", () => {
		const card = {
			chosenPrintingId: "2",
			candidates: [candidate("1", IMG), candidate("2", IMG2)],
		};
		const { shown, pictured } = tilePrintings(card);
		expect(shown?.printingId).toBe("2");
		expect(pictured?.printingId).toBe("2");
	});

	test("undecided with several Candidates names none and pictures the first with an image", () => {
		const card = {
			chosenPrintingId: null,
			candidates: [candidate("1", null), candidate("2", IMG2)],
		};
		const { shown, pictured } = tilePrintings(card);
		expect(shown).toBeUndefined();
		expect(pictured?.printingId).toBe("2");
	});

	test("a lone Candidate is named even when not Chosen", () => {
		const card = { chosenPrintingId: null, candidates: [candidate("1", IMG)] };
		expect(tilePrintings(card).shown?.printingId).toBe("1");
	});

	test("a Chosen Printing without an image borrows a Candidate's", () => {
		const card = {
			chosenPrintingId: "1",
			candidates: [candidate("1", null), candidate("2", IMG2)],
		};
		expect(tilePrintings(card).pictured?.printingId).toBe("2");
	});

	test("with no image anywhere, the shown Printing is pictured as a placeholder", () => {
		const card = {
			chosenPrintingId: "2",
			candidates: [candidate("1", null), candidate("2", null)],
		};
		expect(tilePrintings(card).pictured?.printingId).toBe("2");
	});
});

describe("largeTcgplayerImage", () => {
	test("asks TCGplayer's CDN for its 1000px image", () => {
		expect(largeTcgplayerImage(IMG)).toBe(
			"https://tcgplayer-cdn.tcgplayer.com/product/1_in_1000x1000.jpg",
		);
	});

	test("leaves any other URL alone", () => {
		expect(largeTcgplayerImage("https://example.com/a.jpg")).toBe(
			"https://example.com/a.jpg",
		);
	});
});

describe("tileCopies", () => {
	test("a Card still missing Copies has one pip per Copy needed, filled for each owned", () => {
		expect(tileCopies({ copiesOwned: 1, copiesNeeded: 3 })).toEqual({
			finished: false,
			left: 2,
			pips: [true, false, false],
		});
	});

	test("owning every Copy finishes the Card", () => {
		expect(tileCopies({ copiesOwned: 2, copiesNeeded: 2 })).toEqual({
			finished: true,
			left: 0,
			pips: [true, true],
		});
	});

	test("extra Copies owned don't add pips or go below 0 left", () => {
		expect(tileCopies({ copiesOwned: 3, copiesNeeded: 1 })).toEqual({
			finished: true,
			left: 0,
			pips: [true],
		});
	});
});

describe("the priority filter", () => {
	test("reads high, medium or low from the URL; anything else is All", () => {
		expect(priorityFilterFromParam("high")).toBe("high");
		expect(priorityFilterFromParam("low")).toBe("low");
		expect(priorityFilterFromParam(null)).toBeUndefined();
		expect(priorityFilterFromParam("urgent")).toBeUndefined();
	});

	test("keeps each Section's Cards of that priority, dropping empty Sections", () => {
		const sections = [
			{
				section: "main",
				cards: [
					{ _id: "ash", priority: "high" as const },
					{ _id: "droll", priority: "medium" as const },
				],
			},
			{ section: "side", cards: [{ _id: "nibiru", priority: "low" as const }] },
		];
		expect(sectionsWithPriority(sections, "high")).toEqual([
			{ section: "main", cards: [{ _id: "ash", priority: "high" }] },
		]);
		expect(sectionsWithPriority(sections, "low")).toEqual([
			{ section: "side", cards: [{ _id: "nibiru", priority: "low" }] },
		]);
		expect(sectionsWithPriority(sections, undefined)).toBe(sections);
	});
});

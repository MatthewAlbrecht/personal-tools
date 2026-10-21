import { describe, expect, test } from "vitest";
import {
	conditionChoice,
	isConditionSetByYou,
	listingCondition,
	rarityChoices,
} from "./listing-edits";
import type { TitleRead } from "./title-reading";

const read: TitleRead = {
	setCode: "PTDN-EN084",
	rarity: "Ultimate Rare",
	condition: "lightlyPlayed",
	copies: 1,
	language: "english",
	graded: false,
	gradingCompany: null,
	grade: null,
};

describe("listingCondition", () => {
	test("is the title's read without a condition set by me", () => {
		expect(listingCondition({ titleRead: read })).toBe("lightlyPlayed");
		expect(listingCondition({ titleRead: read, conditionOverride: null })).toBe(
			"lightlyPlayed",
		);
		expect(listingCondition({ titleRead: null })).toBeNull();
		expect(listingCondition({})).toBeNull();
	});

	test("a condition I set wins over the read, even with no read", () => {
		expect(
			listingCondition({ titleRead: read, conditionOverride: "damaged" }),
		).toBe("damaged");
		expect(
			listingCondition({ titleRead: null, conditionOverride: "nearMint" }),
		).toBe("nearMint");
	});

	test("'not stated' set by me clears the read's condition", () => {
		expect(
			listingCondition({ titleRead: read, conditionOverride: "notStated" }),
		).toBeNull();
	});

	test("knows when I set it", () => {
		expect(isConditionSetByYou({ titleRead: read })).toBe(false);
		expect(isConditionSetByYou({ conditionOverride: null })).toBe(false);
		expect(isConditionSetByYou({ conditionOverride: "notStated" })).toBe(true);
	});

	test("the picker's choice is the shown condition, or not stated", () => {
		expect(conditionChoice({ titleRead: read })).toBe("lightlyPlayed");
		expect(conditionChoice({ titleRead: null })).toBe("notStated");
		expect(
			conditionChoice({ titleRead: read, conditionOverride: "notStated" }),
		).toBe("notStated");
	});
});

describe("rarityChoices", () => {
	const ultimate = {
		_id: "p1",
		setCode: "PTDN-EN084",
		rarity: "Ultimate Rare",
		overloadedRarities: ["Common"],
	};
	const secret = {
		_id: "p2",
		setCode: "PTDN-EN084",
		rarity: "Secret Rare",
		overloadedRarities: ["Common", "Quarter Century Secret Rare"],
	};

	test("one per rarity, most prized first: the Printings, then Overloaded rarities with no Printing", () => {
		expect(
			rarityChoices([secret, ultimate], ultimate, new Set(["p1"])),
		).toEqual([
			{ rarity: "Ultimate Rare", printingId: "p1", needed: true },
			{ rarity: "Secret Rare", printingId: "p2", needed: false },
			{
				rarity: "Quarter Century Secret Rare",
				printingId: null,
				needed: false,
			},
			{ rarity: "Common", printingId: null, needed: false },
		]);
	});

	test("an Overloaded rarity that has a Printing is that Printing", () => {
		const common = {
			_id: "p3",
			setCode: "PTDN-EN084",
			rarity: "Common",
			overloadedRarities: [],
		};
		expect(
			rarityChoices([ultimate, common], ultimate, new Set(["p1", "p3"])),
		).toEqual([
			{ rarity: "Ultimate Rare", printingId: "p1", needed: true },
			{ rarity: "Common", printingId: "p3", needed: true },
		]);
	});

	test("the matched Printing wins a rarity saved under another region's code", () => {
		const korean = { ...ultimate, _id: "k1", setCode: "PTDN-KR084" };
		expect(rarityChoices([korean, ultimate], ultimate, new Set())).toEqual([
			{ rarity: "Ultimate Rare", printingId: "p1", needed: false },
			{ rarity: "Common", printingId: null, needed: false },
		]);
	});

	test("the matched Printing is always a choice", () => {
		expect(rarityChoices([], ultimate, new Set())).toEqual([
			{ rarity: "Ultimate Rare", printingId: "p1", needed: false },
			{ rarity: "Common", printingId: null, needed: false },
		]);
	});
});

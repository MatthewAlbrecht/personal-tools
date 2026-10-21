import { describe, expect, test } from "vitest";
import {
	type TitleJudgments,
	findSetCodes,
	languageOfSetCode,
	matchListing,
	readTitle,
	setCodeKey,
	setCodeVariants,
} from "./title-reading";

describe("findSetCodes", () => {
	test("finds a set code in a title, uppercased", () => {
		expect(
			findSetCodes("Ash Blossom & Joyous Spring ra01-en008 Quarter Century NM"),
		).toEqual(["RA01-EN008"]);
	});

	test("finds old codes without a region and single-letter regions", () => {
		expect(findSetCodes("Dark Magician LOB-005 Ultra")).toEqual(["LOB-005"]);
		expect(findSetCodes("Blue-Eyes SDK-E001 1st")).toEqual(["SDK-E001"]);
	});

	test("finds every distinct code, in title order", () => {
		expect(
			findSetCodes("Lot RA01-EN008 + RA01-EN009 and RA01-EN008 again"),
		).toEqual(["RA01-EN008", "RA01-EN009"]);
	});

	test("finds codes with a digit-first prefix or a letter in the card number", () => {
		expect(findSetCodes("Speed Duel SGX1-ENA01 and SS01-ENB01")).toEqual([
			"SGX1-ENA01",
			"SS01-ENB01",
		]);
		expect(findSetCodes("Stardust 5DS1-EN001 Ultra")).toEqual(["5DS1-EN001"]);
		expect(setCodeKey("SGX1-ENA01")).toBe("SGX1-A01");
		expect(languageOfSetCode("SGX1-ENA01")).toBe("english");
	});

	test("ignores grades and words that only look like codes", () => {
		expect(findSetCodes("Ash Blossom PSA-10 Blue-Eyes 1st Edition")).toEqual(
			[],
		);
	});
});

describe("language from the set code", () => {
	test("reads the region in the code", () => {
		expect(languageOfSetCode("RA01-EN008")).toBe("english");
		expect(languageOfSetCode("RA01-KR008")).toBe("korean");
		expect(languageOfSetCode("RC04-JP001")).toBe("japanese");
		expect(languageOfSetCode("RA01-DE008")).toBe("german");
		expect(languageOfSetCode("LOB-G001")).toBe("german");
		expect(languageOfSetCode("LOB-005")).toBe("english");
	});

	test("an unknown region says nothing", () => {
		expect(languageOfSetCode("RA01-XX008")).toBeNull();
		expect(languageOfSetCode("not a code")).toBeNull();
	});

	test("codes for the same card in any language share a key", () => {
		expect(setCodeKey("RA01-KR008")).toBe("RA01-008");
		expect(setCodeKey("ra01-en008")).toBe("RA01-008");
		expect(setCodeKey("nonsense")).toBeNull();
		expect(setCodeVariants("RA01-KR008")).toContain("RA01-EN008");
		expect(setCodeVariants("RA01-KR008")).toContain("RA01-KR008");
	});
});

const judgments: TitleJudgments = {
	setCode: null,
	rarity: "Quarter Century Secret Rare",
	condition: "nearMint",
	copies: 1,
	language: "english",
	graded: false,
	gradingCompany: null,
};

describe("readTitle", () => {
	test("takes a lone set code from the title, not the AI", () => {
		const read = readTitle("Ash Blossom RA01-EN008 QCSR NM", {
			...judgments,
			setCode: "RA01-EN009",
		});
		expect(read).toEqual({
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			condition: "nearMint",
			copies: 1,
			language: "english",
			graded: false,
			gradingCompany: null,
			grade: null,
		});
	});

	test("lets the AI pick between several codes, but only one in the title", () => {
		const title = "Ash Blossom RA01-EN008 not RA01-EN009";
		expect(
			readTitle(title, { ...judgments, setCode: "RA01-EN009" }).setCode,
		).toBe("RA01-EN009");
		expect(
			readTitle(title, { ...judgments, setCode: "MP23-EN001" }).setCode,
		).toBeNull();
	});

	test("a language suffix in the code beats the AI's language", () => {
		expect(readTitle("Ash Blossom RA01-KR008 QCSR", judgments).language).toBe(
			"korean",
		);
		expect(
			readTitle("Ash Blossom Korean QCSR", { ...judgments, language: "korean" })
				.language,
		).toBe("korean");
	});

	test("reads company and grade of a Graded Listing from the title", () => {
		const read = readTitle("PSA 10 GEM MINT Ash Blossom RA01-EN008 QCSR", {
			...judgments,
			graded: true,
			gradingCompany: "PSA",
		});
		expect(read).toMatchObject({
			graded: true,
			gradingCompany: "PSA",
			grade: "10",
		});
		const beckett = readTitle("BGS 9.5 Ash Blossom RA01-EN008", {
			...judgments,
			graded: true,
			gradingCompany: null,
		});
		expect(beckett).toMatchObject({ gradingCompany: "BGS", grade: "9.5" });
	});

	test("a grade in a title that isn't graded is ignored", () => {
		const read = readTitle("Ash Blossom RA01-EN008 PSA 10 ready", judgments);
		expect(read).toMatchObject({
			graded: false,
			gradingCompany: null,
			grade: null,
		});
	});
});

const qcsr = {
	_id: "qcsr",
	setCode: "RA01-EN008",
	rarity: "Quarter Century Secret Rare",
	overloadedRarities: ["Super Rare"],
};
const plain = {
	_id: "plain",
	setCode: "MP23-EN001",
	rarity: "Starlight Rare",
	overloadedRarities: [],
};

describe("matchListing", () => {
	test("same set code and rarity is a match", () => {
		expect(
			matchListing(
				{ setCode: "RA01-EN008", rarity: "Quarter Century Secret Rare" },
				[qcsr],
			),
		).toEqual({ status: "match", printingId: "qcsr" });
	});

	test("the same card in another language still matches its Printing", () => {
		expect(
			matchListing(
				{ setCode: "RA01-KR008", rarity: "Quarter Century Secret Rare" },
				[qcsr],
			),
		).toEqual({ status: "match", printingId: "qcsr" });
	});

	test("another rarity under the set code is not a match", () => {
		expect(
			matchListing({ setCode: "RA01-EN008", rarity: "Super Rare" }, [qcsr]),
		).toEqual({ status: "notMatch", printingId: null });
	});

	test("a rarity none of the set code's known rarities is unsure", () => {
		expect(
			matchListing({ setCode: "RA01-EN008", rarity: "Ultra Rare" }, [qcsr]),
		).toEqual({ status: "unsure", printingId: null });
		expect(
			matchListing({ setCode: "MP23-EN001", rarity: "Secret Rare" }, [plain]),
		).toEqual({ status: "unsure", printingId: null });
	});

	test("a set code none of my Printings has is not a match", () => {
		expect(
			matchListing({ setCode: "RA01-EN009", rarity: "Super Rare" }, [qcsr]),
		).toEqual({ status: "notMatch", printingId: null });
	});

	test("no set code in the title is unsure", () => {
		expect(
			matchListing({ setCode: null, rarity: "Quarter Century Secret Rare" }, [
				qcsr,
			]),
		).toEqual({ status: "unsure", printingId: null });
	});

	test("an unstated rarity matches only a code with one rarity", () => {
		expect(
			matchListing({ setCode: "MP23-EN001", rarity: null }, [plain]),
		).toEqual({ status: "match", printingId: "plain" });
		expect(
			matchListing({ setCode: "RA01-EN008", rarity: null }, [qcsr]),
		).toEqual({ status: "unsure", printingId: null });
	});

	test("only Printings with the same card number count", () => {
		expect(
			matchListing({ setCode: "MP23-EN001", rarity: "Starlight Rare" }, [
				qcsr,
				plain,
			]),
		).toEqual({ status: "match", printingId: "plain" });
	});
});

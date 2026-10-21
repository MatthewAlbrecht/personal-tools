import { describe, expect, test } from "vitest";
import {
	type TitleJudgments,
	conditionStatedIn,
	findSetCodes,
	languageOfSetCode,
	languageStatedIn,
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

describe("a language the title states", () => {
	test("'Japanese' in the title beats an EN set code (sellers reuse the English code for Japanese cards)", () => {
		const title =
			"Bottomless Trap Hole CP04-EN003 Champion Pack 4 Unlimited Japanese";
		expect(readTitle(title, judgments).language).toBe("japanese");
		expect(
			readTitle(title, { ...judgments, language: "japanese" }).language,
		).toBe("japanese");
	});
});

describe("languageStatedIn", () => {
	test("reads a language named as a word or a standalone code", () => {
		expect(languageStatedIn("Ash Blossom RA01-EN008 Japanese QCSR")).toBe(
			"japanese",
		);
		expect(languageStatedIn("Ash Blossom JP RA01-EN008")).toBe("japanese");
		expect(languageStatedIn("Ash Blossom [JPN] QCSR")).toBe("japanese");
		expect(languageStatedIn("Ash Blossom RA01-EN008 korean")).toBe("korean");
		expect(languageStatedIn("Ash Blossom KR ver.")).toBe("korean");
		expect(languageStatedIn("Ash Blossom Simplified Chinese")).toBe("chinese");
		expect(languageStatedIn("Ash Blossom RA01-DE008 German")).toBe("german");
		expect(languageStatedIn("Ash Blossom RA01-EN008 English NM")).toBe(
			"english",
		);
	});

	test("Asian English is English", () => {
		expect(languageStatedIn("Ash Blossom RC04-AE001 Asian English")).toBe(
			"english",
		);
	});

	test("says nothing when the title names no language, or several", () => {
		expect(languageStatedIn("Ash Blossom RA01-EN008 QCSR")).toBeNull();
		expect(languageStatedIn("Ash Blossom Japanese / English lot")).toBeNull();
	});

	test("a country, a set code's region or a word that only contains a code says nothing", () => {
		expect(languageStatedIn("Ash Blossom RA01-EN008 Ships from Japan")).toBe(
			null,
		);
		expect(languageStatedIn("Ash Blossom RC04-JP001 Korea seller")).toBeNull();
		expect(languageStatedIn("Dark Magician JUMP promo KRAKEN")).toBeNull();
		expect(languageStatedIn("Ash Blossom KO in one turn")).toBeNull();
	});
});

describe("readTitle's language", () => {
	test("a language the title states beats the set code and the AI", () => {
		expect(
			readTitle("Ash Blossom RA01-EN008 Korean QCSR", judgments).language,
		).toBe("korean");
		expect(
			readTitle("Ash Blossom RA01-JP008 English", {
				...judgments,
				language: "japanese",
			}).language,
		).toBe("english");
	});

	test("an English Listing shipped from Japan stays English", () => {
		expect(
			readTitle("Ash Blossom RA01-EN008 QCSR Ships from Japan", {
				...judgments,
				language: "japanese",
			}).language,
		).toBe("english");
	});

	test("with no set code and no stated language, the AI decides", () => {
		expect(
			readTitle("Ash Blossom QCSR", { ...judgments, language: "chinese" })
				.language,
		).toBe("chinese");
	});
});

describe("a condition the title abbreviates", () => {
	test("'mp-' in the title reads as Moderately Played when the AI found none (eBay 366727903620)", () => {
		const title =
			"Chimeratech Fortress Dragon JUMP-EN031 Jump Magazine Promos Limited Edition mp-";
		expect(readTitle(title, { ...judgments, condition: null }).condition).toBe(
			"moderatelyPlayed",
		);
	});
});

describe("conditionStatedIn", () => {
	test.each([
		["Ash Blossom RA01-EN008 QCSR NM", "nearMint"],
		["Ash Blossom RA01-EN008 QCSR nm+", "nearMint"],
		["Ash Blossom RA01-EN008 NM-MT", "nearMint"],
		["Ash Blossom RA01-EN008 NM/M", "nearMint"],
		["Ash Blossom RA01-EN008 NMMT", "nearMint"],
		["Ash Blossom RA01-EN008 Near Mint", "nearMint"],
		["Ash Blossom RA01-EN008 Near-Mint 1st", "nearMint"],
		["Ash Blossom RA01-EN008 (LP)", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 VLP", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 SP", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 Slightly Played", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 EXC", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 Excellent", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 Lightly Played", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 Light Play", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 mp-", "moderatelyPlayed"],
		["Ash Blossom RA01-EN008 MP+", "moderatelyPlayed"],
		["Ash Blossom RA01-EN008 Moderately Played", "moderatelyPlayed"],
		["Ash Blossom RA01-EN008 HP", "heavilyPlayed"],
		["Ash Blossom RA01-EN008 Heavily Played", "heavilyPlayed"],
		["Ash Blossom RA01-EN008 DMG", "damaged"],
		["Ash Blossom RA01-EN008 Damaged", "damaged"],
	] as const)("%s reads as %s", (title, condition) => {
		expect(conditionStatedIn(title)).toBe(condition);
	});

	test.each([
		["Ash Blossom RA01-EN008 NM-LP", "lightlyPlayed"],
		["Ash Blossom RA01-EN008 LP/MP", "moderatelyPlayed"],
		["Ash Blossom RA01-EN008 Near Mint to HP", "heavilyPlayed"],
	] as const)("a range %s reads as its worse end, %s", (title, condition) => {
		expect(conditionStatedIn(title)).toBe(condition);
	});

	test.each([
		["no condition at all", "Ash Blossom RA01-EN008 QCSR"],
		["MP inside a set code", "Ash Blossom MP23-EN001 Prismatic Secret"],
		["a lowercase set code", "Ash Blossom mp23-en001 Prismatic Secret"],
		["a set prefix written alone", "Ash Blossom MP23 Prismatic Secret"],
		["LP inside a word", "Ash Blossom HELP ALPHA Lp1"],
		["Speed Duel", "Speed Duel SGX1-ENA01 Blue-Eyes"],
		["a bare M", "Ash Blossom RA01-EN008 M"],
		["Mint alone", "Ash Blossom RA01-EN008 Mint"],
		["a card named for damage", "Damage Eater RA01-EN008"],
		["bare EX (EX Deck, product names)", "Starter Deck EX Ash Blossom"],
	])("ignores %s", (_, title) => {
		expect(conditionStatedIn(title)).toBeNull();
	});
});

describe("readTitle's condition", () => {
	test("a condition the title states beats the AI's", () => {
		expect(
			readTitle("Ash Blossom RA01-EN008 HP", {
				...judgments,
				condition: "nearMint",
			}).condition,
		).toBe("heavilyPlayed");
	});

	test("the AI's condition stands when the title abbreviates none", () => {
		expect(
			readTitle("Ash Blossom RA01-EN008 lightly used", {
				...judgments,
				condition: "lightlyPlayed",
			}).condition,
		).toBe("lightlyPlayed");
	});

	test("a Graded Listing's condition is left to the AI", () => {
		expect(
			readTitle("PSA 10 GEM MINT Ash Blossom RA01-EN008 NM", {
				...judgments,
				condition: null,
				graded: true,
				gradingCompany: "PSA",
			}).condition,
		).toBeNull();
	});
});

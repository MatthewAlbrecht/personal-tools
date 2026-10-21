// The AI step of title reading: TypeSafe judges what an eBay Listing title
// says. This is the only module that calls the AI for titles; tests replace
// it with fixed judgments. Code checks and completes the result
// (`readTitle` in src/lib/yugioh/title-reading.ts).
import { choice, noul } from "@typesafe-ai/sdk";
import { RARITIES } from "../../../src/lib/yugioh/deck";
import {
	GRADING_COMPANIES,
	LANGUAGES,
	LANGUAGE_LABELS,
	MAX_COPIES_READ,
	READ_CONDITIONS,
	type ReadCondition,
	type TitleJudgments,
} from "../../../src/lib/yugioh/title-reading";
import { typesafeClient } from "./typesafe";

/** Below this, a rarity pick is treated as "the title doesn't say". */
const MIN_RARITY_PROBABILITY = 0.5;

const NOT_STATED = "not_stated";

const CONDITION_CRITERIA: Record<ReadCondition, string> = {
	nearMint:
		"Near Mint: NM, Mint, M, NM/M, NM-M, Gem Mint, pack fresh, fresh pull, never played",
	lightlyPlayed: "Lightly Played: LP, EX, Excellent, light play, slight wear",
	moderatelyPlayed: "Moderately Played: MP, VG, Very Good, Played, PL",
	heavilyPlayed: "Heavily Played: HP, Poor, heavy wear, creased",
	damaged: "Damaged: DMG, damaged, bent, water damage, torn",
};

/**
 * Asks TypeSafe what a title says. `setCodes` are the set codes code found in
 * the title (the AI only picks among them, and only when there are several);
 * `rarities` are every rarity it may answer, so a rarity missing from the list
 * can't be read.
 */
export async function judgeTitle(
	title: string,
	options: { setCodes: readonly string[]; rarities: readonly string[] },
): Promise<TitleJudgments> {
	const rarityCriteria: Record<string, string> = {};
	options.rarities.forEach((rarity, index) => {
		const abbreviation = RARITIES.find(
			(known) => known.name === rarity,
		)?.abbreviation;
		rarityCriteria[`rarity_${index}`] = abbreviation
			? `${rarity} (${abbreviation})`
			: rarity;
	});
	rarityCriteria[NOT_STATED] =
		"The title doesn't say which rarity this Copy is.";

	const setCodeCriteria: Record<string, string> = {};
	options.setCodes.forEach((code, index) => {
		setCodeCriteria[`code_${index}`] = code;
	});
	setCodeCriteria[NOT_STATED] = "None of these is the card being sold.";

	const copiesCriteria: Record<string, string> = {};
	for (let copies = 1; copies <= MAX_COPIES_READ; copies++) {
		copiesCriteria[`copies_${copies}`] =
			copies === 1
				? "1 card: a single, or the title doesn't give a count"
				: copies === 3
					? "3 cards, e.g. 3x, x3, a playset"
					: `${copies} cards`;
	}

	const languageCriteria: Record<string, string> = {};
	for (const language of LANGUAGES) {
		languageCriteria[language] =
			language === "english"
				? "English, or the title names no language"
				: LANGUAGE_LABELS[language];
	}

	const companyCriteria: Record<string, string> = {};
	for (const company of GRADING_COMPANIES) {
		companyCriteria[company] = company === "BGS" ? "BGS (Beckett)" : company;
	}
	companyCriteria.other = "Another grading company, or none named";

	const { answers } = await typesafeClient().systemOne({
		state: { listingTitle: title },
		questions: {
			// Only worth asking when the title has several set codes.
			...(options.setCodes.length > 1
				? {
						setCode: choice(
							"`listingTitle` is an eBay Listing for Yu-Gi-Oh! cards. Which of these set codes belongs to the card the Listing sells?",
							setCodeCriteria,
						),
					}
				: {}),
			rarity: choice(
				"Which rarity is the Yu-Gi-Oh! card sold in `listingTitle`? Sellers abbreviate rarities (QCSR, StR) or shorten them ('Quarter Century', '25th Secret', 'Starlight').",
				rarityCriteria,
			),
			condition: choice(
				"Which condition does `listingTitle` state for the card? Abbreviations like NM and LP count.",
				{
					...CONDITION_CRITERIA,
					[NOT_STATED]: "The title doesn't state a condition.",
				},
			),
			copies: choice(
				"How many physical copies of the card does the Listing in `listingTitle` sell?",
				copiesCriteria,
			),
			language: choice(
				"Which language is the card sold in `listingTitle` printed in?",
				languageCriteria,
			),
			graded: noul(
				"Is the card in `listingTitle` already graded and sealed in a case by a grading company (e.g. PSA 10, BGS 9.5)? 'PSA ready', 'grade worthy' or 'gradable' don't count.",
			),
			gradingCompany: choice(
				"Which grading company graded the card in `listingTitle`?",
				companyCriteria,
			),
		},
	});

	const codePick = (answers as { setCode?: { choice: string } }).setCode
		?.choice;
	const setCode =
		codePick === undefined || codePick === NOT_STATED
			? null
			: (options.setCodes[Number(codePick.slice("code_".length))] ?? null);

	const rarityPick = answers.rarity.choice;
	const rarity =
		rarityPick === NOT_STATED ||
		(answers.rarity.probabilities[rarityPick] ?? 0) < MIN_RARITY_PROBABILITY
			? null
			: (options.rarities[Number(rarityPick.slice("rarity_".length))] ?? null);

	const conditionPick = answers.condition.choice;
	const condition =
		READ_CONDITIONS.find((known) => known === conditionPick) ?? null;

	const graded = answers.graded.noul >= 0.5;
	const companyPick = answers.gradingCompany.choice;

	return {
		setCode,
		rarity,
		condition,
		copies: Number(answers.copies.choice.slice("copies_".length)) || 1,
		language:
			LANGUAGES.find((known) => known === answers.language.choice) ?? "english",
		graded,
		gradingCompany: graded && companyPick !== "other" ? companyPick : null,
	};
}

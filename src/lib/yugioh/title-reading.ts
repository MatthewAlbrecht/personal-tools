// Reading eBay Listing titles and matching them to Printings. The AI supplies
// judgments (rarity, condition, Copies, …); everything a title states exactly
// (set codes, the language suffix, a slab's grade) is read here, in code.
// Relative imports only: Convex imports this module.

import { normalizeRarity } from "./deck";

export const LANGUAGES = [
	"english",
	"japanese",
	"korean",
	"chinese",
	"german",
	"french",
	"italian",
	"spanish",
	"portuguese",
] as const;
export type Language = (typeof LANGUAGES)[number];

/** Short codes for Language flags ("KR", "DE"). */
export const LANGUAGE_CODES: Record<Language, string> = {
	english: "EN",
	japanese: "JP",
	korean: "KR",
	chinese: "CN",
	german: "DE",
	french: "FR",
	italian: "IT",
	spanish: "SP",
	portuguese: "PT",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
	english: "English",
	japanese: "Japanese",
	korean: "Korean",
	chinese: "Chinese",
	german: "German",
	french: "French",
	italian: "Italian",
	spanish: "Spanish",
	portuguese: "Portuguese",
};

/** A Listing's condition as its title states it, best to worst. */
export const READ_CONDITIONS = [
	"nearMint",
	"lightlyPlayed",
	"moderatelyPlayed",
	"heavilyPlayed",
	"damaged",
] as const;
export type ReadCondition = (typeof READ_CONDITIONS)[number];

export const READ_CONDITION_LABELS: Record<ReadCondition, string> = {
	nearMint: "Near Mint",
	lightlyPlayed: "Lightly Played",
	moderatelyPlayed: "Moderately Played",
	heavilyPlayed: "Heavily Played",
	damaged: "Damaged",
};

export const GRADING_COMPANIES = [
	"PSA",
	"BGS",
	"CGC",
	"SGC",
	"ARS",
	"TAG",
] as const;

/** Most Copies a title is read as selling. */
export const MAX_COPIES_READ = 10;

/** Set-code regions and the language each prints in. */
const REGION_LANGUAGES: Record<string, Language> = {
	"": "english",
	EN: "english",
	E: "english",
	AE: "english",
	JP: "japanese",
	JA: "japanese",
	KR: "korean",
	K: "korean",
	SC: "chinese",
	TC: "chinese",
	CN: "chinese",
	DE: "german",
	G: "german",
	FR: "french",
	F: "french",
	IT: "italian",
	I: "italian",
	SP: "spanish",
	S: "spanish",
	PT: "portuguese",
	P: "portuguese",
};

// Set prefix (2-5 letters and digits, at least one letter), a hyphen, an
// optional region and a card number (three digits, or a letter and two):
// RA01-EN008, LOB-005, SDK-E001, RC04-JP001, 5DS1-EN001, SGX1-ENA01.
const SET_CODE_PATTERN =
	/(?<![A-Z0-9])((?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,5})-([A-Z]{0,2})(\d{3}|[A-Z]\d{2})(?![A-Z0-9])/gi;

type ParsedSetCode = { prefix: string; region: string; number: string };

function parseSetCode(setCode: string): ParsedSetCode | null {
	const match = new RegExp(SET_CODE_PATTERN.source, "i").exec(
		setCode.trim().toUpperCase(),
	);
	if (!match || match[0].length !== setCode.trim().length) return null;
	const [, prefix = "", region = "", number = ""] = match;
	return { prefix, region, number };
}

/** Every distinct set code in a title, uppercased, in title order. */
export function findSetCodes(title: string): string[] {
	const codes: string[] = [];
	for (const match of title.matchAll(SET_CODE_PATTERN)) {
		const code = match[0].toUpperCase();
		if (!codes.includes(code)) codes.push(code);
	}
	return codes;
}

/** The language a set code's region prints in, or null when it doesn't say. */
export function languageOfSetCode(setCode: string): Language | null {
	const parsed = parseSetCode(setCode);
	if (!parsed) return null;
	return REGION_LANGUAGES[parsed.region] ?? null;
}

/**
 * The card a set code names, in any language: "RA01-KR008" → "RA01-008".
 * Null for anything that isn't a set code.
 */
export function setCodeKey(setCode: string): string | null {
	const parsed = parseSetCode(setCode);
	return parsed ? `${parsed.prefix}-${parsed.number}` : null;
}

/** The same card's set code under every known region. */
export function setCodeVariants(setCode: string): string[] {
	const parsed = parseSetCode(setCode);
	if (!parsed) return [];
	return Object.keys(REGION_LANGUAGES).map(
		(region) => `${parsed.prefix}-${region}${parsed.number}`,
	);
}

/** What the AI judged from a title. Code fills in and checks the rest. */
export type TitleJudgments = {
	/** Which of the title's set codes is the card sold, when it has several. */
	setCode: string | null;
	/** A rarity name, or null when the title doesn't say. */
	rarity: string | null;
	/** Null when the title doesn't say. */
	condition: ReadCondition | null;
	copies: number;
	language: Language;
	graded: boolean;
	gradingCompany: string | null;
};

/** Everything read from a Listing's title. */
export type TitleRead = {
	setCode: string | null;
	rarity: string | null;
	condition: ReadCondition | null;
	copies: number;
	language: Language;
	graded: boolean;
	gradingCompany: string | null;
	grade: string | null;
};

const GRADE_PATTERN =
	/\b(PSA|BGS|Beckett|CGC|SGC|ARS|TAG)\s*(?:gem\s*(?:mt|mint)\s*|mint\s*|pristine\s*)?(10|[1-9](?:\.5)?)(?![\d.])/i;

function findGrade(title: string): { company: string; grade: string } | null {
	const match = GRADE_PATTERN.exec(title);
	if (!match) return null;
	const company = (match[1] ?? "").toUpperCase();
	return {
		company: company === "BECKETT" ? "BGS" : company,
		grade: match[2] ?? "",
	};
}

/**
 * The set code a title is about, without the AI: its only set code, or null
 * when it has none or several.
 */
export function titleSetCode(title: string): string | null {
	const codes = findSetCodes(title);
	return codes.length === 1 ? (codes[0] ?? null) : null;
}

/**
 * Combines the AI's judgments with what code reads exactly. A lone set code
 * comes from the title; with several, the AI's pick must be one of them. The
 * code's language suffix beats the AI's language, and a Graded Listing's
 * company and grade come from the title when it states them.
 */
export function readTitle(title: string, judgments: TitleJudgments): TitleRead {
	const codes = findSetCodes(title);
	const setCode =
		codes.length === 1
			? (codes[0] ?? null)
			: judgments.setCode !== null && codes.includes(judgments.setCode)
				? judgments.setCode
				: null;
	const language =
		(setCode === null ? null : languageOfSetCode(setCode)) ??
		judgments.language;
	const stated = judgments.graded ? findGrade(title) : null;
	return {
		setCode,
		rarity:
			judgments.rarity === null ? null : normalizeRarity(judgments.rarity),
		condition: judgments.condition,
		copies: judgments.copies,
		language,
		graded: judgments.graded,
		gradingCompany: judgments.graded
			? (stated?.company ?? judgments.gradingCompany)
			: null,
		grade: stated?.grade ?? null,
	};
}

export type MatchStatus = "match" | "notMatch" | "unsure";

type MatchablePrinting<Id> = {
	_id: Id;
	setCode: string;
	rarity: string;
	overloadedRarities: readonly string[];
};

/**
 * Matches a read title to one of the Printings, in any language. The card
 * number must agree; then the rarity must be one of the Printings'. A rarity
 * recorded as Overloaded is not a match; any other rarity is "unsure". With no
 * rarity read, only a set code printed in a single rarity matches. No set
 * code in the title is "unsure".
 */
export function matchListing<Id>(
	read: { setCode: string | null; rarity: string | null },
	printings: readonly MatchablePrinting<Id>[],
): { status: MatchStatus; printingId: Id | null } {
	if (read.setCode === null) return { status: "unsure", printingId: null };
	const key = setCodeKey(read.setCode);
	const sameCard = printings.filter(
		(printing) => key !== null && setCodeKey(printing.setCode) === key,
	);
	if (sameCard.length === 0) return { status: "notMatch", printingId: null };

	if (read.rarity !== null) {
		const rarity = normalizeRarity(read.rarity);
		const printing = sameCard.find(
			(candidate) => normalizeRarity(candidate.rarity) === rarity,
		);
		if (printing) return { status: "match", printingId: printing._id };
		// Another rarity this set code is known to be printed in is not a
		// match; a rarity nobody recorded for it might be a misread.
		const knownOther = sameCard.some((candidate) =>
			candidate.overloadedRarities.some(
				(other) => normalizeRarity(other) === rarity,
			),
		);
		return { status: knownOther ? "notMatch" : "unsure", printingId: null };
	}

	const [only] = sameCard;
	if (sameCard.length === 1 && only && only.overloadedRarities.length === 0) {
		return { status: "match", printingId: only._id };
	}
	return { status: "unsure", printingId: null };
}

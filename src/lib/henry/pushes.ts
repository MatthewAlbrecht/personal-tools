// The Henry's new-unit push rule and push text (new, relisted and dropped
// units; failing checks), shared by Convex (relative imports only) and the
// page.

import { DEFAULT_TIME_ZONE } from "../yugioh/pushes";
import { bedLabel, formatMoney } from "./units";

/** The facts the push rules read. */
export type PushRuleFacts = {
	facesI25: boolean;
	beds: number;
	sqft: number;
	floor: number;
};

/**
 * Why the rules skip a unit ("Faces I-25"), or null when it passes:
 * not on the I-25 side, not a 1 bed of 800 sq ft or less, not a studio on
 * floors 2-6.
 */
export function pushRuleMiss(unit: PushRuleFacts): string | null {
	if (unit.facesI25) return "Faces I-25";
	if (unit.beds === 1 && unit.sqft <= 800) return "1 bed, 800 sq ft or less";
	if (unit.beds === 0 && unit.floor >= 2 && unit.floor <= 6) {
		return "Studio on floors 2-6";
	}
	return null;
}

/**
 * Whether a listed or relisted unit pushes: starred (itself or its floor
 * plan) always does, else it must pass the rules.
 */
export function pushesNewUnit(unit: PushRuleFacts, starred: boolean): boolean {
	// The star override (story 43, confirmed): starred units always push.
	if (starred) return true;
	return pushRuleMiss(unit) === null;
}

/**
 * The drawer's "New-unit push" fact: "Yes", "Yes, starred" (the rules
 * alone would skip it) or "No: faces I-25".
 */
export function newUnitPushLabel(
	unit: PushRuleFacts,
	starred: boolean,
): string {
	const miss = pushRuleMiss(unit);
	if (miss === null) return "Yes";
	if (pushesNewUnit(unit, starred)) return "Yes, starred";
	return `No: ${miss.charAt(0).toLowerCase()}${miss.slice(1)}`;
}

/**
 * What a unit's push reports: it listed or relisted (with the drop since,
 * while held, if it's still below), or only dropped. `droppedFrom` is the
 * price before the first drop the push carries.
 */
export type UnitPushNews =
	| { kind: "listed" | "relisted"; droppedFrom: number | null }
	| { kind: "dropped"; droppedFrom: number };

export type UnitPushFacts = {
	number: string;
	beds: number;
	sqft: number;
	price: number;
	news: UnitPushNews;
};

/**
 * "New at The Henry: Apt 516" over "1 bed · 813 sq ft · $2,256/mo"; a
 * relisting is "Back at The Henry: Apt 608" over "Relisted · 2 bed · …".
 * A drop alone is "Down $41 at The Henry: Apt 608" over "2 bed · 1,091 sq
 * ft · $2,615/mo, was $2,656"; with a listing it leads the body ("Down $41 ·
 * …", "Relisted, down $41 · …").
 */
export function unitPushText(unit: UnitPushFacts): {
	title: string;
	body: string;
} {
	const facts = `${bedLabel(unit.beds)} · ${unit.sqft.toLocaleString("en-US")} sq ft · ${formatMoney(unit.price)}/mo`;
	const { news } = unit;
	const down =
		news.droppedFrom === null
			? null
			: formatMoney(news.droppedFrom - unit.price);
	switch (news.kind) {
		case "dropped":
			return {
				title: `Down ${down} at The Henry: Apt ${unit.number}`,
				body: `${facts}, was ${formatMoney(news.droppedFrom)}`,
			};
		case "relisted":
			return {
				title: `Back at The Henry: Apt ${unit.number}`,
				body: `${down === null ? "Relisted" : `Relisted, down ${down}`} · ${facts}`,
			};
		case "listed":
			return {
				title: `New at The Henry: Apt ${unit.number}`,
				body: down === null ? facts : `Down ${down} · ${facts}`,
			};
	}
}

/** Longest last error the failing-checks push quotes. */
const MAX_ERROR_LENGTH = 60;

/**
 * "The Henry checks are failing" over "No successful check since Sun 11:00
 * AM. Last error: HTTP 503", the time in `timeZone`.
 */
export function checksFailingPushText(facts: {
	lastSuccessAt: number;
	lastError: string;
	timeZone: string;
}): { title: string; body: string } {
	const since = formatShortTime(facts.lastSuccessAt, facts.timeZone);
	const error =
		facts.lastError.length > MAX_ERROR_LENGTH
			? `${facts.lastError.slice(0, MAX_ERROR_LENGTH - 1).trimEnd()}…`
			: facts.lastError;
	return {
		title: "The Henry checks are failing",
		body: `No successful check since ${since}. Last error: ${error}`,
	};
}

/** Where tapping the failing-checks push goes. */
export const CHECKS_FAILING_PUSH_URL = "/henry";

/** One failing-checks notification at a time. */
export const CHECKS_FAILING_PUSH_TAG = "henry-checks";

/** "Sun 11:00 AM" in `timeZone` (the default zone when it isn't one). */
function formatShortTime(ms: number, timeZone: string): string {
	try {
		return formatShortTimeIn(ms, timeZone);
	} catch {
		return formatShortTimeIn(ms, DEFAULT_TIME_ZONE);
	}
}

function formatShortTimeIn(ms: number, timeZone: string): string {
	return (
		new Intl.DateTimeFormat("en-US", {
			weekday: "short",
			hour: "numeric",
			minute: "2-digit",
			timeZone,
		})
			.format(ms)
			// Newer ICU puts a narrow no-break space before AM/PM.
			.replace(/\u202f/g, " ")
	);
}

/** Where tapping a unit's push goes: The Henry with its drawer open. */
export function unitPushUrl(number: string): string {
	return `/henry?unit=${encodeURIComponent(number)}`;
}

/** One notification per unit: a later push replaces the earlier one. */
export function unitPushTag(number: string): string {
	return `henry-unit-${number}`;
}

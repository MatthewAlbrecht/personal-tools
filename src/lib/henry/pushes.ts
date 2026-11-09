// The Henry's new-unit push rule and push text, shared by Convex (relative
// imports only) and the page.

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
	// The star override: the spec's flagged assumption (story 43), not yet
	// confirmed. Drop this branch if starring should only drive drop pushes.
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

export type UnitPushFacts = {
	number: string;
	beds: number;
	sqft: number;
	price: number;
	/** Back after going off the market, rather than never seen before. */
	relisted: boolean;
};

/**
 * "New at The Henry: Apt 516" over "1 bed · 813 sq ft · $2,256/mo"; a
 * relisting is "Back at The Henry: Apt 608" over "Relisted · 2 bed · …".
 */
export function unitPushText(unit: UnitPushFacts): {
	title: string;
	body: string;
} {
	const facts = `${bedLabel(unit.beds)} · ${unit.sqft.toLocaleString("en-US")} sq ft · ${formatMoney(unit.price)}/mo`;
	return unit.relisted
		? {
				title: `Back at The Henry: Apt ${unit.number}`,
				body: `Relisted · ${facts}`,
			}
		: { title: `New at The Henry: Apt ${unit.number}`, body: facts };
}

/** Where tapping a unit's push goes: The Henry with its drawer open. */
export function unitPushUrl(number: string): string {
	return `/henry?unit=${encodeURIComponent(number)}`;
}

/** One notification per unit: a later push replaces the earlier one. */
export function unitPushTag(number: string): string {
	return `henry-unit-${number}`;
}

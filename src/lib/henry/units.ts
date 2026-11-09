// The Henry's pure unit rules, shared by Convex (relative imports only) and
// the page.

import { format, parseISO } from "date-fns";

function oddRange(from: number, to: number): string[] {
	const numbers: string[] = [];
	for (let n = from; n <= to; n += 2) numbers.push(String(n));
	return numbers;
}

/**
 * The outer row along the building's highway edge, worked out from SightMap's
 * unit geometry. Corner units x47 sit back from it and don't count. Fixed, not
 * computed at runtime.
 */
const I25_SIDE = new Set<string>([
	"155",
	"249",
	"251",
	"253",
	"273",
	"275",
	...oddRange(349, 383),
	...oddRange(449, 483),
	...oddRange(549, 581),
	...oddRange(649, 681),
	...oddRange(749, 779),
]);

export function isI25Side(unitNumber: string): boolean {
	return I25_SIDE.has(unitNumber);
}

export function bedLabel(beds: number): string {
	return beds === 0 ? "Studio" : `${beds} bed`;
}

const money = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0,
});

export function formatMoney(value: number): string {
	return money.format(value);
}

/** "Now" when `availableOn` (`YYYY-MM-DD`) is `today` or earlier, else the date as "Dec 4". */
export function moveInLabel(availableOn: string, today: string): string {
	if (availableOn <= today) return "Now";
	return format(parseISO(availableOn), "MMM d");
}

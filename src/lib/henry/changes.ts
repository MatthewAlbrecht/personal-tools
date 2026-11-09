// The Henry's price change rule, shared by Convex (relative imports only) and
// the page.

const DAY = 24 * 60 * 60 * 1000;

/** The Ledger's change columns, in days. */
export const CHANGE_WINDOWS = [3, 7, 14] as const;
export type ChangeWindow = (typeof CHANGE_WINDOWS)[number];

/** The longest window: how far back a unit's history must reach. */
export const LONGEST_CHANGE_WINDOW = 14 * DAY;

export type PriceAt = { at: number; price: number };

export type PriceChanges = { d3: number; d7: number; d14: number };

/**
 * Current price minus the price `days` before `now`. When the unit's first
 * price point is later than that (it listed, or tracking began, within the
 * window), measures from its first price point. 0 with no history.
 */
export function priceChange(
	points: readonly PriceAt[],
	price: number,
	now: number,
	days: number,
): number {
	const from = priceAt(points, now - days * DAY);
	return from === null ? 0 : price - from;
}

/** The 3, 7 and 14 day changes. */
export function priceChanges(
	points: readonly PriceAt[],
	price: number,
	now: number,
): PriceChanges {
	return {
		d3: priceChange(points, price, now, 3),
		d7: priceChange(points, price, now, 7),
		d14: priceChange(points, price, now, 14),
	};
}

/** The price in force at `at`; the first price when `at` is before it. */
function priceAt(points: readonly PriceAt[], at: number): number | null {
	const sorted = [...points].sort((a, b) => a.at - b.at);
	let found = sorted[0]?.price ?? null;
	for (const point of sorted) {
		if (point.at > at) break;
		found = point.price;
	}
	return found;
}

// Stars on the Ledger: pinning, the All / Starred / New filter and the floor
// plan list. Client-side over the page query's units.

/** How the page query marks a unit's stars. */
type Starrable = { unitStarred: boolean; planStarred: boolean };

export type LedgerFilter = "all" | "starred" | "new";

/** Starred = starred itself or through its floor plan. */
export function isStarred(unit: Starrable): boolean {
	return unit.unitStarred || unit.planStarred;
}

/**
 * The Ledger never shows I-25 side units, starred or not.
 */
export function hideI25<T extends { facesI25: boolean }>(
	units: readonly T[],
): T[] {
	return units.filter((unit) => !unit.facesI25);
}

/** Starred units first, each group keeping the order it came in (the current sort). */
export function pinStarred<T extends Starrable>(units: readonly T[]): T[] {
	return [
		...units.filter((unit) => isStarred(unit)),
		...units.filter((unit) => !isStarred(unit)),
	];
}

/** The units a filter shows; New = listed in the last 7 days. */
export function filterUnits<T extends Starrable & { newDays: number | null }>(
	units: readonly T[],
	filter: LedgerFilter,
): T[] {
	switch (filter) {
		case "all":
			return [...units];
		case "starred":
			return units.filter((unit) => isStarred(unit));
		case "new":
			return units.filter((unit) => unit.newDays !== null);
	}
}

/** How many units each filter shows. */
export function filterCounts(
	units: readonly (Starrable & { newDays: number | null })[],
): Record<LedgerFilter, number> {
	return {
		all: units.length,
		starred: filterUnits(units, "starred").length,
		new: filterUnits(units, "new").length,
	};
}

export type PlanSummary = {
	floorPlan: string;
	/** Beds on this plan; null when no unit on it is on the market. */
	beds: number | null;
	onMarket: number;
	starred: boolean;
};

/**
 * Every floor plan with a unit on the market, plus starred plans with none
 * (so they can still be unstarred), by name.
 */
export function planSummaries(
	units: readonly { floorPlan: string; beds: number }[],
	starredPlans: readonly string[],
): PlanSummary[] {
	const starred = new Set(starredPlans);
	const plans = new Map<string, PlanSummary>();
	for (const plan of starredPlans) {
		plans.set(plan, {
			floorPlan: plan,
			beds: null,
			onMarket: 0,
			starred: true,
		});
	}
	for (const unit of units) {
		const plan = plans.get(unit.floorPlan) ?? {
			floorPlan: unit.floorPlan,
			beds: unit.beds,
			onMarket: 0,
			starred: starred.has(unit.floorPlan),
		};
		plans.set(unit.floorPlan, {
			...plan,
			beds: plan.beds ?? unit.beds,
			onMarket: plan.onMarket + 1,
		});
	}
	return [...plans.values()].sort((a, b) =>
		a.floorPlan.localeCompare(b.floorPlan),
	);
}

import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Flips a unit's own star in every cached Ledger and drawer. */
export function toggleCachedUnitStar(
	store: OptimisticLocalStore,
	unitId: Id<"henryUnits">,
): void {
	for (const { args, value } of store.getAllQueries(
		api.henry.ledger.getLedger,
	)) {
		if (!value) continue;
		store.setQuery(api.henry.ledger.getLedger, args, {
			...value,
			units: value.units.map((unit) =>
				unit._id === unitId
					? { ...unit, unitStarred: !unit.unitStarred }
					: unit,
			),
		});
	}
	for (const { args, value } of store.getAllQueries(api.henry.units.getUnit)) {
		if (!value || value._id !== unitId) continue;
		store.setQuery(api.henry.units.getUnit, args, {
			...value,
			unitStarred: !value.unitStarred,
		});
	}
}

/** Flips a floor plan's star in every cached Ledger and drawer. */
export function toggleCachedPlanStar(
	store: OptimisticLocalStore,
	floorPlan: string,
): void {
	for (const { args, value } of store.getAllQueries(
		api.henry.ledger.getLedger,
	)) {
		if (!value) continue;
		const starred = !value.starredPlans.includes(floorPlan);
		const others = value.starredPlans.filter((plan) => plan !== floorPlan);
		store.setQuery(api.henry.ledger.getLedger, args, {
			...value,
			starredPlans: starred ? [...others, floorPlan].sort() : others,
			units: value.units.map((unit) =>
				unit.floorPlan === floorPlan ? { ...unit, planStarred: starred } : unit,
			),
		});
	}
	for (const { args, value } of store.getAllQueries(api.henry.units.getUnit)) {
		if (!value || value.floorPlan !== floorPlan) continue;
		store.setQuery(api.henry.units.getUnit, args, {
			...value,
			planStarred: !value.planStarred,
		});
	}
}

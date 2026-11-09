import { useMutation } from "convex/react";
import { toast } from "sonner";
import { errorMessage } from "~/lib/error-message";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toggleCachedPlanStar, toggleCachedUnitStar } from "./optimistic";

/** Star toggles for units and floor plans, applied optimistically everywhere they show. */
export function useStarToggles(): {
	toggleUnit: (unitId: Id<"henryUnits">) => void;
	togglePlan: (floorPlan: string) => void;
} {
	const toggleUnitStar = useMutation(
		api.henry.stars.toggleUnitStar,
	).withOptimisticUpdate((store, args) => {
		toggleCachedUnitStar(store, args.unitId);
	});
	const toggleFloorPlanStar = useMutation(
		api.henry.stars.toggleFloorPlanStar,
	).withOptimisticUpdate((store, args) => {
		toggleCachedPlanStar(store, args.floorPlan);
	});

	return {
		toggleUnit(unitId) {
			toggleUnitStar({ unitId }).catch((error: unknown) => {
				toast.error(errorMessage(error, "Couldn't save the star. Try again."));
			});
		},
		togglePlan(floorPlan) {
			toggleFloorPlanStar({ floorPlan }).catch((error: unknown) => {
				toast.error(errorMessage(error, "Couldn't save the star. Try again."));
			});
		},
	};
}

import { getRatingsForTier } from "~/lib/album-tiers";
import type { RatingSelection } from "./types";

export function ratingBoundsFromSelection(selection: RatingSelection): {
	ratingMin: number;
	ratingMax: number | undefined;
} {
	if ("minTier" in selection) {
		const ratings = getRatingsForTier(selection.minTier);
		return { ratingMin: ratings.low, ratingMax: undefined };
	}

	const ratings = getRatingsForTier(selection.tier);

	if (selection.subTier === "High") {
		return { ratingMin: ratings.high, ratingMax: ratings.high };
	}
	if (selection.subTier === "Med") {
		return { ratingMin: ratings.med, ratingMax: ratings.med };
	}
	if (selection.subTier === "Low") {
		return { ratingMin: ratings.low, ratingMax: ratings.low };
	}

	return { ratingMin: ratings.low, ratingMax: ratings.high };
}

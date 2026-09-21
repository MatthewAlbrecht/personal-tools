export type ZinePageRecommendation = {
	albumTitle: string;
	artistName: string;
	imageUrl?: string;
	pitch?: string;
	year?: string;
	spotifyAlbumId?: string;
};

export const ZINE_PAGE_RECOMMENDATION_LIMITS = {
	maxItems: 4,
} as const;

export function createEmptyPageRecommendation(): ZinePageRecommendation {
	return { albumTitle: "", artistName: "" };
}

export function isPageRecommendationVisible(
	item: ZinePageRecommendation,
): boolean {
	return item.albumTitle.trim() !== "" && item.artistName.trim() !== "";
}

export function getVisiblePageRecommendations(
	items: readonly ZinePageRecommendation[] | undefined,
): ZinePageRecommendation[] {
	if (!items) {
		return [];
	}

	return items
		.filter(isPageRecommendationVisible)
		.slice(0, ZINE_PAGE_RECOMMENDATION_LIMITS.maxItems);
}

/** Prefer track-level recs; fall back to playlist/album defaults when none are visible. */
export function resolveSongPageRecommendations(
	trackItems: readonly ZinePageRecommendation[] | undefined,
	fallbackItems: readonly ZinePageRecommendation[] | undefined,
): ZinePageRecommendation[] {
	const trackVisible = getVisiblePageRecommendations(trackItems);
	if (trackVisible.length > 0) {
		return trackVisible;
	}
	return getVisiblePageRecommendations(fallbackItems);
}

export function getPageRecommendationLayout(count: number): "pair" | "stack" {
	return count === 2 ? "pair" : "stack";
}

export function coerceZinePageRecommendations(
	items: readonly ZinePageRecommendation[] | undefined,
): ZinePageRecommendation[] {
	if (!items) {
		return [];
	}

	return items.slice(0, ZINE_PAGE_RECOMMENDATION_LIMITS.maxItems);
}

import { v } from "convex/values";

export const zinePageRecommendationValidator = v.object({
	albumTitle: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	pitch: v.optional(v.string()),
	year: v.optional(v.string()),
	spotifyAlbumId: v.optional(v.string()),
});

export const zinePageRecommendationsValidator = v.array(
	zinePageRecommendationValidator,
);

const MAX_PAGE_RECOMMENDATIONS = 4;

type StoredPageRecommendation = {
	albumTitle: string;
	artistName: string;
	imageUrl?: string;
	pitch?: string;
	year?: string;
	spotifyAlbumId?: string;
};

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * Persist drafts (empty title/artist) so autosave does not wipe in-progress
 * recommendation rows. Print visibility is handled by getVisiblePageRecommendations.
 */
export function normalizeZinePageRecommendations(
	items: StoredPageRecommendation[] | undefined,
): StoredPageRecommendation[] {
	if (!items) {
		return [];
	}

	return items
		.map((item) => ({
			albumTitle: item.albumTitle.trim(),
			artistName: item.artistName.trim(),
			imageUrl: normalizeOptionalString(item.imageUrl),
			pitch: normalizeOptionalString(item.pitch),
			year: normalizeOptionalString(item.year),
			spotifyAlbumId: normalizeOptionalString(item.spotifyAlbumId),
		}))
		.slice(0, MAX_PAGE_RECOMMENDATIONS);
}

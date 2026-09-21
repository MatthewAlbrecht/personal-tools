export type ZineDiscographyItem = {
	albumTitle: string;
	artistName?: string;
	year?: string;
	imageUrl?: string;
	blurb: string;
	spotifyAlbumId?: string;
	hidden?: boolean;
};

export type ZineRecommendationItem = {
	albumTitle: string;
	artistName: string;
	year?: string;
	imageUrl?: string;
	similarityBlurb?: string;
};

export type ZineDiscographySection = {
	type: "discography";
	title?: string;
	items: ZineDiscographyItem[];
};

export type ZineRecommendationsSection = {
	type: "recommendations";
	title?: string;
	items: ZineRecommendationItem[];
};

export type ZineInsideBackSection =
	| ZineDiscographySection
	| ZineRecommendationsSection;

/** Drop legacy `text` sections from Convex payloads for the UI section union. */
export function coerceZineInsideBackSections(
	sections: readonly { type: string }[] | undefined,
): ZineInsideBackSection[] {
	if (!sections) {
		return [];
	}

	return sections.filter(
		(section): section is ZineInsideBackSection =>
			section.type === "discography" || section.type === "recommendations",
	);
}

export const ZINE_INSIDE_BACK_LIMITS = {
	maxSections: 4,
	/** Stored discography rows after Spotify import (user hides extras for print). */
	maxDiscographyItems: 50,
	maxRecommendationItems: 4,
} as const;

export function isDiscographyItemVisible(item: ZineDiscographyItem): boolean {
	return item.albumTitle.trim() !== "" && item.hidden !== true;
}

export function getVisibleDiscographyItems(
	items: ZineDiscographyItem[],
): ZineDiscographyItem[] {
	return items.filter(isDiscographyItemVisible);
}

export const ZINE_INSIDE_BACK_DEFAULT_TITLES = {
	discography: "Discography",
	recommendations: "If you liked this, check out",
} as const;

export function hasInsideBackContent(
	sections: ZineInsideBackSection[] | undefined,
): boolean {
	if (!sections || sections.length === 0) {
		return false;
	}

	return sections.some((section) => {
		if (section.type === "discography") {
			return section.items.some(isDiscographyItemVisible);
		}

		return section.items.some((item) => item.albumTitle.trim() !== "");
	});
}

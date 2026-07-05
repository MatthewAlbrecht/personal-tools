export type ZineDiscographyItem = {
	albumTitle: string;
	artistName?: string;
	year?: string;
	imageUrl?: string;
	blurb: string;
};

export type ZineRecommendationItem = {
	albumTitle: string;
	artistName: string;
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

export const ZINE_INSIDE_BACK_LIMITS = {
	maxSections: 4,
	maxDiscographyItems: 6,
	maxRecommendationItems: 4,
} as const;

export const ZINE_INSIDE_BACK_DEFAULT_TITLES = {
	discography: "Discography",
	recommendations: "If you liked this album, check out",
} as const;

export function hasInsideBackContent(
	sections: ZineInsideBackSection[] | undefined,
): boolean {
	if (!sections || sections.length === 0) {
		return false;
	}

	return sections.some((section) =>
		section.items.some((item) => item.albumTitle.trim() !== ""),
	);
}

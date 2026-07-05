import { v } from "convex/values";

const zineDiscographyItemValidator = v.object({
	albumTitle: v.string(),
	artistName: v.optional(v.string()),
	year: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	blurb: v.string(),
	spotifyAlbumId: v.optional(v.string()),
	hidden: v.optional(v.boolean()),
});

const zineRecommendationItemValidator = v.object({
	albumTitle: v.string(),
	artistName: v.string(),
	year: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	similarityBlurb: v.optional(v.string()),
});

export const zineInsideBackSectionValidator = v.union(
	v.object({
		type: v.literal("discography"),
		title: v.optional(v.string()),
		items: v.array(zineDiscographyItemValidator),
	}),
	v.object({
		type: v.literal("recommendations"),
		title: v.optional(v.string()),
		items: v.array(zineRecommendationItemValidator),
	}),
);

export const zineInsideBackSectionsValidator = v.array(
	zineInsideBackSectionValidator,
);

type StoredSection =
	| {
			type: "discography";
			title?: string;
			items: Array<{
				albumTitle: string;
				artistName?: string;
				year?: string;
				imageUrl?: string;
				blurb: string;
				spotifyAlbumId?: string;
				hidden?: boolean;
			}>;
	  }
	| {
			type: "recommendations";
			title?: string;
			items: Array<{
				albumTitle: string;
				artistName: string;
				year?: string;
				imageUrl?: string;
				similarityBlurb?: string;
			}>;
	  };

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function normalizeZineInsideBackSections(
	sections: StoredSection[] | undefined,
): StoredSection[] {
	if (!sections) return [];

	const normalized: StoredSection[] = [];

	for (const section of sections.slice(0, 4)) {
		if (section.type === "discography") {
			const items = section.items
				.map((item) => ({
					albumTitle: item.albumTitle.trim(),
					artistName: normalizeOptionalString(item.artistName),
					year: normalizeOptionalString(item.year),
					imageUrl: normalizeOptionalString(item.imageUrl),
					blurb: item.blurb.trim(),
					spotifyAlbumId: normalizeOptionalString(item.spotifyAlbumId),
					hidden: item.hidden === true ? true : undefined,
				}))
				.filter((item) => item.albumTitle !== "")
				.slice(0, 50);

			if (items.length === 0) continue;

			normalized.push({
				type: "discography",
				title: normalizeOptionalString(section.title),
				items,
			});
			continue;
		}

		const items = section.items
			.map((item) => ({
				albumTitle: item.albumTitle.trim(),
				artistName: item.artistName.trim(),
				year: normalizeOptionalString(item.year),
				imageUrl: normalizeOptionalString(item.imageUrl),
				similarityBlurb: normalizeOptionalString(item.similarityBlurb),
			}))
			.filter((item) => item.albumTitle !== "" && item.artistName !== "")
			.slice(0, 4);

		if (items.length === 0) continue;

		normalized.push({
			type: "recommendations",
			title: normalizeOptionalString(section.title),
			items,
		});
	}

	return normalized;
}

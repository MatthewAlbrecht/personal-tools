/**
 * Album Rating Tier System
 *
 * Maps numeric ratings (1-10) to tier names and sub-tiers
 */

export type TierName =
	| "Holy Moly"
	| "Really Enjoyed"
	| "Good"
	| "Fine"
	| "Actively Bad";

export type SubTier = "High" | "Low";

export type TierInfo = {
	tier: TierName;
	subTier: SubTier;
	rating: number;
};

// Rating to tier mapping
const TIER_MAP: Record<number, TierInfo> = {
	10: { tier: "Holy Moly", subTier: "High", rating: 10 },
	9: { tier: "Holy Moly", subTier: "Low", rating: 9 },
	8: { tier: "Really Enjoyed", subTier: "High", rating: 8 },
	7: { tier: "Really Enjoyed", subTier: "Low", rating: 7 },
	6: { tier: "Good", subTier: "High", rating: 6 },
	5: { tier: "Good", subTier: "Low", rating: 5 },
	4: { tier: "Fine", subTier: "High", rating: 4 },
	3: { tier: "Fine", subTier: "Low", rating: 3 },
	2: { tier: "Actively Bad", subTier: "High", rating: 2 },
	1: { tier: "Actively Bad", subTier: "Low", rating: 1 },
};

// Ordered list of tiers for display
export const TIER_ORDER: TierName[] = [
	"Holy Moly",
	"Really Enjoyed",
	"Good",
	"Fine",
	"Actively Bad",
];

/**
 * Get tier info from a numeric rating
 */
export function getTierInfo(rating: number): TierInfo | null {
	return TIER_MAP[rating] ?? null;
}

/**
 * Get the display label for a rating (e.g., "Holy Moly - High")
 */
export function getTierLabel(rating: number): string {
	const info = getTierInfo(rating);
	if (!info) return "Unrated";
	return `${info.tier} - ${info.subTier}`;
}

/**
 * Get the ratings that belong to a specific tier
 */
export function getRatingsForTier(tier: TierName): {
	high: number;
	low: number;
} {
	switch (tier) {
		case "Holy Moly":
			return { high: 10, low: 9 };
		case "Really Enjoyed":
			return { high: 8, low: 7 };
		case "Good":
			return { high: 6, low: 5 };
		case "Fine":
			return { high: 4, low: 3 };
		case "Actively Bad":
			return { high: 2, low: 1 };
	}
}

/**
 * Extract year from a release date string (handles "2024", "2024-01", "2024-01-15")
 */
export function extractReleaseYear(
	releaseDate: string | undefined,
): number | null {
	if (!releaseDate) return null;
	const year = Number.parseInt(releaseDate.substring(0, 4), 10);
	return isNaN(year) ? null : year;
}

/**
 * Group albums by month from listenedAt timestamp
 * Returns a map of "Month Year" -> albums
 */
export function groupByMonth<T extends { listenedAt: number }>(
	items: T[],
): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const item of items) {
		const date = new Date(item.listenedAt);
		const monthYear = date.toLocaleDateString("en-US", {
			month: "long",
			year: "numeric",
		});

		const existing = groups.get(monthYear) ?? [];
		existing.push(item);
		groups.set(monthYear, existing);
	}

	return groups;
}

/**
 * Color mapping per rating (1-10)
 * Spectrum: violet → indigo → blue → sky → teal → emerald → lime → yellow → orange → red
 * Higher ratings = cooler colors, lower ratings = warmer colors
 */
const RATING_COLORS: Record<
	number,
	{ bg: string; text: string; border: string }
> = {
	10: {
		// Violet - Holy Moly High
		bg: "bg-violet-500/15",
		text: "text-violet-600 dark:text-violet-400",
		border: "border-violet-500/30",
	},
	9: {
		// Indigo - Holy Moly Low
		bg: "bg-indigo-500/15",
		text: "text-indigo-600 dark:text-indigo-400",
		border: "border-indigo-500/30",
	},
	8: {
		// Blue - Really Enjoyed High
		bg: "bg-blue-500/15",
		text: "text-blue-600 dark:text-blue-400",
		border: "border-blue-500/30",
	},
	7: {
		// Sky - Really Enjoyed Low
		bg: "bg-sky-500/15",
		text: "text-sky-600 dark:text-sky-400",
		border: "border-sky-500/30",
	},
	6: {
		// Teal - Good High
		bg: "bg-teal-500/15",
		text: "text-teal-600 dark:text-teal-400",
		border: "border-teal-500/30",
	},
	5: {
		// Emerald - Good Low
		bg: "bg-emerald-500/15",
		text: "text-emerald-600 dark:text-emerald-400",
		border: "border-emerald-500/30",
	},
	4: {
		// Lime - Fine High
		bg: "bg-lime-500/15",
		text: "text-lime-600 dark:text-lime-400",
		border: "border-lime-500/30",
	},
	3: {
		// Yellow - Fine Low
		bg: "bg-yellow-500/15",
		text: "text-yellow-600 dark:text-yellow-400",
		border: "border-yellow-500/30",
	},
	2: {
		// Orange - Actively Bad High
		bg: "bg-orange-500/15",
		text: "text-orange-600 dark:text-orange-400",
		border: "border-orange-500/30",
	},
	1: {
		// Red - Actively Bad Low
		bg: "bg-red-500/15",
		text: "text-red-600 dark:text-red-400",
		border: "border-red-500/30",
	},
};

/**
 * Get color classes for a specific rating (1-10)
 * Uses spectrum from violet (10) to red (1)
 * Returns { bg, text, border } Tailwind classes
 */
export function getRatingColors(rating: number): {
	bg: string;
	text: string;
	border: string;
} {
	return (
		RATING_COLORS[rating] ?? {
			bg: "bg-muted",
			text: "text-muted-foreground",
			border: "border-dashed",
		}
	);
}

/**
 * @deprecated Use getRatingColors(rating) instead for per-rating colors
 * Get color classes for a tier (for badges/pills)
 */
export function getTierColors(tier: TierName): {
	bg: string;
	text: string;
	border: string;
} {
	const ratings = getRatingsForTier(tier);
	return getRatingColors(ratings.high);
}

/**
 * Get a short label for display (e.g., "Holy Moly ↑" or "Holy Moly ↓")
 */
export function getTierShortLabel(rating: number): string {
	const info = getTierInfo(rating);
	if (!info) return "Unrated";
	const arrow = info.subTier === "High" ? "↑" : "↓";
	return `${info.tier} ${arrow}`;
}

/**
 * Album Rating Tier System
 *
 * Maps numeric ratings (1-15) to tier names and sub-tiers
 */

export type TierName =
	| "Holy Moly"
	| "Really Enjoyed"
	| "Good"
	| "Fine"
	| "Actively Bad";

export type SubTier = "High" | "Med" | "Low";

export type TierInfo = {
	tier: TierName;
	subTier: SubTier;
	rating: number;
};

// Rating to tier mapping (1-15 scale)
const TIER_MAP: Record<number, TierInfo> = {
	// Holy Moly (15, 14, 13)
	15: { tier: "Holy Moly", subTier: "High", rating: 15 },
	14: { tier: "Holy Moly", subTier: "Med", rating: 14 },
	13: { tier: "Holy Moly", subTier: "Low", rating: 13 },
	// Really Enjoyed (12, 11, 10)
	12: { tier: "Really Enjoyed", subTier: "High", rating: 12 },
	11: { tier: "Really Enjoyed", subTier: "Med", rating: 11 },
	10: { tier: "Really Enjoyed", subTier: "Low", rating: 10 },
	// Good (9, 8, 7)
	9: { tier: "Good", subTier: "High", rating: 9 },
	8: { tier: "Good", subTier: "Med", rating: 8 },
	7: { tier: "Good", subTier: "Low", rating: 7 },
	// Fine (6, 5, 4)
	6: { tier: "Fine", subTier: "High", rating: 6 },
	5: { tier: "Fine", subTier: "Med", rating: 5 },
	4: { tier: "Fine", subTier: "Low", rating: 4 },
	// Actively Bad (3, 2, 1)
	3: { tier: "Actively Bad", subTier: "High", rating: 3 },
	2: { tier: "Actively Bad", subTier: "Med", rating: 2 },
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
	med: number;
	low: number;
} {
	switch (tier) {
		case "Holy Moly":
			return { high: 15, med: 14, low: 13 };
		case "Really Enjoyed":
			return { high: 12, med: 11, low: 10 };
		case "Good":
			return { high: 9, med: 8, low: 7 };
		case "Fine":
			return { high: 6, med: 5, low: 4 };
		case "Actively Bad":
			return { high: 3, med: 2, low: 1 };
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
 * Color mapping per rating (1-15)
 * Spectrum: fuchsia → violet → indigo → blue → sky → cyan → teal → emerald → green → lime → yellow → amber → orange → rose → red
 * Higher ratings = cooler colors, lower ratings = warmer colors
 */
const RATING_COLORS: Record<
	number,
	{ bg: string; text: string; border: string }
> = {
	// Holy Moly (15, 14, 13) - Fuchsia/Violet/Indigo
	15: {
		bg: "bg-fuchsia-500/15",
		text: "text-fuchsia-600 dark:text-fuchsia-400",
		border: "border-fuchsia-500/30",
	},
	14: {
		bg: "bg-violet-500/15",
		text: "text-violet-600 dark:text-violet-400",
		border: "border-violet-500/30",
	},
	13: {
		bg: "bg-indigo-500/15",
		text: "text-indigo-600 dark:text-indigo-400",
		border: "border-indigo-500/30",
	},
	// Really Enjoyed (12, 11, 10) - Blue/Sky/Cyan
	12: {
		bg: "bg-blue-500/15",
		text: "text-blue-600 dark:text-blue-400",
		border: "border-blue-500/30",
	},
	11: {
		bg: "bg-sky-500/15",
		text: "text-sky-600 dark:text-sky-400",
		border: "border-sky-500/30",
	},
	10: {
		bg: "bg-cyan-500/15",
		text: "text-cyan-600 dark:text-cyan-400",
		border: "border-cyan-500/30",
	},
	// Good (9, 8, 7) - Teal/Emerald/Green
	9: {
		bg: "bg-teal-500/15",
		text: "text-teal-600 dark:text-teal-400",
		border: "border-teal-500/30",
	},
	8: {
		bg: "bg-emerald-500/15",
		text: "text-emerald-600 dark:text-emerald-400",
		border: "border-emerald-500/30",
	},
	7: {
		bg: "bg-green-500/15",
		text: "text-green-600 dark:text-green-400",
		border: "border-green-500/30",
	},
	// Fine (6, 5, 4) - Lime/Yellow/Amber
	6: {
		bg: "bg-lime-500/15",
		text: "text-lime-600 dark:text-lime-400",
		border: "border-lime-500/30",
	},
	5: {
		bg: "bg-yellow-500/15",
		text: "text-yellow-600 dark:text-yellow-400",
		border: "border-yellow-500/30",
	},
	4: {
		bg: "bg-amber-500/15",
		text: "text-amber-600 dark:text-amber-400",
		border: "border-amber-500/30",
	},
	// Actively Bad (3, 2, 1) - Orange/Rose/Red
	3: {
		bg: "bg-orange-500/15",
		text: "text-orange-600 dark:text-orange-400",
		border: "border-orange-500/30",
	},
	2: {
		bg: "bg-rose-500/15",
		text: "text-rose-600 dark:text-rose-400",
		border: "border-rose-500/30",
	},
	1: {
		bg: "bg-red-500/15",
		text: "text-red-600 dark:text-red-400",
		border: "border-red-500/30",
	},
};

/**
 * Get color classes for a specific rating (1-15)
 * Uses spectrum from fuchsia (15) to red (1)
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
 * Get a short label for display (e.g., "Holy Moly ↑" or "Holy Moly →" or "Holy Moly ↓")
 */
export function getTierShortLabel(rating: number): string {
	const info = getTierInfo(rating);
	if (!info) return "Unrated";
	const arrow =
		info.subTier === "High" ? "↑" : info.subTier === "Med" ? "→" : "↓";
	return `${info.tier} ${arrow}`;
}

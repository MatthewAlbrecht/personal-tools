/**
 * Album Rating Tier System
 *
 * Maps numeric ratings (1-10) to tier names and sub-tiers
 */

export type TierName =
  | 'Holy Moly'
  | 'Really Enjoyed'
  | 'Good'
  | 'Fine'
  | 'Actively Bad';

export type SubTier = 'High' | 'Low';

export type TierInfo = {
  tier: TierName;
  subTier: SubTier;
  rating: number;
};

// Rating to tier mapping
const TIER_MAP: Record<number, TierInfo> = {
  10: { tier: 'Holy Moly', subTier: 'High', rating: 10 },
  9: { tier: 'Holy Moly', subTier: 'Low', rating: 9 },
  8: { tier: 'Really Enjoyed', subTier: 'High', rating: 8 },
  7: { tier: 'Really Enjoyed', subTier: 'Low', rating: 7 },
  6: { tier: 'Good', subTier: 'High', rating: 6 },
  5: { tier: 'Good', subTier: 'Low', rating: 5 },
  4: { tier: 'Fine', subTier: 'High', rating: 4 },
  3: { tier: 'Fine', subTier: 'Low', rating: 3 },
  2: { tier: 'Actively Bad', subTier: 'High', rating: 2 },
  1: { tier: 'Actively Bad', subTier: 'Low', rating: 1 },
};

// Ordered list of tiers for display
export const TIER_ORDER: TierName[] = [
  'Holy Moly',
  'Really Enjoyed',
  'Good',
  'Fine',
  'Actively Bad',
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
  if (!info) return 'Unrated';
  return `${info.tier} - ${info.subTier}`;
}

/**
 * Get the ratings that belong to a specific tier
 */
export function getRatingsForTier(tier: TierName): { high: number; low: number } {
  switch (tier) {
    case 'Holy Moly':
      return { high: 10, low: 9 };
    case 'Really Enjoyed':
      return { high: 8, low: 7 };
    case 'Good':
      return { high: 6, low: 5 };
    case 'Fine':
      return { high: 4, low: 3 };
    case 'Actively Bad':
      return { high: 2, low: 1 };
  }
}

/**
 * Extract year from a release date string (handles "2024", "2024-01", "2024-01-15")
 */
export function extractReleaseYear(releaseDate: string | undefined): number | null {
  if (!releaseDate) return null;
  const year = parseInt(releaseDate.substring(0, 4), 10);
  return isNaN(year) ? null : year;
}

/**
 * Group albums by month from listenedAt timestamp
 * Returns a map of "Month Year" -> albums
 */
export function groupByMonth<T extends { listenedAt: number }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const date = new Date(item.listenedAt);
    const monthYear = date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const existing = groups.get(monthYear) ?? [];
    existing.push(item);
    groups.set(monthYear, existing);
  }

  return groups;
}


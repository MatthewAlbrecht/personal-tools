"use client";

import { Skeleton } from "~/components/ui/skeleton";

export type ArtistStatsRow = {
	artistKey: string;
	displayName: string;
	wins: number;
	top3: number;
	top5: number;
	top10: number;
	top25: number;
	top50: number;
	yearsAppeared: number;
};

export type ArtistStatTier =
	| "wins"
	| "top3"
	| "top5"
	| "top10"
	| "top25"
	| "top50";

export const ARTIST_STAT_TIER_CONFIG: Record<
	ArtistStatTier,
	{ limit: number; minCount: number }
> = {
	wins: { limit: 15, minCount: 1 },
	top3: { limit: 15, minCount: 1 },
	top5: { limit: 15, minCount: 1 },
	top10: { limit: 25, minCount: 2 },
	top25: { limit: 35, minCount: 2 },
	top50: { limit: 50, minCount: 2 },
};

/** @deprecated Use ARTIST_STAT_TIER_CONFIG[tier].limit instead. */
export const ARTIST_STAT_LIST_LIMIT = 15;

export const ARTIST_STAT_TIER_OPTIONS: Array<{
	id: ArtistStatTier;
	label: string;
	countLabel: string;
}> = [
	{ id: "wins", label: "#1", countLabel: "Wins" },
	{ id: "top3", label: "Top 3", countLabel: "Top 3" },
	{ id: "top5", label: "Top 5", countLabel: "Top 5" },
	{ id: "top10", label: "Top 10", countLabel: "Top 10" },
	{ id: "top25", label: "Top 25", countLabel: "Top 25" },
	{ id: "top50", label: "Top 50", countLabel: "Top 50" },
];

function getTierCount(row: ArtistStatsRow, tier: ArtistStatTier): number {
	switch (tier) {
		case "wins":
			return row.wins;
		case "top3":
			return row.top3;
		case "top5":
			return row.top5;
		case "top10":
			return row.top10;
		case "top25":
			return row.top25;
		case "top50":
			return row.top50;
	}
}

export function sortArtistStatsByTier(
	rows: ArtistStatsRow[],
	tier: ArtistStatTier,
	minCount = 1,
): ArtistStatsRow[] {
	return [...rows]
		.filter((row) => getTierCount(row, tier) >= minCount)
		.sort((a, b) => {
			const countDiff = getTierCount(b, tier) - getTierCount(a, tier);
			if (countDiff !== 0) return countDiff;
			return a.displayName.localeCompare(b.displayName);
		});
}

export function getArtistStatsListForTier(
	rows: ArtistStatsRow[],
	tier: ArtistStatTier,
): ArtistStatsRow[] {
	const { limit, minCount } = ARTIST_STAT_TIER_CONFIG[tier];
	return sortArtistStatsByTier(rows, tier, minCount).slice(0, limit);
}

/** 1224-style placement: tied artists share a rank; the next rank skips occupied places. */
export function getCompetitionPlacementRank(
	index: number,
	sortedRows: ArtistStatsRow[],
	tier: ArtistStatTier,
): number {
	if (index <= 0) return 1;
	const currentCount = getTierCount(sortedRows[index]!, tier);
	const previousCount = getTierCount(sortedRows[index - 1]!, tier);
	if (currentCount === previousCount) {
		return getCompetitionPlacementRank(index - 1, sortedRows, tier);
	}
	return index + 1;
}

export function ArtistStatsTable({
	rows,
	tier,
}: {
	rows: ArtistStatsRow[];
	tier: ArtistStatTier;
}) {
	const tierOption = ARTIST_STAT_TIER_OPTIONS.find((option) => option.id === tier);
	const sortedRows = getArtistStatsListForTier(rows, tier);

	if (sortedRows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No artists with {tierOption?.countLabel.toLowerCase() ?? "this"} finishes
				yet.
			</p>
		);
	}

	return (
		<ol className="space-y-1">
			{sortedRows.map((row, index) => (
				<li
					key={row.artistKey}
					className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
				>
					<span className="w-8 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
						{getCompetitionPlacementRank(index, sortedRows, tier)}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-sm">{row.displayName}</p>
					</div>
					<span className="flex-shrink-0 font-mono text-sm tabular-nums">
						{getTierCount(row, tier)}
					</span>
				</li>
			))}
		</ol>
	);
}

export function ArtistStatsTableSkeleton() {
	return (
		<div className="space-y-2">
			{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((key) => (
				<div key={key} className="flex items-center gap-3 px-2 py-2">
					<Skeleton className="h-4 w-8" />
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-6" />
				</div>
			))}
		</div>
	);
}

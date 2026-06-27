"use client";

import { useMemo, useState } from "react";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import {
	ARTIST_STAT_TIER_OPTIONS,
	type ArtistStatTier,
} from "./artist-stats-table";

export type ArtistUniqueTierRow = {
	artistKey: string;
	displayName: string;
	tierBestPlacement: number;
	tierBestPlacementYear: number;
};

export function filterArtistUniqueTierRows(
	rows: ArtistUniqueTierRow[],
	query: string,
): ArtistUniqueTierRow[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return rows;

	return rows.filter((row) => {
		return (
			row.displayName.toLowerCase().includes(normalizedQuery) ||
			row.artistKey.includes(normalizedQuery)
		);
	});
}

export function ArtistUniqueTierTable({
	rows,
	tier,
}: {
	rows: ArtistUniqueTierRow[];
	tier: ArtistStatTier;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const tierOption = ARTIST_STAT_TIER_OPTIONS.find((option) => option.id === tier);

	const filteredRows = useMemo(
		() => filterArtistUniqueTierRows(rows, searchQuery),
		[rows, searchQuery],
	);

	return (
		<div className="space-y-4">
			<Input
				type="search"
				value={searchQuery}
				onChange={(event) => setSearchQuery(event.target.value)}
				placeholder="Search artists…"
				aria-label="Search artists"
			/>

			{filteredRows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					{searchQuery.trim()
						? "No artists match your search."
						: `No artists with ${tierOption?.countLabel.toLowerCase() ?? "this tier"} finishes yet.`}
				</p>
			) : (
				<ol className="space-y-1">
					{filteredRows.map((row) => (
						<li
							key={row.artistKey}
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
						>
							<span className="w-10 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
								#{row.tierBestPlacement}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">{row.displayName}</p>
							</div>
							<span className="flex-shrink-0 text-muted-foreground text-sm tabular-nums">
								{row.tierBestPlacementYear}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export function ArtistUniqueTierTableSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-full" />
			<div className="space-y-2">
				{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((key) => (
					<div key={key} className="flex items-center gap-3 px-2 py-2">
						<Skeleton className="h-4 w-10" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-4 w-10" />
					</div>
				))}
			</div>
		</div>
	);
}

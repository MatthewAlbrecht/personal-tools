"use client";

import { useMemo, useState } from "react";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";

export type ArtistHighestPlacementRow = {
	artistKey: string;
	displayName: string;
	bestPlacement: number;
	bestPlacementYear: number;
};

export function filterArtistHighestPlacementRows(
	rows: ArtistHighestPlacementRow[],
	query: string,
): ArtistHighestPlacementRow[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return rows;

	return rows.filter((row) => {
		return (
			row.displayName.toLowerCase().includes(normalizedQuery) ||
			row.artistKey.includes(normalizedQuery)
		);
	});
}

export function ArtistHighestPlacementTable({
	rows,
}: {
	rows: ArtistHighestPlacementRow[];
}) {
	const [searchQuery, setSearchQuery] = useState("");

	const filteredRows = useMemo(
		() => filterArtistHighestPlacementRows(rows, searchQuery),
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
						: "No artist placements yet."}
				</p>
			) : (
				<ol className="space-y-1">
					{filteredRows.map((row) => (
						<li
							key={row.artistKey}
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
						>
							<span className="w-10 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
								#{row.bestPlacement}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">{row.displayName}</p>
							</div>
							<span className="flex-shrink-0 text-muted-foreground text-sm tabular-nums">
								{row.bestPlacementYear}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export function ArtistHighestPlacementTableSkeleton() {
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

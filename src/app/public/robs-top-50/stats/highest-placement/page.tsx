"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	ArtistHighestPlacementTable,
	ArtistHighestPlacementTableSkeleton,
} from "../../_components/artist-highest-placement-table";
import { PublicStatsNav } from "../../_components/public-stats-nav";
import { PublicTop50Nav } from "../../_components/public-top-50-nav";
import { api } from "../../../../../../convex/_generated/api";

export default function PublicRobsTop50HighestPlacementPage() {
	return (
		<Suspense fallback={<PublicRobsTop50HighestPlacementPageSkeleton />}>
			<PublicRobsTop50HighestPlacementPageInner />
		</Suspense>
	);
}

function PublicRobsTop50HighestPlacementPageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const highestPlacements = useQuery(
		api.robRankings.getPublishedArtistHighestPlacements,
		{},
	);

	const isLoadingYears = publishedYears === undefined;
	const isLoadingPlacements = highestPlacements === undefined;
	const yearRangeLabel = formatPublishedYearRange(publishedYears ?? []);

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<ListMusic className="h-6 w-6" />
						Rob&apos;s Top 50
					</CardTitle>
				</CardHeader>
				<CardContent>
					<PublicTop50Nav />
					<PublicStatsNav />

					{isLoadingYears || isLoadingPlacements ? (
						<>
							<p className="mb-4 text-muted-foreground text-sm">
								Loading highest placements…
							</p>
							<ArtistHighestPlacementTableSkeleton />
						</>
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : !highestPlacements || highestPlacements.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No artist placements available yet.
						</p>
					) : (
						<>
							<p className="mb-2 text-muted-foreground text-sm">
								Each artist&apos;s best finish across published years
								{yearRangeLabel ? ` (${yearRangeLabel})` : ""}.
							</p>
							<p className="mb-4 text-muted-foreground text-sm">
								Collaborative albums credit each listed artist. Year shown is
								when that best finish occurred.
							</p>

							<ArtistHighestPlacementTable rows={highestPlacements} />
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50HighestPlacementPageSkeleton() {
	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<ListMusic className="h-6 w-6" />
						Rob&apos;s Top 50
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ArtistHighestPlacementTableSkeleton />
				</CardContent>
			</Card>
		</main>
	);
}

function formatPublishedYearRange(
	years: Array<{ year: number; publishedAt?: number }>,
): string | null {
	if (years.length === 0) return null;

	const sortedYears = [...years]
		.map((entry) => entry.year)
		.sort((a, b) => a - b);
	const minYear = sortedYears[0];
	const maxYear = sortedYears[sortedYears.length - 1];

	if (minYear === undefined || maxYear === undefined) return null;
	if (minYear === maxYear) return String(minYear);

	return `${minYear}–${maxYear}`;
}

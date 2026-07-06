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

export default function PublicRobsTop50OneTimeArtistsPage() {
	return (
		<Suspense fallback={<PublicRobsTop50OneTimeArtistsPageSkeleton />}>
			<PublicRobsTop50OneTimeArtistsPageInner />
		</Suspense>
	);
}

function PublicRobsTop50OneTimeArtistsPageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const oneTimePlacements = useQuery(
		api.robRankings.getPublishedArtistOneTimePlacements,
		{},
	);

	const isLoadingYears = publishedYears === undefined;
	const isLoadingPlacements = oneTimePlacements === undefined;
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
								Loading one-time artists…
							</p>
							<ArtistHighestPlacementTableSkeleton />
						</>
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : !oneTimePlacements || oneTimePlacements.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No one-time artist placements available yet.
						</p>
					) : (
						<>
							<p className="mb-2 text-muted-foreground text-sm">
								Artists with exactly one finish across published years
								{yearRangeLabel ? ` (${yearRangeLabel})` : ""}.
							</p>
							<p className="mb-4 text-muted-foreground text-sm">
								Collaborative albums credit each listed artist. Placement shown
								is their sole finish.
							</p>

							<p className="mb-3 font-medium text-sm">
								{oneTimePlacements.length} one-time artists
							</p>

							<ArtistHighestPlacementTable rows={oneTimePlacements} />
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50OneTimeArtistsPageSkeleton() {
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

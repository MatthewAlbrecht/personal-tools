"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "../../../../../../convex/_generated/api";
import {
	ARTIST_STAT_TIER_OPTIONS,
	type ArtistStatTier,
} from "../../_components/artist-stats-table";
import {
	ArtistUniqueTierTable,
	ArtistUniqueTierTableSkeleton,
} from "../../_components/artist-unique-tier-table";
import { PublicStatsNav } from "../../_components/public-stats-nav";
import { PublicTop50Nav } from "../../_components/public-top-50-nav";

export default function PublicRobsTop50UniqueArtistsPage() {
	return (
		<Suspense fallback={<PublicRobsTop50UniqueArtistsPageSkeleton />}>
			<PublicRobsTop50UniqueArtistsPageInner />
		</Suspense>
	);
}

function PublicRobsTop50UniqueArtistsPageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const searchParams = useSearchParams();
	const tierParam = searchParams?.get("tier") ?? null;

	const [selectedTier, setSelectedTier] = useState<ArtistStatTier>("wins");

	useEffect(() => {
		if (!tierParam) return;
		const matchedTier = ARTIST_STAT_TIER_OPTIONS.find(
			(option) => option.id === tierParam,
		);
		if (matchedTier) {
			setSelectedTier(matchedTier.id);
		}
	}, [tierParam]);

	const uniqueTierPlacements = useQuery(
		api.robRankings.getPublishedArtistUniqueTierPlacements,
		{ tier: selectedTier },
	);

	const isLoadingYears = publishedYears === undefined;
	const isLoadingPlacements = uniqueTierPlacements === undefined;
	const yearRangeLabel = formatPublishedYearRange(publishedYears ?? []);
	const activeTierOption = ARTIST_STAT_TIER_OPTIONS.find(
		(option) => option.id === selectedTier,
	);

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
								Loading unique artists…
							</p>
							<ArtistUniqueTierTableSkeleton />
						</>
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : (
						<>
							<p className="mb-2 text-muted-foreground text-sm">
								Unique artists with at least one finish in each tier
								{yearRangeLabel ? ` (${yearRangeLabel})` : ""}.
							</p>
							<p className="mb-4 text-muted-foreground text-sm">
								Collaborative albums credit each listed artist. Placement shown
								is their best finish within the selected tier.
							</p>

							<div className="mb-6 flex flex-wrap gap-2">
								{ARTIST_STAT_TIER_OPTIONS.map((option) => (
									<button
										key={option.id}
										type="button"
										onClick={() => setSelectedTier(option.id)}
										className={cn(
											"rounded-full border px-3 py-1 text-sm transition-colors",
											selectedTier === option.id
												? "border-primary bg-primary text-primary-foreground"
												: "hover:bg-muted",
										)}
									>
										{option.label}
									</button>
								))}
							</div>

							{activeTierOption && uniqueTierPlacements && (
								<p className="mb-3 font-medium text-sm">
									{uniqueTierPlacements.length} unique artists in{" "}
									{activeTierOption.label}
								</p>
							)}

							<ArtistUniqueTierTable
								rows={uniqueTierPlacements ?? []}
								tier={selectedTier}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50UniqueArtistsPageSkeleton() {
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
					<ArtistUniqueTierTableSkeleton />
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

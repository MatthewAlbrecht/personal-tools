"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "../../../../../convex/_generated/api";
import {
	ARTIST_STAT_TIER_OPTIONS,
	type ArtistStatTier,
	ArtistStatsTable,
	ArtistStatsTableSkeleton,
} from "../_components/artist-stats-table";
import { PublicStatsNav } from "../_components/public-stats-nav";
import { PublicTop50Nav } from "../_components/public-top-50-nav";

export default function PublicRobsTop50StatsPage() {
	return (
		<Suspense fallback={<PublicRobsTop50StatsPageSkeleton />}>
			<PublicRobsTop50StatsPageInner />
		</Suspense>
	);
}

function PublicRobsTop50StatsPageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const artistStats = useQuery(api.robRankings.getPublishedArtistStats, {});
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

	const isLoadingYears = publishedYears === undefined;
	const isLoadingStats = artistStats === undefined;
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

					{isLoadingYears || isLoadingStats ? (
						<>
							<p className="mb-4 text-muted-foreground text-sm">
								Loading artist stats…
							</p>
							<ArtistStatsTableSkeleton />
						</>
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : !artistStats || artistStats.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No artist stats available yet.
						</p>
					) : (
						<>
							<p className="mb-2 text-muted-foreground text-sm">
								Artist stats across all published years
								{yearRangeLabel ? ` (${yearRangeLabel})` : ""}.
							</p>
							<p className="mb-4 text-muted-foreground text-sm">
								Collaborative albums credit each listed artist.
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

							{activeTierOption && (
								<p className="mb-3 font-medium text-sm">
									Most {activeTierOption.countLabel.toLowerCase()} finishes
								</p>
							)}

							<ArtistStatsTable rows={artistStats} tier={selectedTier} />
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50StatsPageSkeleton() {
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
					<ArtistStatsTableSkeleton />
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

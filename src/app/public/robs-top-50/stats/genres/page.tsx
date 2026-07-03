"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "../../../../../../convex/_generated/api";
import { PublicStatsNav } from "../../_components/public-stats-nav";
import { PublicTop50Nav } from "../../_components/public-top-50-nav";
import {
	TopLevelGenreCountsTable,
	TopLevelGenreCountsTableSkeleton,
} from "../../_components/top-level-genre-counts-table";

export default function PublicRobsTop50GenreStatsPage() {
	return (
		<Suspense fallback={<PublicRobsTop50GenreStatsPageSkeleton />}>
			<PublicRobsTop50GenreStatsPageInner />
		</Suspense>
	);
}

function PublicRobsTop50GenreStatsPageInner() {
	const router = useRouter();
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const searchParams = useSearchParams();
	const yearParam = searchParams?.get("year") ?? null;
	const activeYear = getActivePublishedYear(publishedYears ?? [], yearParam);

	const genreSummary = useQuery(
		api.robRankings.getPublishedTopLevelGenreCountsForYear,
		activeYear !== null ? { year: activeYear } : "skip",
	);

	const isLoadingYears = publishedYears === undefined;
	const isLoadingGenres = activeYear !== null && genreSummary === undefined;

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

					{isLoadingYears ? (
						<TopLevelGenreCountsTableSkeleton />
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : (
						<>
							<div className="mb-6 flex flex-wrap gap-2">
								{publishedYears.map((entry) => (
									<button
										key={entry.year}
										type="button"
										onClick={() =>
											router.replace(getGenreStatsYearHref(entry.year))
										}
										className={cn(
											"rounded-full border px-3 py-1 text-sm transition-colors",
											activeYear === entry.year
												? "border-primary bg-primary text-primary-foreground"
												: "hover:bg-muted",
										)}
									>
										{entry.year}
									</button>
								))}
							</div>

							{isLoadingGenres ? (
								<TopLevelGenreCountsTableSkeleton />
							) : genreSummary && genreSummary.totalAlbums > 0 ? (
								<>
									<p className="mb-2 text-muted-foreground text-sm">
										Top-level RYM genre counts for {genreSummary.year}.
									</p>
									<p className="mb-4 text-muted-foreground text-sm">
										{genreSummary.albumsWithGenreData} /{" "}
										{genreSummary.totalAlbums} albums have genre data;{" "}
										{genreSummary.albumsMissingGenreData} missing.
									</p>
									<TopLevelGenreCountsTable rows={genreSummary.genres} />
								</>
							) : (
								<p className="text-muted-foreground text-sm">
									No albums for this year.
								</p>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50GenreStatsPageSkeleton() {
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
					<TopLevelGenreCountsTableSkeleton />
				</CardContent>
			</Card>
		</main>
	);
}

function getActivePublishedYear(
	publishedYears: Array<{ year: number; publishedAt?: number }>,
	yearParam: string | null,
): number | null {
	if (publishedYears.length === 0) return null;

	const paramYear = yearParam ? Number(yearParam) : null;
	if (
		paramYear &&
		!Number.isNaN(paramYear) &&
		publishedYears.some((entry) => entry.year === paramYear)
	) {
		return paramYear;
	}

	return publishedYears[0]?.year ?? null;
}

function getGenreStatsYearHref(year: number): string {
	return `/public/robs-top-50/stats/genres?year=${year}`;
}

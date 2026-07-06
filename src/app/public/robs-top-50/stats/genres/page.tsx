"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Slider } from "~/components/ui/slider";
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
	const topParam = searchParams?.get("top") ?? null;
	const isAllYears = yearParam === "all";
	const activeYear = isAllYears
		? null
		: getActivePublishedYear(publishedYears ?? [], yearParam);
	const activeView: GenreStatsView | null = isAllYears ? "all" : activeYear;
	const activeYearTopCount = getActiveYearTopCount(topParam);
	const activeAllYearsTopCount = getActiveAllYearsTopCount(topParam);
	const activeTopCount = isAllYears
		? activeAllYearsTopCount
		: activeYearTopCount;
	const topCountOptions = isAllYears
		? ALL_YEARS_TOP_COUNT_OPTIONS
		: YEAR_TOP_COUNT_OPTIONS;
	const activeTopCountIndex = isAllYears
		? ALL_YEARS_TOP_COUNT_OPTIONS.indexOf(activeAllYearsTopCount)
		: YEAR_TOP_COUNT_OPTIONS.indexOf(activeYearTopCount);
	const [sliderTopCountIndex, setSliderTopCountIndex] =
		useState(activeTopCountIndex);

	useEffect(() => {
		setSliderTopCountIndex(activeTopCountIndex);
	}, [activeTopCountIndex]);

	const yearGenreSummary = useQuery(
		api.robRankings.getPublishedTopLevelGenreCountsForYear,
		!isAllYears && activeYear !== null
			? { year: activeYear, topCount: activeYearTopCount }
			: "skip",
	);
	const allYearsGenreSummary = useQuery(
		api.robRankings.getPublishedTopLevelGenreCountsForAllYears,
		isAllYears ? { topCount: activeAllYearsTopCount } : "skip",
	);
	const genreSummary = isAllYears ? allYearsGenreSummary : yearGenreSummary;

	const isLoadingYears = publishedYears === undefined;
	const isLoadingGenres = activeView !== null && genreSummary === undefined;

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
								<button
									type="button"
									onClick={() =>
										router.replace(getGenreStatsHref("all", activeTopCount))
									}
									className={cn(
										"rounded-full border px-3 py-1 text-sm transition-colors",
										isAllYears
											? "border-primary bg-primary text-primary-foreground"
											: "hover:bg-muted",
									)}
								>
									All
								</button>
								{publishedYears.map((entry) => (
									<button
										key={entry.year}
										type="button"
										onClick={() =>
											router.replace(
												getGenreStatsHref(
													entry.year,
													toYearTopCount(activeTopCount),
												),
											)
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
									<div className="mb-6 space-y-3 rounded-md border bg-background px-3 py-3">
										<div className="flex items-baseline justify-between gap-3">
											<p className="font-medium text-sm">Placement range</p>
										<span
											aria-live="polite"
											className="text-muted-foreground text-sm"
										>
											Top{" "}
											{topCountOptions[sliderTopCountIndex] ?? activeTopCount}
										</span>
										</div>
										<Slider
											aria-label="Filter genre counts by top placement range"
											max={topCountOptions.length - 1}
											min={0}
											onValueChange={(values) => {
												const nextIndex = values[0];
												if (nextIndex !== undefined) {
													setSliderTopCountIndex(nextIndex);
												}
											}}
											onValueCommit={(values) => {
												const nextIndex = values[0];
												if (
													nextIndex === undefined ||
													nextIndex === activeTopCountIndex
												) {
													return;
												}
												const nextTopCount = topCountOptions[nextIndex];
												if (nextTopCount !== undefined && activeView !== null) {
													router.replace(
														getGenreStatsHref(activeView, nextTopCount),
													);
												}
											}}
											step={1}
											value={[sliderTopCountIndex]}
										/>
										<div className="flex justify-between text-muted-foreground text-xs">
											{topCountOptions.map((option) => (
												<span key={option}>Top {option}</span>
											))}
										</div>
									</div>
									<p className="mb-2 text-muted-foreground text-sm">
										{isAllYears
											? "Top-level RYM genre counts across all published years"
											: `Top-level RYM genre counts for ${activeYear}`}
										, using the top {activeTopCount}.
									</p>
									<p className="mb-4 text-muted-foreground text-sm">
										{genreSummary.albumsWithGenreData} /{" "}
										{genreSummary.totalAlbums} albums have genre data;{" "}
										{genreSummary.albumsMissingGenreData} missing.
									</p>
									<TopLevelGenreCountsTable
										rows={genreSummary.genres}
										showAlbumDetails={!isAllYears}
									/>
								</>
							) : (
								<p className="text-muted-foreground text-sm">
									No albums for this selection.
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

const YEAR_TOP_COUNT_OPTIONS = [3, 5, 10, 15, 25, 50] as const;
const ALL_YEARS_TOP_COUNT_OPTIONS = [1, 3, 5, 10, 15, 25, 50] as const;

type YearTopCountOption = (typeof YEAR_TOP_COUNT_OPTIONS)[number];
type AllYearsTopCountOption = (typeof ALL_YEARS_TOP_COUNT_OPTIONS)[number];
type TopCountOption = YearTopCountOption | AllYearsTopCountOption;

type GenreStatsView = "all" | number;

function getActiveYearTopCount(topParam: string | null): YearTopCountOption {
	const paramTopCount = topParam ? Number(topParam) : null;
	const matchedTopCount = YEAR_TOP_COUNT_OPTIONS.find(
		(option) => option === paramTopCount,
	);

	return matchedTopCount ?? 50;
}

function getActiveAllYearsTopCount(
	topParam: string | null,
): AllYearsTopCountOption {
	const paramTopCount = topParam ? Number(topParam) : null;
	const matchedTopCount = ALL_YEARS_TOP_COUNT_OPTIONS.find(
		(option) => option === paramTopCount,
	);

	return matchedTopCount ?? 50;
}

function toYearTopCount(topCount: TopCountOption): YearTopCountOption {
	if (topCount === 1) return 3;
	return topCount;
}

function getGenreStatsHref(
	view: GenreStatsView,
	topCount: TopCountOption,
): string {
	const params = new URLSearchParams({
		year: String(view),
		top: String(topCount),
	});

	return `/public/robs-top-50/stats/genres?${params.toString()}`;
}

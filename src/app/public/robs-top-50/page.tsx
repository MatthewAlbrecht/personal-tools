"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	Top50YearView,
	Top50YearViewSkeleton,
} from "./_components/top-50-year-view";

export default function PublicRobsTop50Page() {
	return (
		<Suspense fallback={<PublicRobsTop50PageSkeleton />}>
			<PublicRobsTop50PageInner />
		</Suspense>
	);
}

function PublicRobsTop50PageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const searchParams = useSearchParams();
	const yearParam = searchParams?.get("year") ?? null;

	const defaultYear = publishedYears?.[0]?.year ?? null;
	const [selectedYear, setSelectedYear] = useState<number | null>(null);

	useEffect(() => {
		if (selectedYear !== null) return;
		if (!publishedYears || publishedYears.length === 0) return;

		const paramYear = yearParam ? Number(yearParam) : null;
		if (
			paramYear &&
			!Number.isNaN(paramYear) &&
			publishedYears.some((y) => y.year === paramYear)
		) {
			setSelectedYear(paramYear);
			return;
		}

		if (defaultYear !== null) {
			setSelectedYear(defaultYear);
		}
	}, [publishedYears, yearParam, defaultYear, selectedYear]);

	const activeYear = selectedYear ?? defaultYear;

	const albums = useQuery(
		api.robRankings.getPublishedAlbumsForYear,
		activeYear !== null ? { year: activeYear } : "skip",
	);

	const isLoadingYears = publishedYears === undefined;
	const isLoadingAlbums = activeYear !== null && albums === undefined;

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
					{isLoadingYears ? (
						<Top50YearViewSkeleton />
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : (
						<>
							<div className="mb-6 flex flex-wrap gap-2">
								{publishedYears.map((y) => (
									<button
										key={y.year}
										type="button"
										onClick={() => setSelectedYear(y.year)}
										className={cn(
											"rounded-full border px-3 py-1 text-sm transition-colors",
											activeYear === y.year
												? "border-primary bg-primary text-primary-foreground"
												: "hover:bg-muted",
										)}
									>
										{y.year}
									</button>
								))}
							</div>

							{isLoadingAlbums ? (
								<Top50YearViewSkeleton />
							) : albums && albums.length > 0 ? (
								<Top50YearView albums={albums} />
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

function PublicRobsTop50PageSkeleton() {
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
					<Top50YearViewSkeleton />
				</CardContent>
			</Card>
		</main>
	);
}

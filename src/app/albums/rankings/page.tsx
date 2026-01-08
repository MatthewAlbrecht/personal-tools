"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import {
	TIER_ORDER,
	type TierName,
	extractReleaseYear,
	getRatingsForTier,
} from "~/lib/album-tiers";
import { api } from "../../../../convex/_generated/api";
import { RankingsView } from "../_components/rankings-view";
import { useAlbums } from "../_context/albums-context";

export default function RankingsPage() {
	const { userId, yearFilter, setYearFilter, updateAlbumRating } = useAlbums();

	// Fetch all user albums
	const userAlbums = useQuery(
		api.spotify.getUserAlbums,
		userId ? { userId } : "skip",
	);

	// Filter and group albums by tier
	const { albumsByTier, availableYears } = useMemo(() => {
		if (!userAlbums)
			return { albumsByTier: new Map(), availableYears: [] as number[] };

		const years = new Set<number>();
		for (const ua of userAlbums) {
			const year = extractReleaseYear(ua.album?.releaseDate);
			if (year) years.add(year);
		}
		const sortedYears = Array.from(years).sort((a, b) => b - a);

		// Determine effective year filter - use most recent year with rated albums if not set
		const effectiveYearFilter =
			yearFilter ?? sortedYears[0]?.toString() ?? "all";

		const filtered = userAlbums.filter((ua) => {
			if (!ua.rating) return false;
			if (effectiveYearFilter === "all") return true;
			const year = extractReleaseYear(ua.album?.releaseDate);
			return year?.toString() === effectiveYearFilter;
		});

		const byTier = new Map<
			TierName,
			{ high: typeof filtered; med: typeof filtered; low: typeof filtered }
		>();
		for (const tier of TIER_ORDER) {
			const ratings = getRatingsForTier(tier);
			byTier.set(tier, {
				high: filtered.filter((ua) => ua.rating === ratings.high),
				med: filtered.filter((ua) => ua.rating === ratings.med),
				low: filtered.filter((ua) => ua.rating === ratings.low),
			});
		}

		return { albumsByTier: byTier, availableYears: sortedYears };
	}, [userAlbums, yearFilter]);

	// Initialize yearFilter to most recent year once we have data
	const resolvedYearFilter =
		yearFilter ?? availableYears[0]?.toString() ?? "all";

	return (
		<RankingsView
			albumsByTier={albumsByTier}
			availableYears={availableYears}
			yearFilter={resolvedYearFilter}
			onYearFilterChange={setYearFilter}
			isLoading={userAlbums === undefined}
			onUpdateRating={updateAlbumRating}
		/>
	);
}

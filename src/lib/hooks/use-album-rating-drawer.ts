"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AlbumToRate } from "~/lib/album-rating-types";

export function useAlbumRatingDrawer({
	userId,
	fallbackYear,
}: {
	userId: string | null;
	/** Used when the album has no release year (albums rankings year filter). */
	fallbackYear?: number | null;
}) {
	const [albumToRate, setAlbumToRate] = useState<AlbumToRate | null>(null);

	const albumToRateYear = albumToRate?.releaseDate
		? Number.parseInt(albumToRate.releaseDate.substring(0, 4), 10)
		: null;
	const yearForRanker =
		albumToRateYear ??
		fallbackYear ??
		new Date().getFullYear();

	const ratedAlbumsForYear = useQuery(
		api.spotify.getRatedAlbumsForYear,
		userId ? { userId, year: yearForRanker } : "skip",
	);

	const updateAlbumRatingMutation = useMutation(api.spotify.updateAlbumRating);

	const openRatingDrawer = useCallback((album: AlbumToRate) => {
		setAlbumToRate(album);
	}, []);

	const closeRatingDrawer = useCallback(() => {
		setAlbumToRate(null);
	}, []);

	const handleSaveRating = useCallback(
		async (rating: number, position: number) => {
			if (!albumToRate) return;

			const albumName = albumToRate.name;
			const userAlbumId = albumToRate.userAlbumId as Id<"userAlbums">;
			setAlbumToRate(null);

			try {
				await updateAlbumRatingMutation({
					userAlbumId,
					rating,
					position,
				});
				toast.success(`Rated "${albumName}"`);
			} catch (error) {
				console.error("Failed to save rating:", error);
				toast.error("Failed to save rating");
			}
		},
		[albumToRate, updateAlbumRatingMutation],
	);

	return {
		albumToRate,
		openRatingDrawer,
		closeRatingDrawer,
		handleSaveRating,
		ratedAlbumsForYear,
	};
}

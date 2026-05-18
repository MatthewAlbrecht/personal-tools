"use client";

import { AlbumRanker } from "~/app/albums/_components/album-ranker";
import type { AlbumToRate, RankedAlbumForYear } from "~/lib/album-rating-types";

export function AlbumRatingDrawer({
	albumToRate,
	ratedAlbumsForYear,
	open,
	onOpenChange,
	onSave,
}: {
	albumToRate: AlbumToRate | null;
	ratedAlbumsForYear: RankedAlbumForYear[] | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (rating: number, position: number) => void;
}) {
	if (!ratedAlbumsForYear) {
		return null;
	}

	return (
		<AlbumRanker
			albumToRate={albumToRate}
			existingRankedAlbums={ratedAlbumsForYear}
			open={open}
			onOpenChange={onOpenChange}
			onSave={onSave}
		/>
	);
}

import type { AlbumToRate } from "~/lib/album-rating-types";
import type { ForLaterAlbumRowData } from "./types";

export function albumToRateFromForLaterRow(
	row: ForLaterAlbumRowData,
): AlbumToRate | null {
	if (!row.userAlbumId) {
		return null;
	}

	return {
		userAlbumId: row.userAlbumId,
		albumId: row.albumId,
		name: row.name,
		artistName: row.artistName,
		...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
		...(row.releaseDate ? { releaseDate: row.releaseDate } : {}),
		...(row.rating !== undefined ? { currentRating: row.rating } : {}),
	};
}

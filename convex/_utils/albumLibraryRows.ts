export type AlbumLibraryRymStatus = "all" | "linked" | "unlinked";
export type AlbumLibraryRobRankingStatus = "all" | "appears" | "not_appears";
export type AlbumLibraryListenStatus = "all" | "listened" | "unlistened";
export type AlbumLibraryAlbumType = "all" | "album" | "single";

export type AlbumLibraryFilters = {
	search?: string;
	rymStatus?: AlbumLibraryRymStatus;
	robRankingStatus?: AlbumLibraryRobRankingStatus;
	listenStatus?: AlbumLibraryListenStatus;
	albumType?: AlbumLibraryAlbumType;
	releaseYear?: number;
};

export type AlbumLibraryFilterInput = {
	name: string;
	artistName: string;
	releaseYear?: number;
	albumType: Exclude<AlbumLibraryAlbumType, "all">;
	listenCount: number;
	rymStatus: Exclude<AlbumLibraryRymStatus, "all">;
	appearsInRobRankings: boolean;
};

export function getAlbumLibraryAlbumType(
	totalTracks: number | undefined,
): "album" | "single" {
	return totalTracks !== undefined && totalTracks <= 2 ? "single" : "album";
}

export function getAlbumLibraryRymStatus(
	hasRymLink: boolean,
): "linked" | "unlinked" {
	return hasRymLink ? "linked" : "unlinked";
}

export function rowMatchesAlbumLibraryFilters(
	row: AlbumLibraryFilterInput,
	filters: AlbumLibraryFilters,
): boolean {
	if (
		filters.releaseYear !== undefined &&
		row.releaseYear !== filters.releaseYear
	) {
		return false;
	}

	if (
		filters.rymStatus !== undefined &&
		filters.rymStatus !== "all" &&
		row.rymStatus !== filters.rymStatus
	) {
		return false;
	}

	if (
		filters.albumType !== undefined &&
		filters.albumType !== "all" &&
		row.albumType !== filters.albumType
	) {
		return false;
	}

	if (filters.robRankingStatus === "appears" && !row.appearsInRobRankings) {
		return false;
	}

	if (filters.robRankingStatus === "not_appears" && row.appearsInRobRankings) {
		return false;
	}

	if (filters.listenStatus === "listened" && row.listenCount <= 0) {
		return false;
	}

	if (filters.listenStatus === "unlistened" && row.listenCount > 0) {
		return false;
	}

	const search = filters.search?.trim().toLowerCase();
	if (search) {
		const searchableText = `${row.name}\n${row.artistName}`.toLowerCase();
		if (!searchableText.includes(search)) {
			return false;
		}
	}

	return true;
}

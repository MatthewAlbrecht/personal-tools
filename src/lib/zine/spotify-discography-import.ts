import type { ZineDiscographyItem } from "./zine-inside-back-sections";

export type SpotifyDiscographyRelease = {
	spotifyAlbumId: string;
	albumTitle: string;
	artistName: string;
	year?: string;
	imageUrl?: string;
	albumType: "album" | "single" | "compilation";
	releaseDate: string;
	totalTracks: number;
};

export type DiscographyAlbumUpsertInput = {
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks: number;
};

export function extractReleaseYear(releaseDate: string): string | undefined {
	const trimmed = releaseDate.trim();
	if (trimmed === "") {
		return undefined;
	}

	return trimmed.slice(0, 4);
}

export function filterDiscographyReleases(
	releases: SpotifyDiscographyRelease[],
	excludeSpotifyAlbumId?: string,
): SpotifyDiscographyRelease[] {
	return releases.filter((release) => {
		if (release.albumType === "single") {
			return false;
		}

		if (
			excludeSpotifyAlbumId &&
			release.spotifyAlbumId === excludeSpotifyAlbumId
		) {
			return false;
		}

		return true;
	});
}

export function mergeSpotifyDiscographyImport(
	existingItems: ZineDiscographyItem[],
	releases: SpotifyDiscographyRelease[],
	excludeSpotifyAlbumId?: string,
): ZineDiscographyItem[] {
	const filtered = filterDiscographyReleases(releases, excludeSpotifyAlbumId);
	const existingBySpotifyId = new Map(
		existingItems
			.filter((item) => item.spotifyAlbumId)
			.map((item) => [item.spotifyAlbumId as string, item]),
	);
	const manualItems = existingItems.filter((item) => !item.spotifyAlbumId);

	const importedItems = filtered.map((release) => {
		const existing = existingBySpotifyId.get(release.spotifyAlbumId);

		return {
			spotifyAlbumId: release.spotifyAlbumId,
			albumTitle: release.albumTitle,
			artistName: release.artistName,
			year: release.year,
			imageUrl: existing?.imageUrl ?? release.imageUrl,
			blurb: existing?.blurb ?? "",
			hidden: existing?.hidden,
		};
	});

	return [...importedItems, ...manualItems];
}

export function mapDiscographyReleasesToAlbumUpserts(
	releases: SpotifyDiscographyRelease[],
	excludeSpotifyAlbumId?: string,
): DiscographyAlbumUpsertInput[] {
	return filterDiscographyReleases(releases, excludeSpotifyAlbumId).map(
		(release) => ({
			spotifyAlbumId: release.spotifyAlbumId,
			name: release.albumTitle,
			artistName: release.artistName,
			imageUrl: release.imageUrl,
			releaseDate: release.releaseDate,
			totalTracks: release.totalTracks,
		}),
	);
}

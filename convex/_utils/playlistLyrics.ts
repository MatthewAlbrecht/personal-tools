export type ScrapeDisplayFields = {
	songTitle: string;
	artistName: string;
	albumTitle?: string;
};

export type PlaylistDisplayOverrides = {
	songTitleOverride?: string;
	artistNameOverride?: string;
	albumTitleOverride?: string;
};

export function normalizeGeniusSongUrl(input: string): string {
	let url: URL;

	try {
		url = new URL(input.trim());
	} catch {
		throw new Error("Enter a valid URL");
	}

	const hostname = url.hostname.toLowerCase();
	if (hostname !== "genius.com" && hostname !== "www.genius.com") {
		throw new Error("URL must be from genius.com");
	}

	const pathname = url.pathname.replace(/\/+$/, "");

	if (!pathname.endsWith("-lyrics")) {
		throw new Error("URL must be a Genius song lyrics page");
	}

	return `https://genius.com${pathname}`;
}

export function buildPlaylistSongDisplay({
	scrape,
	item,
}: {
	scrape: ScrapeDisplayFields;
	item: PlaylistDisplayOverrides;
}): Required<ScrapeDisplayFields> {
	return {
		songTitle: item.songTitleOverride?.trim() || scrape.songTitle,
		artistName: item.artistNameOverride?.trim() || scrape.artistName,
		albumTitle: item.albumTitleOverride?.trim() || scrape.albumTitle || "",
	};
}

export function sortPlaylistItems<T extends { position: number }>(
	items: T[],
): T[] {
	return [...items].sort((a, b) => a.position - b.position);
}

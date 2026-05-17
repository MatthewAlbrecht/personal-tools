const GOOGLE_SEARCH_ORIGIN = "https://www.google.com/search";

/** Plain Google web search (results page only — no `btnI` redirect). */
export function buildGoogleRateYourMusicSearchUrl(args: {
	artistName: string;
	albumName: string;
}): string {
	const parts = [
		args.artistName.trim(),
		args.albumName.trim(),
		"rate your music",
	].filter((s) => s.length > 0);
	const q = parts.join(" ").replace(/\s+/g, " ").trim();
	const params = new URLSearchParams({ q });
	return `${GOOGLE_SEARCH_ORIGIN}?${params.toString()}`;
}

/** First `limit` filtered rows that lack an `rymUrl`, each opening a normal Google results URL. */
export function buildOpenableGoogleRymSearchLinks(
	rows: Array<{
		id: string;
		artistName: string;
		name: string;
		rymUrl?: string;
	}>,
	limit: number,
): Array<{ id: string; url: string }> {
	const cappedLimit = Math.min(Math.max(limit, 1), 20);
	const links: Array<{ id: string; url: string }> = [];

	for (const row of rows) {
		if (row.rymUrl?.trim()) {
			continue;
		}
		links.push({
			id: row.id,
			url: buildGoogleRateYourMusicSearchUrl({
				artistName: row.artistName,
				albumName: row.name,
			}),
		});
		if (links.length >= cappedLimit) {
			break;
		}
	}

	return links;
}

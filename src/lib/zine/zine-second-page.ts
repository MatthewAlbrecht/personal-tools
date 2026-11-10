/** Rough characters per rendered row in a 2-column zine page at 9pt, used to weigh long lines. */
const CHARS_PER_ROW = 40;

/**
 * Share of a track's lyrics for its first page. The first page carries the title and
 * metadata (and the art, when shown) while the continued page carries the credits, so
 * the first page holds a bit less when there is art. Measured from real zine pages.
 */
export function getSecondPageFirstShare({
	hasAlbumArt,
}: {
	hasAlbumArt: boolean;
}): number {
	return hasAlbumArt ? 0.46 : 0.52;
}

/**
 * Split lyrics across two zine pages at the stanza break (blank line) closest to
 * `firstPageShare` of the track. Returns null when there is no stanza break to split at.
 */
export function splitLyricsForSecondPage(
	lyrics: string,
	firstPageShare: number,
): { first: string; second: string } | null {
	const stanzas = lyrics
		.trim()
		.split(/\n[ \t]*\n+/)
		.map((stanza) => stanza.replace(/^\n+|\n+$/g, ""))
		.filter((stanza) => stanza.trim() !== "");
	if (stanzas.length < 2) return null;

	const weights = stanzas.map(stanzaWeight);
	const total =
		weights.reduce((sum, weight) => sum + weight, 0) + (stanzas.length - 1);
	const target = total * firstPageShare;

	let splitAfter = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	let cumulative = 0;
	for (let index = 0; index < stanzas.length - 1; index++) {
		cumulative += (weights[index] ?? 0) + (index > 0 ? 1 : 0);
		const distance = Math.abs(cumulative - target);
		if (distance < bestDistance) {
			bestDistance = distance;
			splitAfter = index;
		}
	}

	return {
		first: stanzas.slice(0, splitAfter + 1).join("\n\n"),
		second: stanzas.slice(splitAfter + 1).join("\n\n"),
	};
}

function stanzaWeight(stanza: string): number {
	return stanza
		.split("\n")
		.reduce(
			(sum, line) => sum + 1 + Math.floor(line.trim().length / CHARS_PER_ROW),
			0,
		);
}

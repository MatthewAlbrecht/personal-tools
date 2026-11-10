type Rect = { left: number; top: number; right: number; bottom: number };

/** Rounding slack (px) for rects sitting exactly on the lyrics area's edge. */
const EDGE_SLACK_PX = 1;

/**
 * For a track's first page, which renders all its lyrics into a fixed-height column box:
 * the first lyric line (index into `lyrics.split("\n")`) drawn even partly outside the
 * visible area — past the bottom, or spilled into a clipped extra column. Everything from
 * that line on belongs on the continued page. Returns `lineCount` when everything fits.
 */
export function findFirstOverflowLine(
	lines: Array<{ line: number; rects: Rect[] }>,
	clip: Rect,
	lineCount: number,
): number {
	let firstOverflow = lineCount;
	for (const { line, rects } of lines) {
		const outside = rects.some(
			(rect) =>
				rect.right > clip.right + EDGE_SLACK_PX ||
				rect.bottom > clip.bottom + EDGE_SLACK_PX ||
				rect.left < clip.left - EDGE_SLACK_PX,
		);
		if (outside && line < firstOverflow) {
			firstOverflow = line;
		}
	}
	return firstOverflow;
}

/** The lyrics from `cutLine` on (index into `lyrics.split("\n")`), without leading blank lines. */
export function lyricsFromLine(lyrics: string, cutLine: number): string {
	const rest = lyrics.split("\n").slice(cutLine);
	while (rest.length > 0 && rest[0]?.trim() === "") {
		rest.shift();
	}
	return rest.join("\n");
}

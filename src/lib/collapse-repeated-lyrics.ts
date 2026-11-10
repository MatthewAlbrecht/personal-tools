const MAX_BLOCK_LINES = 4;

/**
 * Collapse lines or short blocks (up to 4 lines) repeated back to back into one
 * copy, with " (Nx)" on its last line. Blank lines and `[Section]` labels are never
 * part of a block, so repeats don't merge across stanzas.
 */
export function collapseRepeatedLyrics(lyrics: string): string {
	const lines = lyrics.split("\n");
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		let bestSize = 1;
		let bestCount = 1;
		let bestSaved = 0;

		for (let size = 1; size <= MAX_BLOCK_LINES; size++) {
			const block = lines.slice(i, i + size);
			if (block.length < size || block.some(isBoundaryLine)) break;

			let count = 1;
			while (blockMatches(lines, i, i + count * size, size)) count++;

			const saved = size * (count - 1);
			if (saved > bestSaved) {
				bestSize = size;
				bestCount = count;
				bestSaved = saved;
			}
		}

		const block = lines.slice(i, i + bestSize);
		if (bestCount > 1) {
			block[block.length - 1] = `${block[block.length - 1]} (${bestCount}x)`;
		}
		out.push(...block);
		i += bestSize * bestCount;
	}

	return out.join("\n");
}

function isBoundaryLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed === "" || /^\[.*\]$/.test(trimmed);
}

function blockMatches(
	lines: string[],
	start: number,
	candidate: number,
	size: number,
): boolean {
	if (candidate + size > lines.length) return false;
	for (let offset = 0; offset < size; offset++) {
		if (lines[start + offset] !== lines[candidate + offset]) return false;
	}
	return true;
}

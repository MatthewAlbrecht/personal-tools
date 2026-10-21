export type TileBox = {
	left: number;
	top: number;
	width: number;
	height: number;
};

/**
 * Where a grid tile dragged by (`dx`, `dy`) px would drop: the slot whose
 * centre is nearest the dragged tile's centre, so the ends of the grid are
 * always reachable.
 */
export function gridDragTarget(
	tiles: readonly TileBox[],
	fromIndex: number,
	dx: number,
	dy: number,
): number {
	const from = tiles[fromIndex];
	if (!from) return fromIndex;
	const x = from.left + from.width / 2 + dx;
	const y = from.top + from.height / 2 + dy;
	let best = fromIndex;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [index, tile] of tiles.entries()) {
		const distance = Math.hypot(
			tile.left + tile.width / 2 - x,
			tile.top + tile.height / 2 - y,
		);
		if (distance < bestDistance) {
			best = index;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * How far tile `index` moves to make room while another tile is dragged from
 * `fromIndex` to `toIndex`: one slot back or forward when it's in between.
 */
export function gridShift(
	tiles: readonly TileBox[],
	fromIndex: number,
	toIndex: number,
	index: number,
): { x: number; y: number } {
	let target = index;
	if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
		target = index - 1;
	} else if (toIndex < fromIndex && index >= toIndex && index < fromIndex) {
		target = index + 1;
	}
	const tile = tiles[index];
	const slot = tiles[target];
	if (!tile || !slot || target === index) return { x: 0, y: 0 };
	return { x: slot.left - tile.left, y: slot.top - tile.top };
}

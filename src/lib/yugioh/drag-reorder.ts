export type RowBox = { top: number; height: number };

/**
 * Where a row dragged by `offset` px would drop. The offset is clamped so the
 * row stays inside the list; the row takes another row's slot once its
 * leading edge reaches that row's middle, so the ends are reachable at the clamp.
 */
export function dragTarget(
	rows: readonly RowBox[],
	fromIndex: number,
	offset: number,
): { offset: number; toIndex: number } {
	const from = rows[fromIndex];
	const first = rows[0];
	const last = rows[rows.length - 1];
	if (!from || !first || !last) return { offset: 0, toIndex: fromIndex };
	const clamped = Math.min(
		Math.max(offset, first.top - from.top),
		last.top + last.height - (from.top + from.height),
	);
	// The leading edge decides: the bottom when moving down, the top when up.
	const top = from.top + clamped;
	const bottom = top + from.height;
	let toIndex = fromIndex;
	for (const [index, row] of rows.entries()) {
		const middle = row.top + row.height / 2;
		if (index < fromIndex && top <= middle) {
			toIndex = index;
			break;
		}
		if (index > fromIndex && bottom >= middle) toIndex = index;
	}
	return { offset: clamped, toIndex };
}

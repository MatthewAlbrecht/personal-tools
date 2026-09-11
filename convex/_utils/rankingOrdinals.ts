export function compareManualRank(
	a: { rating: number | null; position: number | null },
	b: { rating: number | null; position: number | null },
): number {
	const ratingA = a.rating ?? Number.NEGATIVE_INFINITY;
	const ratingB = b.rating ?? Number.NEGATIVE_INFINITY;
	if (ratingA !== ratingB) {
		return ratingB - ratingA;
	}

	const positionA = a.position ?? Number.POSITIVE_INFINITY;
	const positionB = b.position ?? Number.POSITIVE_INFINITY;
	return positionA - positionB;
}

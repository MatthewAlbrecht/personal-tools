export type ManualRankItem = {
	_id: string;
	rating: number | null;
	position: number | null;
	releaseYear: number | null;
};

export type OrdinalBand =
	| "hero"
	| "podium"
	| "top5"
	| "top10"
	| "top25"
	| "top50"
	| "edge"
	| "rest";

export type FramedManualBoard<T> = {
	top50: Array<T & { ordinal: number }>;
	edge51to65: Array<T & { ordinal: number }>;
	rest: Array<T & { ordinal: number }>;
};

export function compareManualRank(
	a: Pick<ManualRankItem, "rating" | "position">,
	b: Pick<ManualRankItem, "rating" | "position">,
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

export function assignOrdinals<T>(items: T[]): Array<T & { ordinal: number }> {
	return items.map((item, index) => ({
		...item,
		ordinal: index + 1,
	}));
}

export function frameManualBoard<T extends { ordinal: number }>(
	items: T[],
	opts: { fullYear: boolean },
): FramedManualBoard<T> {
	const top50 = items.slice(0, 50);
	const edge51to65 = items.slice(50, 65);
	const rest = opts.fullYear ? items.slice(65) : [];

	return { top50, edge51to65, rest };
}

export function decadeLabel(ordinal: number): string {
	if (ordinal >= 61 && ordinal <= 65) {
		return "61–65";
	}
	if (ordinal >= 66 && ordinal <= 70) {
		return "66–70";
	}

	const start = Math.floor((ordinal - 1) / 10) * 10 + 1;
	const end = start + 9;
	return `${start}–${end}`;
}

export function bandForOrdinal(ordinal: number): OrdinalBand {
	if (ordinal === 1) {
		return "hero";
	}
	if (ordinal <= 3) {
		return "podium";
	}
	if (ordinal <= 5) {
		return "top5";
	}
	if (ordinal <= 10) {
		return "top10";
	}
	if (ordinal <= 25) {
		return "top25";
	}
	if (ordinal <= 50) {
		return "top50";
	}
	if (ordinal <= 65) {
		return "edge";
	}
	return "rest";
}

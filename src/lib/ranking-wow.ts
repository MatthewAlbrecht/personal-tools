export type WowSignal =
	| { kind: "new" }
	| { kind: "delta"; delta: number }
	| null;

export function wowSignals({
	currentOrdinal,
	priorOrdinal,
	priorInTop50,
}: {
	currentOrdinal: number;
	priorOrdinal: number | null;
	priorInTop50: boolean;
}): WowSignal {
	const wasInPriorTop50 =
		priorInTop50 && priorOrdinal !== null && priorOrdinal <= 50;

	if (currentOrdinal <= 50 && !wasInPriorTop50) {
		return { kind: "new" };
	}

	if (priorOrdinal !== null && priorOrdinal !== currentOrdinal) {
		return { kind: "delta", delta: priorOrdinal - currentOrdinal };
	}

	return null;
}

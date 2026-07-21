export type LibraryForLaterState = {
	firstSeenAt: number;
	lastSeenAt: number;
	playlistAddedAt?: number;
	dismissedAt?: number;
};

export type LibraryForLaterPatch = {
	forLater: LibraryForLaterState;
	isActiveForLater: boolean;
};

export type LibraryForLaterEvent =
	| { type: "observed"; seenAt: number; playlistAddedAt?: number }
	| { type: "dismissed"; dismissedAt: number }
	| { type: "restored" };

export type LegacyForLaterState = {
	firstSeenAt: number;
	lastSeenAt: number;
	playlistAddedAt?: number;
	removedFromForLater?: boolean;
	markedAsSingle?: boolean;
	updatedAt: number;
	creationTime: number;
};

export function deriveIsActiveForLater(
	forLater: LibraryForLaterState | undefined,
): boolean {
	return forLater !== undefined && forLater.dismissedAt === undefined;
}

export function applyLibraryForLaterEvent(
	existing: LibraryForLaterState | undefined,
	event: LibraryForLaterEvent,
): LibraryForLaterPatch {
	if (event.type === "observed") {
		const playlistAddedAt =
			event.playlistAddedAt ?? existing?.playlistAddedAt;
		const forLater: LibraryForLaterState = existing
			? {
					...existing,
					lastSeenAt: Math.max(existing.lastSeenAt, event.seenAt),
					...(playlistAddedAt === undefined ? {} : { playlistAddedAt }),
				}
			: {
					firstSeenAt: event.seenAt,
					lastSeenAt: event.seenAt,
					...(playlistAddedAt === undefined ? {} : { playlistAddedAt }),
				};
		return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
	}

	if (!existing) {
		throw new Error("Cannot change dismissal before an album enters For Later");
	}

	let forLater: LibraryForLaterState;
	if (event.type === "dismissed") {
		forLater = { ...existing, dismissedAt: event.dismissedAt };
	} else {
		const { dismissedAt: _dismissedAt, ...restored } = existing;
		forLater = restored;
	}
	return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
}

export function legacyRowsToLibraryForLater(
	rows: LegacyForLaterState[],
): LibraryForLaterPatch {
	if (rows.length === 0) {
		throw new Error("At least one legacy For Later row is required");
	}
	const ordered = [...rows].sort(
		(a, b) =>
			b.lastSeenAt - a.lastSeenAt ||
			b.updatedAt - a.updatedAt ||
			a.creationTime - b.creationTime,
	);
	const firstSeenAt = Math.min(...rows.map((row) => row.firstSeenAt));
	const playlistAddedAt = rows
		.flatMap((row) =>
			row.playlistAddedAt === undefined ? [] : [row.playlistAddedAt],
		)
		.sort((a, b) => a - b)[0];
	const canonical = ordered[0];
	if (!canonical) {
		throw new Error("At least one legacy For Later row is required");
	}
	const shouldDismiss =
		rows.some((row) => row.removedFromForLater === true) ||
		rows.some((row) => row.markedAsSingle === true);
	const dismissedAt = shouldDismiss
		? Math.max(
				...rows
					.filter(
						(row) =>
							row.removedFromForLater === true || row.markedAsSingle === true,
					)
					.map((row) => row.updatedAt),
			)
		: undefined;
	const forLater: LibraryForLaterState = {
		firstSeenAt,
		lastSeenAt: canonical.lastSeenAt,
		...(playlistAddedAt === undefined ? {} : { playlistAddedAt }),
		...(dismissedAt === undefined ? {} : { dismissedAt }),
	};
	return { forLater, isActiveForLater: deriveIsActiveForLater(forLater) };
}

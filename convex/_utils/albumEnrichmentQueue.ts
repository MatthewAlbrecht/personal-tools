import {
	type EnrichmentSliceKey,
	type SlicePresence,
	missingEnrichmentSlices,
} from "./albumEnrichmentSlices";

export const RECENT_ENRICHMENT_SCAN_LIMIT = 100;

export type ForLaterEligibilityRow = {
	isActive: boolean;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
	filterMarkedAsSingle?: boolean;
	filterRemovedFromForLater?: boolean;
};

export type EnrichmentQueueRow = ForLaterEligibilityRow & {
	key: string;
	albumExists: boolean;
	hasEnrichmentRow: boolean;
	slices?: SlicePresence;
};

type MissingSliceCounts = Record<EnrichmentSliceKey, number>;

export type EnrichmentQueueSummary = {
	activeVisible: number;
	incomplete: number;
	complete: number;
	neverStarted: number;
	partial: number;
	missing: MissingSliceCounts;
	nextClaimableKey?: string;
};

export function isForLaterRowHidden(row: ForLaterEligibilityRow): boolean {
	return (
		row.markedAsSingle === true ||
		row.removedFromForLater === true ||
		row.filterMarkedAsSingle === true ||
		row.filterRemovedFromForLater === true
	);
}

export function isVisibleActiveForLaterRow(
	row: ForLaterEligibilityRow,
): boolean {
	return row.isActive && !isForLaterRowHidden(row);
}

export function selectBoundedVisibleForLaterRows<
	TRow extends ForLaterEligibilityRow,
>(
	rowsWithSentinel: TRow[],
	scanLimit: number,
): { rows: TRow[]; scanned: number; capped: boolean } {
	const boundedRows = rowsWithSentinel.slice(0, scanLimit);
	return {
		rows: boundedRows.filter(isVisibleActiveForLaterRow),
		scanned: boundedRows.length,
		capped: rowsWithSentinel.length > scanLimit,
	};
}

export function summarizeEnrichmentQueue(
	rows: EnrichmentQueueRow[],
): EnrichmentQueueSummary {
	const summary: EnrichmentQueueSummary = {
		activeVisible: 0,
		incomplete: 0,
		complete: 0,
		neverStarted: 0,
		partial: 0,
		missing: {
			artistContext: 0,
			whyListen: 0,
			coverDescriptors: 0,
			occasions: 0,
		},
	};

	for (const row of rows) {
		if (!isVisibleActiveForLaterRow(row) || !row.albumExists) {
			continue;
		}
		summary.activeVisible += 1;
		const missingSlices = missingEnrichmentSlices(row.slices);
		if (missingSlices.length === 0) {
			summary.complete += 1;
			continue;
		}
		summary.incomplete += 1;
		if (row.hasEnrichmentRow) {
			summary.partial += 1;
		} else {
			summary.neverStarted += 1;
		}
		for (const slice of missingSlices) {
			summary.missing[slice] += 1;
		}
		if (summary.nextClaimableKey === undefined) {
			summary.nextClaimableKey = row.key;
		}
	}

	return summary;
}

export function clampQueueLimit(
	value: number | undefined,
	defaultValue: number,
	maxValue: number,
): number {
	if (value === undefined || !Number.isFinite(value)) {
		return defaultValue;
	}
	return Math.min(maxValue, Math.max(1, Math.trunc(value)));
}

export function queuePreviewSpotifyAlbumId(
	forLaterItem: { spotifyAlbumId: string },
	_canonicalAlbum: { spotifyAlbumId: string },
): string {
	return forLaterItem.spotifyAlbumId;
}

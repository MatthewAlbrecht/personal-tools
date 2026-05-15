export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "has_candidate"
	| "no_candidate";
export type ForLaterPlaylistFilter = "active" | "removed" | "all";
export type ForLaterGenreRoleFilter = "primary" | "secondary" | "either";
export type ForLaterDerivedRymStatus =
	| "matched"
	| "candidate"
	| "searching"
	| "not_found"
	| "failed"
	| "not_started";

export type ForLaterUiFilters = {
	genreKey?: string;
	genreRole: ForLaterGenreRoleFilter;
	descriptorKey?: string;
	title?: string;
	artist?: string;
	year?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	playlist: ForLaterPlaylistFilter;
};

export function normalizeForLaterFilters(
	input: Partial<ForLaterUiFilters>,
): ForLaterUiFilters {
	return {
		genreKey: normalizeOptionalString(input.genreKey),
		genreRole: input.genreRole ?? "either",
		descriptorKey: normalizeOptionalString(input.descriptorKey),
		title: normalizeOptionalString(input.title),
		artist: normalizeOptionalString(input.artist),
		year: input.year,
		listened: input.listened ?? "all",
		rymStatus: input.rymStatus ?? "all",
		playlist: input.playlist ?? "active",
	};
}

export function deriveRymStatus(args: {
	rymScrapeId?: unknown;
	rymCandidateUrl?: string;
	rymDiscoveryStatus:
		| "not_started"
		| "queued"
		| "searching"
		| "found"
		| "not_found"
		| "failed";
}): ForLaterDerivedRymStatus {
	if (args.rymScrapeId) {
		return "matched";
	}
	if (args.rymCandidateUrl || args.rymDiscoveryStatus === "found") {
		return "candidate";
	}
	if (
		args.rymDiscoveryStatus === "queued" ||
		args.rymDiscoveryStatus === "searching"
	) {
		return "searching";
	}
	if (args.rymDiscoveryStatus === "not_found") {
		return "not_found";
	}
	if (args.rymDiscoveryStatus === "failed") {
		return "failed";
	}
	return "not_started";
}

export function sortForLaterRows<
	T extends {
		lastSeenAt: number;
		playlistAddedAt?: number;
		createdAt: number;
	},
>(rows: T[]): T[] {
	return [...rows].sort((a, b) => {
		const lastSeenDiff = b.lastSeenAt - a.lastSeenAt;
		if (lastSeenDiff !== 0) return lastSeenDiff;

		const playlistDiff = (b.playlistAddedAt ?? 0) - (a.playlistAddedAt ?? 0);
		if (playlistDiff !== 0) return playlistDiff;

		return b.createdAt - a.createdAt;
	});
}

export function buildOpenableRymLinks(
	rows: Array<{ id: string; rymUrl?: string }>,
	limit: number,
): Array<{ id: string; url: string }> {
	const cappedLimit = Math.min(Math.max(limit, 1), 20);
	const links: Array<{ id: string; url: string }> = [];

	for (const row of rows) {
		if (!row.rymUrl) {
			continue;
		}
		links.push({ id: row.id, url: row.rymUrl });
		if (links.length >= cappedLimit) {
			break;
		}
	}

	return links;
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

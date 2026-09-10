import { extractReleaseYear } from "~/lib/album-tiers";

export type ListenGroup<T> = {
	key: string;
	label: string;
	items: T[];
};

export type FilterListensOptions = {
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	yearMin?: number;
	yearMax?: number;
	ratedAlbumIds: Set<string>;
};

type FilterableListen = {
	albumId: string;
	isFirstListen?: boolean;
	album?: { releaseDate?: string } | null;
};

function startOfLocalDay(date: Date): Date {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

function getMondayStart(ms: number): Date {
	const date = startOfLocalDay(new Date(ms));
	const day = date.getDay();
	const daysFromMonday = day === 0 ? 6 : day - 1;
	date.setDate(date.getDate() - daysFromMonday);
	return date;
}

function formatWeekLabel(start: Date, end: Date): string {
	const startMonth = start.toLocaleDateString("en-US", { month: "short" });
	const endMonth = end.toLocaleDateString("en-US", { month: "short" });
	const startDay = start.getDate();
	const endDay = end.getDate();
	const startYear = start.getFullYear();
	const endYear = end.getFullYear();

	if (startYear !== endYear) {
		return `${startMonth} ${startDay}, ${startYear}–${endMonth} ${endDay}, ${endYear}`;
	}
	if (startMonth !== endMonth) {
		return `${startMonth} ${startDay}–${endMonth} ${endDay}`;
	}
	return `${startMonth} ${startDay}–${endDay}`;
}

function formatWeekKey(monday: Date): string {
	const year = monday.getFullYear();
	const month = String(monday.getMonth() + 1).padStart(2, "0");
	const day = String(monday.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function getWeekRangeKey(ms: number): { key: string; label: string } {
	const monday = getMondayStart(ms);
	const sunday = new Date(monday);
	sunday.setDate(sunday.getDate() + 6);
	return {
		key: formatWeekKey(monday),
		label: formatWeekLabel(monday, sunday),
	};
}

export function groupListensByWeek<T extends { listenedAt: number }>(
	items: T[],
): Array<ListenGroup<T>> {
	const groups = new Map<string, ListenGroup<T>>();

	for (const item of items) {
		const { key, label } = getWeekRangeKey(item.listenedAt);
		const existing = groups.get(key);
		if (existing) {
			existing.items = [...existing.items, item];
		} else {
			groups.set(key, { key, label, items: [item] });
		}
	}

	return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function groupListensByMonth<T extends { listenedAt: number }>(
	items: T[],
): Array<ListenGroup<T>> {
	const groups = new Map<string, ListenGroup<T>>();

	for (const item of items) {
		const date = new Date(item.listenedAt);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const key = `${year}-${month}`;
		const label = date.toLocaleDateString("en-US", {
			month: "long",
			year: "numeric",
		});
		const existing = groups.get(key);
		if (existing) {
			existing.items = [...existing.items, item];
		} else {
			groups.set(key, { key, label, items: [item] });
		}
	}

	return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function filterListens<T extends FilterableListen>(
	items: T[],
	opts: FilterListensOptions,
): T[] {
	// Kept for unit tests / shared predicate docs. Listens UI filters in
	// `listUserAlbumListensPaginated` (denormalized indexes + optional filterWith).
	return items.filter((item) => {
		if (opts.onlyUnranked && opts.ratedAlbumIds.has(item.albumId)) {
			return false;
		}
		if (opts.onlyFirstListens && !item.isFirstListen) {
			return false;
		}
		if (opts.yearMin !== undefined || opts.yearMax !== undefined) {
			const year = extractReleaseYear(item.album?.releaseDate);
			if (year === null) {
				return false;
			}
			if (opts.yearMin !== undefined && year < opts.yearMin) {
				return false;
			}
			if (opts.yearMax !== undefined && year > opts.yearMax) {
				return false;
			}
		}
		return true;
	});
}

export function sectionStats(items: { isFirstListen: boolean }[]): {
	albumCount: number;
	newCount: number;
} {
	let newCount = 0;
	for (const item of items) {
		if (item.isFirstListen) {
			newCount += 1;
		}
	}
	return {
		albumCount: items.length,
		newCount,
	};
}

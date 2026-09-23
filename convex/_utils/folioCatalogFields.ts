export type FolioEdition = "standard" | "limited" | "signed" | "bundle";

export type FolioSeason = {
	seasonKey: string;
	seasonSortKey: string;
	label: string;
};

export type FolioUndatedSeason = {
	seasonKey: "undated";
	seasonSortKey: "0000-00";
	label: "Undated";
};

function normalizeTitle(name: string): string {
	return name
		.replace(/\s*\((?:limited|signed)\s+edition\)\s*/gi, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export function inferEdition(
	name: string,
	hasLaunchOrPublication: boolean,
	productType?: string,
): FolioEdition {
	const lower = name.toLowerCase();

	if (
		lower.includes("(limited edition)") ||
		lower.includes("limited edition")
	) {
		return "limited";
	}

	if (lower.includes("(signed edition)") || lower.includes("signed edition")) {
		return "signed";
	}

	if (productType === "bundle") {
		return "bundle";
	}

	if (/collection\s*$/i.test(name.trim()) && !hasLaunchOrPublication) {
		return "bundle";
	}

	return "standard";
}

export function makeTitleKey(name: string, authorName?: string): string {
	const title = normalizeTitle(name);

	if (!authorName?.trim()) {
		return title;
	}

	return `${authorName.trim().toLowerCase()}|${title}`;
}

export function parsePublicationDateToMs(
	text: string | undefined,
): number | undefined {
	if (!text?.trim()) {
		return undefined;
	}

	const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (!match) {
		return undefined;
	}

	const dayStr = match[1];
	const monthStr = match[2];
	const yearStr = match[3];
	if (!dayStr || !monthStr || !yearStr) {
		return undefined;
	}

	const day = Number.parseInt(dayStr, 10);
	const month = Number.parseInt(monthStr, 10);
	let year = Number.parseInt(yearStr, 10);

	if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
		return undefined;
	}

	if (year < 100) {
		year += 2000;
	}

	if (month < 1 || month > 12 || day < 1 || day > 31) {
		return undefined;
	}

	const ms = Date.UTC(year, month - 1, day);
	const parsed = new Date(ms);

	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		return undefined;
	}

	return ms;
}

export function parseLaunchTimeToMs(
	iso: string | undefined,
): number | undefined {
	if (!iso?.trim()) {
		return undefined;
	}

	const ms = Date.parse(iso.trim());
	if (Number.isNaN(ms)) {
		return undefined;
	}

	return ms;
}

export function seasonFromTimestamp(ms: number): FolioSeason {
	const date = new Date(ms);
	const month = date.getUTCMonth();
	const year = date.getUTCFullYear();

	if (month >= 2 && month <= 4) {
		return {
			seasonKey: `${year}-spring`,
			seasonSortKey: `${year}-03`,
			label: `Spring ${year}`,
		};
	}

	if (month >= 5 && month <= 7) {
		return {
			seasonKey: `${year}-summer`,
			seasonSortKey: `${year}-06`,
			label: `Summer ${year}`,
		};
	}

	if (month >= 8 && month <= 10) {
		return {
			seasonKey: `${year}-fall`,
			seasonSortKey: `${year}-09`,
			label: `Fall ${year}`,
		};
	}

	if (month === 11) {
		return {
			seasonKey: `${year}-winter`,
			seasonSortKey: `${year}-12`,
			label: `Winter ${year + 1}`,
		};
	}

	return {
		seasonKey: `${year - 1}-winter`,
		seasonSortKey: `${year - 1}-12`,
		label: `Winter ${year}`,
	};
}

export function undatedSeason(): FolioUndatedSeason {
	return {
		seasonKey: "undated",
		seasonSortKey: "0000-00",
		label: "Undated",
	};
}

export function catalogLaunchTime(
	launchMs?: number,
	publicationMs?: number,
): number {
	return launchMs ?? publicationMs ?? 0;
}

export function buildSearchText(name: string, authorName?: string): string {
	return `${name} ${authorName ?? ""}`.trim();
}

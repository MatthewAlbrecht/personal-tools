export type FolioFilters = {
	search?: string;
	owned: boolean;
	want: boolean;
	le: boolean;
	signed: boolean;
	thisYear: boolean;
	coming: boolean;
	bundles: boolean;
};

export function parseFolioFilters(params: URLSearchParams): FolioFilters {
	return {
		search: optionalString(params.get("q")),
		owned: parseFlag(params, "owned"),
		want: parseFlag(params, "want"),
		le: parseFlag(params, "le"),
		signed: parseFlag(params, "signed"),
		thisYear: parseFlag(params, "thisYear"),
		coming: parseFlag(params, "coming"),
		bundles: parseFlag(params, "bundles"),
	};
}

export function serializeFolioFilters(
	filters: FolioFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	setIfPresent(params, "q", filters.search);
	setFlagIfTrue(params, "owned", filters.owned);
	setFlagIfTrue(params, "want", filters.want);
	setFlagIfTrue(params, "le", filters.le);
	setFlagIfTrue(params, "signed", filters.signed);
	setFlagIfTrue(params, "thisYear", filters.thisYear);
	setFlagIfTrue(params, "coming", filters.coming);
	setFlagIfTrue(params, "bundles", filters.bundles);
	return params;
}

function optionalString(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseFlag(params: URLSearchParams, key: string): boolean {
	return params.get(key) === "1";
}

function setIfPresent(
	params: URLSearchParams,
	key: string,
	value: string | undefined,
): void {
	if (value?.trim()) {
		params.set(key, value.trim());
	}
}

function setFlagIfTrue(
	params: URLSearchParams,
	key: string,
	value: boolean,
): void {
	if (value) {
		params.set(key, "1");
	}
}

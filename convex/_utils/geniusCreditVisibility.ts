import type { GeniusCredit } from "./geniusParser";

export type CreditVisibilityState = {
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
	siteWideHiddenLabelKeys?: string[];
	ignoredLabelKeys?: string[];
};

export function normalizeCreditLabelKey(label: string): string {
	return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCreditLabelList(
	labels: string[] | undefined,
): string[] | undefined {
	if (!labels) return undefined;

	const normalized = [
		...new Set(labels.map((label) => label.trim()).filter(Boolean)),
	];
	return normalized.length > 0 ? normalized : undefined;
}

export function isCreditLabelIgnored(
	label: string,
	ignoredLabelKeys: string[] | undefined,
): boolean {
	if (!ignoredLabelKeys || ignoredLabelKeys.length === 0) return false;

	const normalizedLabel = normalizeCreditLabelKey(label);
	if (!normalizedLabel) return false;

	for (const pattern of ignoredLabelKeys) {
		const normalizedPattern = normalizeCreditLabelKey(pattern);
		if (!normalizedPattern) continue;
		if (normalizedLabel.includes(normalizedPattern)) return true;
	}

	return false;
}

export function buildHiddenCreditLabelKeys(
	state: CreditVisibilityState,
): Set<string> {
	const hiddenKeys = new Set<string>();

	for (const key of state.siteWideHiddenLabelKeys ?? []) {
		const normalizedKey = normalizeCreditLabelKey(key);
		if (normalizedKey) hiddenKeys.add(normalizedKey);
	}

	for (const label of state.hiddenCreditLabels ?? []) {
		const normalizedKey = normalizeCreditLabelKey(label);
		if (normalizedKey) hiddenKeys.add(normalizedKey);
	}

	return hiddenKeys;
}

export function buildShownCreditLabelKeys(
	shownCreditLabels: string[] | undefined,
): Set<string> {
	const shownKeys = new Set<string>();
	for (const label of shownCreditLabels ?? []) {
		const normalizedKey = normalizeCreditLabelKey(label);
		if (normalizedKey) shownKeys.add(normalizedKey);
	}
	return shownKeys;
}

export function isCreditLabelVisible(
	label: string,
	state: CreditVisibilityState,
): boolean {
	const key = normalizeCreditLabelKey(label);
	if (!key) return false;
	if (isCreditLabelIgnored(label, state.ignoredLabelKeys)) return false;

	const shownKeys = buildShownCreditLabelKeys(state.shownCreditLabels);
	if (shownKeys.has(key)) return true;

	const hiddenKeys = buildHiddenCreditLabelKeys(state);
	return !hiddenKeys.has(key);
}

export function filterVisibleCredits(
	credits: GeniusCredit[] | undefined,
	state: CreditVisibilityState,
): GeniusCredit[] | undefined {
	if (!credits || credits.length === 0) return undefined;

	const visibleCredits = credits.filter((credit) =>
		isCreditLabelVisible(credit.label, state),
	);

	return visibleCredits.length > 0 ? visibleCredits : undefined;
}

export function getHiddenCreditLabelsForRestore(
	credits: GeniusCredit[] | undefined,
	state: CreditVisibilityState,
): string[] {
	if (!credits || credits.length === 0) return [];

	return credits
		.filter(
			(credit) =>
				!isCreditLabelIgnored(credit.label, state.ignoredLabelKeys) &&
				!isCreditLabelVisible(credit.label, state),
		)
		.map((credit) => credit.label);
}

export function applyHideCreditLabel(
	state: CreditVisibilityState,
	label: string,
): Pick<CreditVisibilityState, "hiddenCreditLabels" | "shownCreditLabels"> {
	const trimmed = label.trim();
	if (!trimmed) {
		return {
			hiddenCreditLabels: normalizeCreditLabelList(state.hiddenCreditLabels),
			shownCreditLabels: normalizeCreditLabelList(state.shownCreditLabels),
		};
	}

	const hiddenCreditLabels = normalizeCreditLabelList([
		...(state.hiddenCreditLabels ?? []),
		trimmed,
	]);
	const shownCreditLabels = normalizeCreditLabelList(
		(state.shownCreditLabels ?? []).filter(
			(existing) =>
				normalizeCreditLabelKey(existing) !== normalizeCreditLabelKey(trimmed),
		),
	);

	return { hiddenCreditLabels, shownCreditLabels };
}

export function applyShowCreditLabel(
	state: CreditVisibilityState,
	label: string,
): Pick<CreditVisibilityState, "hiddenCreditLabels" | "shownCreditLabels"> {
	const trimmed = label.trim();
	if (!trimmed) {
		return {
			hiddenCreditLabels: normalizeCreditLabelList(state.hiddenCreditLabels),
			shownCreditLabels: normalizeCreditLabelList(state.shownCreditLabels),
		};
	}

	const key = normalizeCreditLabelKey(trimmed);
	const siteWideHiddenKeys = buildHiddenCreditLabelKeys({
		siteWideHiddenLabelKeys: state.siteWideHiddenLabelKeys,
	});
	const hiddenByDefault = siteWideHiddenKeys.has(key);

	const hiddenCreditLabels = normalizeCreditLabelList(
		(state.hiddenCreditLabels ?? []).filter(
			(existing) => normalizeCreditLabelKey(existing) !== key,
		),
	);

	const shownCreditLabels = hiddenByDefault
		? normalizeCreditLabelList([...(state.shownCreditLabels ?? []), trimmed])
		: normalizeCreditLabelList(
				(state.shownCreditLabels ?? []).filter(
					(existing) => normalizeCreditLabelKey(existing) !== key,
				),
			);

	return { hiddenCreditLabels, shownCreditLabels };
}

export function collectCreditLabelsFromCredits(
	credits: GeniusCredit[] | undefined,
	ignoredLabelKeys?: string[],
): string[] {
	if (!credits) return [];

	const labels: string[] = [];
	for (const credit of credits) {
		const label = credit.label.trim();
		if (!label) continue;
		if (isCreditLabelIgnored(label, ignoredLabelKeys)) continue;
		labels.push(label);
	}
	return labels;
}

export function sortCreditLabelsForAdminList<
	TRow extends { key: string; label: string; hiddenByDefault: boolean },
>(rows: TRow[]): TRow[] {
	return [...rows].sort((left, right) => {
		if (left.hiddenByDefault !== right.hiddenByDefault) {
			return left.hiddenByDefault ? -1 : 1;
		}
		return left.label.localeCompare(right.label, undefined, {
			sensitivity: "base",
		});
	});
}

export function sortIgnoredCreditLabelsForAdminList<
	TRow extends { key: string; label: string },
>(rows: TRow[]): TRow[] {
	return [...rows].sort((left, right) =>
		left.label.localeCompare(right.label, undefined, {
			sensitivity: "base",
		}),
	);
}

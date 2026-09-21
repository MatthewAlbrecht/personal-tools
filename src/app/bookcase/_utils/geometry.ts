export type BookcaseConfig = {
	caseCount: number;
	shelfCount: number;
	openingHeight: number;
	innerWidth: number;
	shelfThickness: number;
	frameThickness: number;
	showDividers: boolean;
	showContents: boolean;
};

export type BookcaseMeasurements = {
	caseWidth: number;
	caseHeight: number;
	overallWidth: number;
	overallHeight: number;
	vinylBayWidth: number;
	bookBayWidth: number;
	openingHeight: number;
	innerWidth: number;
	lpClearance: number;
};

export const LP_SLEEVE_INCHES = 12.375;
export const MIN_BOOK_BAY_INCHES = 4;

export const CONFIG_LIMITS = {
	caseCount: { min: 1, max: 6, step: 1 },
	shelfCount: { min: 1, max: 12, step: 1 },
	openingHeight: { min: 6, max: 20, step: 0.25 },
	innerWidth: { min: 18, max: 60, step: 0.25 },
	shelfThickness: { min: 0.25, max: 2, step: 0.125 },
	frameThickness: { min: 0.25, max: 2, step: 0.125 },
} as const;

export const DEFAULT_CONFIG: BookcaseConfig = {
	caseCount: 2,
	shelfCount: 7,
	openingHeight: 13.25,
	innerWidth: 36,
	shelfThickness: 0.75,
	frameThickness: 0.75,
	showDividers: true,
	showContents: true,
};

export function clampConfig(config: BookcaseConfig): BookcaseConfig {
	return {
		caseCount: clampInt(
			config.caseCount,
			CONFIG_LIMITS.caseCount.min,
			CONFIG_LIMITS.caseCount.max,
		),
		shelfCount: clampInt(
			config.shelfCount,
			CONFIG_LIMITS.shelfCount.min,
			CONFIG_LIMITS.shelfCount.max,
		),
		openingHeight: clampInch(
			config.openingHeight,
			CONFIG_LIMITS.openingHeight.min,
			CONFIG_LIMITS.openingHeight.max,
		),
		innerWidth: clampInch(
			config.innerWidth,
			CONFIG_LIMITS.innerWidth.min,
			CONFIG_LIMITS.innerWidth.max,
		),
		shelfThickness: clampInch(
			config.shelfThickness,
			CONFIG_LIMITS.shelfThickness.min,
			CONFIG_LIMITS.shelfThickness.max,
		),
		frameThickness: clampInch(
			config.frameThickness,
			CONFIG_LIMITS.frameThickness.min,
			CONFIG_LIMITS.frameThickness.max,
		),
		showDividers: Boolean(config.showDividers),
		showContents: Boolean(config.showContents),
	};
}

export function measureBookcase(config: BookcaseConfig): BookcaseMeasurements {
	const vinylBayWidth = getVinylBayWidth(config);
	const bookBayWidth = getBookBayWidth(config, vinylBayWidth);
	const caseWidth = config.innerWidth + 2 * config.frameThickness;
	const intermediateShelves = Math.max(0, config.shelfCount - 1);
	const caseHeight =
		2 * config.frameThickness +
		config.shelfCount * config.openingHeight +
		intermediateShelves * config.shelfThickness;

	return {
		caseWidth,
		caseHeight,
		overallWidth: caseWidth * config.caseCount,
		overallHeight: caseHeight,
		vinylBayWidth,
		bookBayWidth,
		openingHeight: config.openingHeight,
		innerWidth: config.innerWidth,
		lpClearance: config.openingHeight - LP_SLEEVE_INCHES,
	};
}

export function getVinylBayWidth(config: BookcaseConfig): number {
	if (!config.showDividers) return 0;
	const maxVinyl =
		config.innerWidth - config.shelfThickness - MIN_BOOK_BAY_INCHES;
	if (maxVinyl <= 0) return 0;
	return Math.min(config.openingHeight, maxVinyl);
}

export function getBookBayWidth(
	config: BookcaseConfig,
	vinylBayWidth = getVinylBayWidth(config),
): number {
	if (!config.showDividers) return config.innerWidth;
	return Math.max(0, config.innerWidth - vinylBayWidth - config.shelfThickness);
}

export function isVinylOnLeft(caseIndex: number, shelfIndex: number): boolean {
	return (caseIndex + shelfIndex) % 2 === 0;
}

export function openingTop(config: BookcaseConfig, shelfIndex: number): number {
	return (
		config.frameThickness +
		shelfIndex * (config.openingHeight + config.shelfThickness)
	);
}

export function formatInches(inches: number, digits = 2): string {
	return `${inches.toFixed(digits)}"`;
}

export function formatFeetInches(inches: number): string {
	const abs = Math.abs(inches);
	const feet = Math.floor(abs / 12);
	const rem = abs - feet * 12;
	const sign = inches < 0 ? "-" : "";
	if (feet === 0) return `${sign}${rem.toFixed(2)}"`;
	return `${sign}${feet}' ${rem.toFixed(2)}"`;
}

function clampInt(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function clampInch(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

export const FOR_LATER_YEAR_PICKER_MIN = 1890;

export type YearRangeCell =
	| { kind: "year"; year: number }
	| { kind: "decade"; decadeStart: number };

export type YearRangeSelection = {
	min?: number;
	max?: number;
	lastClick?: YearRangeCell;
};

export function listYearPickerDecades(maxYear: number): number[] {
	const currentDecade = Math.floor(maxYear / 10) * 10;
	const decades: number[] = [];
	for (let decade = currentDecade; decade >= FOR_LATER_YEAR_PICKER_MIN; decade -= 10) {
		decades.push(decade);
	}
	return decades;
}

export function decadeBounds(
	decadeStart: number,
	maxYear: number,
): { min: number; max: number } {
	return {
		min: decadeStart,
		max: Math.min(decadeStart + 9, maxYear),
	};
}

export function yearsInDecadeRow(decadeStart: number, maxYear: number): number[] {
	const { min, max } = decadeBounds(decadeStart, maxYear);
	const years: number[] = [];
	for (let year = min; year <= max; year += 1) {
		years.push(year);
	}
	return years;
}

export function cellBounds(
	cell: YearRangeCell,
	maxYear: number,
): { min: number; max: number } {
	if (cell.kind === "year") {
		return { min: cell.year, max: cell.year };
	}
	return decadeBounds(cell.decadeStart, maxYear);
}

export function cellsEqual(a: YearRangeCell, b: YearRangeCell): boolean {
	if (a.kind !== b.kind) {
		return false;
	}
	if (a.kind === "year") {
		return b.kind === "year" && a.year === b.year;
	}
	return b.kind === "decade" && a.decadeStart === b.decadeStart;
}

export function isYearRangeEmpty(selection: YearRangeSelection): boolean {
	return selection.min === undefined && selection.max === undefined;
}

export function isSingleYearSelection(selection: YearRangeSelection): boolean {
	return (
		selection.min !== undefined &&
		selection.max !== undefined &&
		selection.min === selection.max
	);
}

export function isRangeSelection(selection: YearRangeSelection): boolean {
	return (
		selection.min !== undefined &&
		selection.max !== undefined &&
		selection.min !== selection.max
	);
}

export function isDecadeFullyInSelection(
	decadeStart: number,
	selection: YearRangeSelection,
	maxYear: number,
): boolean {
	if (selection.min === undefined || selection.max === undefined) {
		return false;
	}
	const bounds = decadeBounds(decadeStart, maxYear);
	return selection.min <= bounds.min && selection.max >= bounds.max;
}

export function isSingleDecadeFullySelected(
	selection: YearRangeSelection,
	maxYear: number,
): boolean {
	if (selection.min === undefined || selection.max === undefined) {
		return false;
	}
	for (const decadeStart of listYearPickerDecades(maxYear)) {
		const bounds = decadeBounds(decadeStart, maxYear);
		if (selection.min === bounds.min && selection.max === bounds.max) {
			return true;
		}
	}
	return false;
}

export function isYearInSelection(year: number, selection: YearRangeSelection): boolean {
	if (selection.min === undefined || selection.max === undefined) {
		return false;
	}
	return year >= selection.min && year <= selection.max;
}

export function selectionFromFilterBounds(
	yearMin?: number,
	yearMax?: number,
): YearRangeSelection {
	if (yearMin === undefined && yearMax === undefined) {
		return {};
	}
	return {
		min: yearMin ?? yearMax,
		max: yearMax ?? yearMin,
	};
}

export function selectionToFilterBounds(selection: YearRangeSelection): {
	yearMin?: number;
	yearMax?: number;
} {
	if (isYearRangeEmpty(selection)) {
		return {};
	}
	return {
		yearMin: selection.min,
		yearMax: selection.max,
	};
}

export function formatYearRangeLabel(
	yearMin?: number,
	yearMax?: number,
): string {
	if (yearMin === undefined && yearMax === undefined) {
		return "";
	}
	const min = yearMin ?? yearMax!;
	const max = yearMax ?? yearMin!;
	if (min === max) {
		return String(min);
	}
	return `${min}–${max}`;
}

export function applyYearRangeClick(
	current: YearRangeSelection,
	cell: YearRangeCell,
	maxYear: number,
): YearRangeSelection {
	const clicked = cellBounds(cell, maxYear);

	if (current.lastClick && cellsEqual(current.lastClick, cell)) {
		return {};
	}

	const hasSelection =
		current.min !== undefined && current.max !== undefined;

	if (!hasSelection) {
		return {
			min: clicked.min,
			max: clicked.max,
			lastClick: cell,
		};
	}

	if (
		isRangeSelection(current) &&
		!isSingleDecadeFullySelected(current, maxYear)
	) {
		return {
			min: clicked.min,
			max: clicked.max,
			lastClick: cell,
		};
	}

	if (isSingleYearSelection(current)) {
		const anchor = current.min!;
		const overlapsClicked =
			anchor >= clicked.min &&
			anchor <= clicked.max &&
			clicked.min === clicked.max;
		if (overlapsClicked && cell.kind === "year" && anchor === cell.year) {
			return { min: anchor, max: anchor, lastClick: cell };
		}
		return {
			min: Math.min(anchor, clicked.min),
			max: Math.max(anchor, clicked.max),
			lastClick: cell,
		};
	}

	if (isSingleDecadeFullySelected(current, maxYear)) {
		const insideCurrentDecade =
			clicked.min >= current.min! && clicked.max <= current.max!;
		if (!insideCurrentDecade) {
			return {
				min: Math.min(current.min!, clicked.min),
				max: Math.max(current.max!, clicked.max),
				lastClick: cell,
			};
		}
	}

	return {
		min: clicked.min,
		max: clicked.max,
		lastClick: cell,
	};
}

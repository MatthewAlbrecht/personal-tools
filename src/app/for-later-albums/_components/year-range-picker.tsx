"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import {
	applyYearRangeClick,
	formatYearRangeLabel,
	isDecadeFullyInSelection,
	isYearInSelection,
	listYearPickerDecades,
	selectionFromFilterBounds,
	selectionToFilterBounds,
	type YearRangeCell,
	type YearRangeSelection,
} from "../_utils/year-range-selection";

const YEAR_COLUMNS = 10;
const DECADE_COL_WIDTH = "3.25rem";
const YEAR_COL_WIDTH = "1.85rem";
const PICKER_MIN_WIDTH = `calc(${DECADE_COL_WIDTH} + ${YEAR_COLUMNS} * ${YEAR_COL_WIDTH})`;

export function YearRangePicker({
	yearMin,
	yearMax,
	onCommit,
	maxYear = new Date().getFullYear(),
}: {
	yearMin?: number;
	yearMax?: number;
	onCommit: (bounds: { yearMin?: number; yearMax?: number }) => void;
	maxYear?: number;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<YearRangeSelection>(() =>
		selectionFromFilterBounds(yearMin, yearMax),
	);

	useEffect(() => {
		if (!open) {
			setDraft(selectionFromFilterBounds(yearMin, yearMax));
		}
	}, [open, yearMin, yearMax]);

	function handleOpenChange(nextOpen: boolean): void {
		if (!nextOpen) {
			onCommit(selectionToFilterBounds(draft));
		}
		setOpen(nextOpen);
	}

	function handleCellClick(cell: YearRangeCell): void {
		setDraft((current) => applyYearRangeClick(current, cell, maxYear));
	}

	const label = formatYearRangeLabel(yearMin, yearMax);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					id="for-later-filter-year"
					type="button"
					className={cn(
						buttonVariants({ variant: "outline" }),
						"h-9 w-full justify-start px-3 font-normal",
						!label && "text-muted-foreground",
					)}
				>
					{label || "Any year"}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				collisionPadding={12}
				className={cn(
					"z-50 w-max max-w-[min(calc(100vw-1.5rem),28rem)] p-0 shadow-md",
				)}
				style={{ minWidth: PICKER_MIN_WIDTH }}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain">
					<table className="w-max border-collapse text-xs">
						<colgroup>
							<col style={{ width: DECADE_COL_WIDTH }} />
							{Array.from({ length: YEAR_COLUMNS }).map((_, index) => (
								<col key={index} style={{ width: YEAR_COL_WIDTH }} />
							))}
						</colgroup>
						<tbody>
							{listYearPickerDecades(maxYear).map((decadeStart) => (
								<YearPickerDecadeRow
									key={decadeStart}
									decadeStart={decadeStart}
									maxYear={maxYear}
									selection={draft}
									onCellClick={handleCellClick}
								/>
							))}
						</tbody>
					</table>
				</div>
				<button
					type="button"
					className="block w-full border-border border-t py-1.5 text-center text-[11px] text-muted-foreground hover:bg-muted/50"
					onClick={() => handleOpenChange(false)}
				>
					Close
				</button>
			</PopoverContent>
		</Popover>
	);
}

function YearPickerDecadeRow({
	decadeStart,
	maxYear,
	selection,
	onCellClick,
}: {
	decadeStart: number;
	maxYear: number;
	selection: YearRangeSelection;
	onCellClick: (cell: YearRangeCell) => void;
}) {
	const decadeLabel = `${Math.floor(decadeStart / 10)}0s`;
	const decadeSelected = isDecadeFullyInSelection(decadeStart, selection, maxYear);

	return (
		<tr>
			<td className="border-border border p-0">
				<button
					type="button"
					className={yearCellClassName(decadeSelected)}
					onClick={() => onCellClick({ kind: "decade", decadeStart })}
				>
					{decadeLabel}
				</button>
			</td>
			{Array.from({ length: YEAR_COLUMNS }).map((_, index) => {
				const year = decadeStart + index;
				if (year > maxYear) {
					return (
						<td
							key={year}
							className="border-border border bg-muted/20 p-0"
							aria-hidden
						/>
					);
				}

				const selected = isYearInSelection(year, selection);
				const twoDigit = String(year % 100).padStart(2, "0");
				return (
					<td key={year} className="border-border border p-0">
						<button
							type="button"
							className={yearCellClassName(selected)}
							onClick={() => onCellClick({ kind: "year", year })}
							title={String(year)}
						>
							{twoDigit}
						</button>
					</td>
				);
			})}
		</tr>
	);
}

function yearCellClassName(selected: boolean): string {
	return cn(
		"flex h-7 w-full min-w-0 items-center justify-center px-0.5 font-normal text-[11px] tabular-nums",
		selected
			? "bg-blue-900 text-white hover:bg-blue-800"
			: "bg-popover text-popover-foreground hover:bg-muted/60",
	);
}

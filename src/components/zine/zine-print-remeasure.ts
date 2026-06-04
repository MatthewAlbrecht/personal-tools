"use client";

import { useEffect } from "react";

export const ZINE_PRINT_REMEASURE_EVENT = "zine-print-remeasure";

export function scheduleZineRemeasure(callback: () => void): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(callback);
	});
}

export function triggerZinePrintRemeasure(): void {
	window.dispatchEvent(new CustomEvent(ZINE_PRINT_REMEASURE_EVENT));
}

export function useZinePrintRemeasure(callback: () => void): void {
	useEffect(() => {
		function handleRemeasure() {
			scheduleZineRemeasure(callback);
		}

		window.addEventListener("beforeprint", handleRemeasure);
		window.addEventListener(ZINE_PRINT_REMEASURE_EVENT, handleRemeasure);

		return () => {
			window.removeEventListener("beforeprint", handleRemeasure);
			window.removeEventListener(ZINE_PRINT_REMEASURE_EVENT, handleRemeasure);
		};
	}, [callback]);
}

/** Last-resort floor when title-relative min would still clip (lyrics only). */
export const ZINE_LYRICS_FIT_HARD_MIN_PT = 6;

/**
 * With `column-count` + `overflow: hidden`, `scrollHeight` often matches `clientHeight`
 * even when text is clipped across columns. Temporarily measure as one column so
 * `scrollHeight` reflects the full laid-out content height.
 */
function multilineLyricsVerticallyFits(container: HTMLDivElement): boolean {
	const previousColumnCount = container.style.getPropertyValue("column-count");
	container.style.setProperty("column-count", "1");
	void container.offsetHeight;
	const fits = container.scrollHeight <= container.clientHeight + 1;

	if (previousColumnCount) {
		container.style.setProperty("column-count", previousColumnCount);
	} else {
		container.style.removeProperty("column-count");
	}
	void container.offsetHeight;

	return fits;
}

/** Exported for zine lyrics escalator (two-column decision) — same rules as fit. */
export function lyricsContainerHasVerticalOverflow(
	container: HTMLDivElement,
): boolean {
	return !multilineLyricsVerticallyFits(container);
}

function fitFontSizeToContainer({
	container,
	initialFontSizePt,
	minFontSizePt,
	mode,
	hardMinFontSizePt,
}: {
	container: HTMLDivElement;
	initialFontSizePt: number;
	minFontSizePt: number;
	mode: "single-line" | "multiline";
	/** Below `minFontSizePt` only when still overflowing (multiline; e.g. lyrics zine). */
	hardMinFontSizePt?: number;
}): number {
	let nextFontSizePt = initialFontSizePt;
	container.style.fontSize = `${nextFontSizePt}pt`;

	function singleLineHorizontalFits(): boolean {
		const available = container.clientWidth;
		const firstChild = container.firstElementChild;
		if (!(firstChild instanceof HTMLElement)) {
			return container.scrollWidth <= available + 1;
		}

		const display = getComputedStyle(firstChild).display;
		if (display === "flex" || display === "inline-flex") {
			const row = firstChild;
			const kids = [...row.children].filter(
				(c): c is HTMLElement => c instanceof HTMLElement,
			);
			if (kids.length === 0) {
				return row.getBoundingClientRect().width <= available + 1;
			}

			let total = 0;
			for (const kid of kids) {
				total += kid.getBoundingClientRect().width;
			}

			const gapStyle = getComputedStyle(row);
			const gapRaw = gapStyle.columnGap || gapStyle.gap;
			let gapPx = 0;
			if (gapRaw && gapRaw !== "normal") {
				const firstToken = gapRaw.trim().split(/\s+/)[0];
				if (firstToken !== undefined) {
					gapPx = Number.parseFloat(firstToken) || 0;
				}
			}

			total += gapPx * Math.max(0, kids.length - 1);
			return total <= available + 1;
		}

		const contentWidth = firstChild.getBoundingClientRect().width;
		return contentWidth <= available + 1;
	}

	function fits(): boolean {
		if (mode === "single-line") {
			return singleLineHorizontalFits();
		}

		return multilineLyricsVerticallyFits(container);
	}

	while (nextFontSizePt > minFontSizePt && !fits()) {
		nextFontSizePt -= 0.5;
		container.style.fontSize = `${nextFontSizePt}pt`;
	}

	if (
		mode === "multiline" &&
		hardMinFontSizePt !== undefined &&
		!fits() &&
		nextFontSizePt > hardMinFontSizePt
	) {
		while (nextFontSizePt > hardMinFontSizePt && !fits()) {
			nextFontSizePt -= 0.5;
			container.style.fontSize = `${nextFontSizePt}pt`;
		}
	}

	return nextFontSizePt;
}

export { fitFontSizeToContainer };

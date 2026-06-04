import type { ZinePage } from "./zine-pages";

export type BookletSpread = {
	/** Left panel (0-based index into `pages`) */
	leftIndex: number;
	/** Right panel (0-based index into `pages`) */
	rightIndex: number;
};

export type BookletSheet = {
	front: BookletSpread;
	back: BookletSpread;
};

/**
 * Saddle-stitch imposition for N pages where N % 4 === 0 (reading order).
 * Sheet index s = 0 is outermost. Uses 1-based reading page numbers k as:
 *
 * Front: left = N - 2s, right = 2s + 1
 * Back: left = 2s + 2, right = N - 2s - 1
 *
 * Exported indices are 0-based into `pages`.
 */
export function buildBookletSheets(pages: ZinePage[]): BookletSheet[] {
	const pageCount = pages.length;
	if (pageCount === 0 || pageCount % 4 !== 0) {
		throw new Error(
			`buildBookletSheets: expected page count divisible by 4, got ${pageCount}`,
		);
	}

	const sheets: BookletSheet[] = [];
	const halfSheets = pageCount / 4;

	for (let sheetIndex = 0; sheetIndex < halfSheets; sheetIndex += 1) {
		const s = sheetIndex;
		const n = pageCount;

		const frontLeft = n - 2 * s - 1;
		const frontRight = 2 * s;
		const backLeft = 2 * s + 1;
		const backRight = n - 2 * s - 2;

		sheets.push({
			front: { leftIndex: frontLeft, rightIndex: frontRight },
			back: { leftIndex: backLeft, rightIndex: backRight },
		});
	}

	return sheets;
}

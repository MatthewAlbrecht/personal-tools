import { describe, expect, test } from "vitest";
import { gridDragTarget, gridShift } from "./drag-reorder";

// A 3-column grid of 100×150 tiles, two rows, 10px gaps: slots 0-2 then 3-5.
const tiles = [0, 1, 2, 3, 4, 5].map((index) => ({
	left: (index % 3) * 110,
	top: Math.floor(index / 3) * 160,
	width: 100,
	height: 150,
}));

describe("gridDragTarget", () => {
	test("a short drag stays in place", () => {
		expect(gridDragTarget(tiles, 0, 30, 20)).toBe(0);
	});

	test("the slot nearest the dragged tile's centre takes it, across rows", () => {
		expect(gridDragTarget(tiles, 0, 110, 0)).toBe(1);
		expect(gridDragTarget(tiles, 0, 200, 170)).toBe(5);
		expect(gridDragTarget(tiles, 4, -100, -150)).toBe(0);
	});

	test("dragging far outside the grid reaches the nearest edge slot", () => {
		expect(gridDragTarget(tiles, 0, 2000, 2000)).toBe(5);
		expect(gridDragTarget(tiles, 5, -2000, -2000)).toBe(0);
	});
});

describe("gridShift", () => {
	test("moving a tile later slides the tiles between back one slot", () => {
		// 0 → 4: tiles 1-4 each take the slot before them; 2 wraps to the row above.
		expect(gridShift(tiles, 0, 4, 1)).toEqual({ x: -110, y: 0 });
		expect(gridShift(tiles, 0, 4, 3)).toEqual({ x: 220, y: -160 });
		expect(gridShift(tiles, 0, 4, 5)).toEqual({ x: 0, y: 0 });
	});

	test("moving a tile earlier slides the tiles between forward one slot", () => {
		expect(gridShift(tiles, 4, 1, 2)).toEqual({ x: -220, y: 160 });
		expect(gridShift(tiles, 4, 1, 0)).toEqual({ x: 0, y: 0 });
	});
});

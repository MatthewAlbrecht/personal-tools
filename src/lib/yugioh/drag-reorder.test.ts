import { describe, expect, test } from "vitest";
import { dragTarget } from "./drag-reorder";

// Three 80px rows stacked from the top of the list.
const rows = [
	{ top: 0, height: 80 },
	{ top: 80, height: 80 },
	{ top: 160, height: 80 },
];

describe("dragTarget", () => {
	test("a short drag stays in place", () => {
		expect(dragTarget(rows, 0, 30)).toEqual({ offset: 30, toIndex: 0 });
	});

	test("passing the next row's middle takes its slot", () => {
		expect(dragTarget(rows, 0, 50).toIndex).toBe(1);
		expect(dragTarget(rows, 2, -50).toIndex).toBe(1);
	});

	test("dragging past the end reaches the last slot, held at the edge", () => {
		expect(dragTarget(rows, 0, 500)).toEqual({ offset: 160, toIndex: 2 });
	});

	test("dragging past the start reaches the first slot, held at the edge", () => {
		expect(dragTarget(rows, 2, -500)).toEqual({ offset: -160, toIndex: 0 });
	});
});

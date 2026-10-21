import { describe, expect, test } from "vitest";
import {
	ROW_CONTROLS,
	isMenuKey,
	keyboardMenuPoint,
	rowMenuOpensAt,
} from "./row-menu";

/** A fake element: whether it's inside one of `ROW_CONTROLS`. */
function element(insideControl = false) {
	return {
		closest: (selector: string) =>
			insideControl && selector === ROW_CONTROLS ? {} : null,
	};
}

const ROW_BOX = { left: 100, bottom: 260 };
const INSET = 52;

function contextMenu(
	overrides: Partial<Parameters<typeof rowMenuOpensAt>[0]> = {},
) {
	const target = element();
	return {
		button: 2,
		ctrlKey: false,
		clientX: 420,
		clientY: 230,
		target,
		row: {
			contains: (node: unknown) => node === target,
			getBoundingClientRect: () => ROW_BOX,
		},
		selection: null,
		inset: INSET,
		...overrides,
	};
}

describe("a right-click on a row", () => {
	test("opens the menu where I clicked", () => {
		expect(rowMenuOpensAt(contextMenu())).toEqual({ x: 420, y: 230 });
	});

	test("a Control-click (the Mac's right-click) opens it where I clicked", () => {
		expect(rowMenuOpensAt(contextMenu({ button: 0, ctrlKey: true }))).toEqual({
			x: 420,
			y: 230,
		});
	});

	test("from the keyboard (the menu key), opens it under the row", () => {
		expect(
			rowMenuOpensAt(contextMenu({ button: 0, clientX: 0, clientY: 0 })),
		).toEqual({ x: 152, y: 260 });
	});

	test("on a picker or button in the row, leaves the browser's menu", () => {
		const target = element(true);
		expect(
			rowMenuOpensAt(
				contextMenu({
					target,
					row: {
						contains: (node) => node === target,
						getBoundingClientRect: () => ROW_BOX,
					},
				}),
			),
		).toBeNull();
	});

	test("from a menu portalled out of the row doesn't count", () => {
		expect(
			rowMenuOpensAt(
				contextMenu({
					row: { contains: () => false, getBoundingClientRect: () => ROW_BOX },
				}),
			),
		).toBeNull();
	});

	test("over text selected in the row leaves the browser's menu, to copy it", () => {
		const base = contextMenu();
		expect(
			rowMenuOpensAt({
				...base,
				selection: { isCollapsed: false, anchorNode: base.target },
			}),
		).toBeNull();
		// A caret, or text selected elsewhere, doesn't block it.
		expect(
			rowMenuOpensAt({
				...base,
				selection: { isCollapsed: true, anchorNode: base.target },
			}),
		).not.toBeNull();
		expect(
			rowMenuOpensAt({
				...base,
				selection: { isCollapsed: false, anchorNode: {} },
			}),
		).not.toBeNull();
	});
});

describe("the row's link", () => {
	test("isn't one of the row's controls: right-clicking it opens the row menu", () => {
		expect(ROW_CONTROLS).toContain("a:not([data-row-link])");
	});
});

describe("menu keys", () => {
	test("the ContextMenu key and Shift+F10 open the menu", () => {
		expect(isMenuKey({ key: "ContextMenu", shiftKey: false })).toBe(true);
		expect(isMenuKey({ key: "F10", shiftKey: true })).toBe(true);
	});

	test("Enter, Space and a bare F10 don't", () => {
		expect(isMenuKey({ key: "Enter", shiftKey: false })).toBe(false);
		expect(isMenuKey({ key: " ", shiftKey: false })).toBe(false);
		expect(isMenuKey({ key: "F10", shiftKey: false })).toBe(false);
	});
});

describe("opening from the keyboard", () => {
	test("anchors under the row, in line with the Card name", () => {
		expect(keyboardMenuPoint(ROW_BOX, INSET)).toEqual({ x: 152, y: 260 });
	});
});

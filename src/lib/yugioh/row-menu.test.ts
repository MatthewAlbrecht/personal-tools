import { describe, expect, test } from "vitest";
import { keyboardMenuPoint, rowClickOpensMenu } from "./row-menu";

/** A fake element: what it's inside of, by selector, and what it holds. */
function element(closestMatches = false) {
	return { closest: () => (closestMatches ? {} : null) };
}

function click(
	overrides: Partial<Parameters<typeof rowClickOpensMenu>[0]> = {},
) {
	const target = element();
	return {
		button: 0,
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		target,
		row: { contains: (node: unknown) => node === target },
		selection: null,
		...overrides,
	};
}

describe("a click on a row", () => {
	test("a plain left click opens the menu", () => {
		expect(rowClickOpensMenu(click())).toBe(true);
	});

	test("a click on a link or button in the row is that control's", () => {
		const target = element(true);
		expect(
			rowClickOpensMenu(
				click({ target, row: { contains: (node) => node === target } }),
			),
		).toBe(false);
	});

	test("a click from a menu portalled out of the row doesn't count", () => {
		expect(rowClickOpensMenu(click({ row: { contains: () => false } }))).toBe(
			false,
		);
	});

	test("other buttons and modifier clicks are left to the browser", () => {
		expect(rowClickOpensMenu(click({ button: 1 }))).toBe(false);
		expect(rowClickOpensMenu(click({ metaKey: true }))).toBe(false);
		expect(rowClickOpensMenu(click({ ctrlKey: true }))).toBe(false);
		expect(rowClickOpensMenu(click({ shiftKey: true }))).toBe(false);
		expect(rowClickOpensMenu(click({ altKey: true }))).toBe(false);
	});

	test("ending a text selection in the row doesn't open it", () => {
		const base = click();
		expect(
			rowClickOpensMenu({
				...base,
				selection: { isCollapsed: false, anchorNode: base.target },
			}),
		).toBe(false);
		// A collapsed selection (a caret) is just a click.
		expect(
			rowClickOpensMenu({
				...base,
				selection: { isCollapsed: true, anchorNode: base.target },
			}),
		).toBe(true);
		// Text selected elsewhere on the page doesn't block it.
		expect(
			rowClickOpensMenu({
				...base,
				selection: { isCollapsed: false, anchorNode: {} },
			}),
		).toBe(true);
	});
});

describe("opening from the keyboard", () => {
	test("anchors under the row, in line with the Card name", () => {
		expect(keyboardMenuPoint({ left: 100, bottom: 260 }, 52)).toEqual({
			x: 152,
			y: 260,
		});
	});
});

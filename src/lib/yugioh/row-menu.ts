// When a right-click on a Listings table row opens the row's menu, and where
// it opens from. A plain click on a row opens the Listing on its marketplace
// through the row's own link (`data-row-link`). DOM-shaped but structural, so
// it's testable without a browser.

/**
 * Links, buttons and menus inside a row handle their own clicks, and keep
 * the browser's menu. The row's own link isn't one: it is the row.
 */
export const ROW_CONTROLS =
	"a:not([data-row-link]), button, input, textarea, select, label, [role='menuitem']";

type Box = { left: number; bottom: number };

export type RowContextMenu = {
	button: number;
	ctrlKey: boolean;
	clientX: number;
	clientY: number;
	/** What was right-clicked. */
	target: { closest: (selector: string) => unknown };
	/** The row the handler is on. */
	// Method syntax, so a DOM element (`contains(other: Node | null)`) fits.
	row: { contains(node: unknown): boolean; getBoundingClientRect(): Box };
	/** The page's text selection, if any. */
	selection: { isCollapsed: boolean; anchorNode: unknown } | null;
	/** How far in from the row's left edge the menu opens from the keyboard. */
	inset: number;
};

/**
 * Where a `contextmenu` event on a row opens the row menu, or null to leave
 * the browser's menu: on a control in the row, from a menu portalled
 * elsewhere, or over text selected in the row (to copy it). A right-click
 * (or the Mac's Control-click) opens it at the pointer; the menu key opens
 * it under the row.
 */
export function rowMenuOpensAt(
	event: RowContextMenu,
): { x: number; y: number } | null {
	const { row } = event;
	if (!row.contains(event.target)) return null;
	if (event.target.closest(ROW_CONTROLS)) return null;
	const selection = event.selection;
	if (
		selection &&
		!selection.isCollapsed &&
		row.contains(selection.anchorNode)
	) {
		return null;
	}
	const fromPointer = event.button === 2 || event.ctrlKey;
	return fromPointer
		? { x: event.clientX, y: event.clientY }
		: keyboardMenuPoint(row.getBoundingClientRect(), event.inset);
}

/** The keys that open the row menu: the ContextMenu key, and Shift+F10. */
export function isMenuKey(event: { key: string; shiftKey: boolean }): boolean {
	return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/** Where the menu opens from the keyboard: under the row, `inset` in. */
export function keyboardMenuPoint(
	row: Box,
	inset: number,
): { x: number; y: number } {
	return { x: row.left + inset, y: row.bottom };
}

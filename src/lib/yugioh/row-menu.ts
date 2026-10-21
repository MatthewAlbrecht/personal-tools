// When a click on a Listings table row opens the row's menu, and where the
// menu opens from the keyboard. DOM-shaped but structural, so it's testable
// without a browser.

/** Links, buttons and menus inside a row handle their own clicks. */
export const ROW_CONTROLS =
	"a, button, input, textarea, select, label, [role='menuitem']";

export type RowClick = {
	button: number;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	/** What was clicked. */
	target: { closest: (selector: string) => unknown };
	/** The row the click handler is on. */
	// Method syntax, so a DOM element (`contains(other: Node | null)`) fits.
	row: { contains(node: unknown): boolean };
	/** The page's text selection, if any. */
	selection: { isCollapsed: boolean; anchorNode: unknown } | null;
};

/**
 * A plain left click on the row itself opens its menu. Not a click on a
 * control in the row, nor one bubbling from a menu portalled elsewhere, nor a
 * modified click, nor the end of dragging to select text in the row.
 */
export function rowClickOpensMenu(click: RowClick): boolean {
	const { row } = click;
	if (click.button !== 0) return false;
	if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) {
		return false;
	}
	if (!row.contains(click.target)) return false;
	if (click.target.closest(ROW_CONTROLS)) return false;
	const selection = click.selection;
	if (
		selection &&
		!selection.isCollapsed &&
		row.contains(selection.anchorNode)
	) {
		return false;
	}
	return true;
}

/** Where the menu opens from the keyboard: under the row, `inset` in. */
export function keyboardMenuPoint(
	row: { left: number; bottom: number },
	inset: number,
): { x: number; y: number } {
	return { x: row.left + inset, y: row.bottom };
}

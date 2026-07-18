export function resolveCuratorComboboxItems({
	curators,
	value,
	filter,
}: {
	curators: string[];
	value: string;
	filter: string;
}): { items: string[]; createItem: string | null } {
	const unique = Array.from(
		new Set([...(value ? [value] : []), ...curators].filter(Boolean)),
	);
	const trimmed = filter.trim();
	const canCreate =
		trimmed.length > 0 &&
		!unique.some((name) => name.toLowerCase() === trimmed.toLowerCase());
	const createItem = canCreate ? trimmed : null;

	return {
		items: [...unique, ...(createItem ? [createItem] : [])],
		createItem,
	};
}

export function getCuratorComboboxItemLabel({
	item,
	createItem,
}: {
	item: string;
	createItem: string | null;
}): string {
	if (createItem !== null && item === createItem) {
		return `Create “${item}”`;
	}
	return item;
}

export function resolveCuratorComboboxValueChange(
	next: string | null,
): string {
	if (next == null) {
		return "";
	}
	return next;
}

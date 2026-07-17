export type ComboboxFilterArgs = {
	items: string[];
	browseItems?: string[];
	filter: string;
	getItemLabel: (item: string) => string;
};

export type ComboboxFilterResult = {
	filteredItems: string[];
	pinnedKeys: ReadonlySet<string>;
};

export function resolveComboboxFilteredItems(
	args: ComboboxFilterArgs,
): ComboboxFilterResult {
	const q = args.filter.trim().toLowerCase();
	const emptyPinned = new Set<string>();

	if (!q) {
		return {
			filteredItems: args.browseItems ?? args.items,
			pinnedKeys: emptyPinned,
		};
	}

	const matched = args.items.filter((item) => {
		const label = args.getItemLabel(item).toLowerCase();
		return label.includes(q) || item.toLowerCase().includes(q);
	});

	if (!args.browseItems || args.browseItems.length === 0) {
		return { filteredItems: matched, pinnedKeys: emptyPinned };
	}

	const browseSet = new Set(args.browseItems);
	const pinned: string[] = [];
	const rest: string[] = [];
	for (const item of matched) {
		if (browseSet.has(item)) {
			pinned.push(item);
		} else {
			rest.push(item);
		}
	}

	return {
		filteredItems: [...pinned, ...rest],
		pinnedKeys: new Set(pinned),
	};
}

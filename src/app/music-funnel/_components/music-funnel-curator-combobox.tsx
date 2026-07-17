"use client";

import { useEffect, useState } from "react";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "~/components/ui/combobox";

const CREATE_PREFIX = "__create__:";

export function MusicFunnelCuratorCombobox({
	curators,
	value,
	onValueChange,
}: {
	curators: string[];
	value: string;
	onValueChange: (value: string) => void;
}) {
	const [filter, setFilter] = useState(value);

	useEffect(() => {
		setFilter(value);
	}, [value]);

	const unique = Array.from(
		new Set([...(value ? [value] : []), ...curators].filter(Boolean)),
	);
	const trimmed = filter.trim();
	const canCreate =
		trimmed.length > 0 &&
		!unique.some((name) => name.toLowerCase() === trimmed.toLowerCase());
	const items = [
		...unique,
		...(canCreate ? [`${CREATE_PREFIX}${trimmed}`] : []),
	];

	function getItemLabel(item: string): string {
		if (item.startsWith(CREATE_PREFIX)) {
			return `Create “${item.slice(CREATE_PREFIX.length)}”`;
		}
		return item;
	}

	function handleValueChange(next: string | null): void {
		if (next == null) {
			onValueChange("");
			return;
		}
		if (next.startsWith(CREATE_PREFIX)) {
			onValueChange(next.slice(CREATE_PREFIX.length));
			return;
		}
		onValueChange(next);
	}

	return (
		<Combobox
			items={items}
			multiple={false}
			value={value || null}
			onValueChange={handleValueChange}
			inputValue={filter}
			onInputValueChange={setFilter}
			itemToStringLabel={getItemLabel}
		>
			<ComboboxInput
				placeholder="Curator name"
				showClear={value.length > 0}
				className="w-full"
			/>
			<ComboboxContent>
				<ComboboxEmpty>No curators found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => (
						<ComboboxItem key={item} value={item}>
							{getItemLabel(item)}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

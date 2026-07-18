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
import {
	getCuratorComboboxItemLabel,
	resolveCuratorComboboxItems,
	resolveCuratorComboboxValueChange,
} from "../_utils/music-funnel-curator-combobox-state";

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

	const { items, createItem } = resolveCuratorComboboxItems({
		curators,
		value,
		filter,
	});

	function handleValueChange(next: string | null): void {
		onValueChange(resolveCuratorComboboxValueChange(next));
	}

	return (
		<Combobox
			items={items}
			multiple={false}
			value={value || null}
			onValueChange={handleValueChange}
			inputValue={filter}
			onInputValueChange={setFilter}
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
							{getCuratorComboboxItemLabel({ item, createItem })}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

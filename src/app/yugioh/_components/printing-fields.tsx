"use client";

import { useMemo, useState } from "react";
import type * as React from "react";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import { normalizeRarity, suggestRarities } from "~/lib/yugioh/deck";

/**
 * Rarity with suggestions. Typed text is kept as its own item, so a rarity
 * that isn't in the list survives the popup closing.
 */
export function RarityCombobox({
	id,
	value,
	onChange,
	onBlur,
	invalid,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	invalid?: boolean;
}): React.ReactElement {
	const typed = value.trim();
	const suggested = suggestRarities(typed);
	const items = typed !== "" && suggested.length === 0 ? [typed] : suggested;
	return (
		<Combobox
			items={items}
			// `items` is already filtered and ranked.
			filter={null}
			autoHighlight
			value={typed === "" ? null : typed}
			// `value` may be typed text that isn't in `items`; compare as strings.
			isItemEqualToValue={(item, selected) => item === selected}
			onValueChange={(next) => onChange(typeof next === "string" ? next : "")}
			inputValue={value}
			onInputValueChange={onChange}
		>
			<ComboboxInput
				id={id}
				placeholder="Quarter Century Secret Rare"
				aria-invalid={invalid}
				onBlur={onBlur}
				autoComplete="off"
				className="w-full *:data-[slot=input-group-control]:text-base md:*:data-[slot=input-group-control]:text-sm"
			/>
			<ComboboxContent>
				<ComboboxList>
					{(item: string) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

/** Other rarities printed under the same set code. Known rarities, plus whatever is typed. */
export function OverloadedRaritiesCombobox({
	id,
	value,
	onChange,
}: {
	id: string;
	value: string[];
	onChange: (value: string[]) => void;
}): React.ReactElement {
	const anchor = useComboboxAnchor();
	const [query, setQuery] = useState("");
	const items = useMemo(() => {
		const suggested = suggestRarities(query, value);
		// Offer the typed text only when nothing in the list matches it.
		const typed = normalizeRarity(query);
		return typed !== "" && suggested.length === 0 ? [typed] : suggested;
	}, [query, value]);

	return (
		<Combobox
			items={items}
			filter={null}
			multiple
			// Enter picks the top match instead of submitting the form.
			autoHighlight
			value={value}
			onValueChange={(next) => onChange(next as string[])}
			inputValue={query}
			onInputValueChange={setQuery}
		>
			<ComboboxChips ref={anchor} className="w-full">
				<ComboboxValue>
					{(values: string[]) => (
						<>
							{values.map((rarity) => (
								<ComboboxChip key={rarity}>{rarity}</ComboboxChip>
							))}
							<ComboboxChipsInput
								id={id}
								placeholder={values.length > 0 ? "Add another" : "None"}
								className="text-base md:text-sm"
							/>
						</>
					)}
				</ComboboxValue>
			</ComboboxChips>
			<ComboboxContent anchor={anchor}>
				<ComboboxEmpty>Type a rarity to add it.</ComboboxEmpty>
				<ComboboxList>
					{(item: string) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

"use client";

import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "~/components/ui/combobox";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { SelectedConcertVenueRow } from "../_utils/types";

export function VenueMultiSelect({
	onValueChange,
	value,
	venues,
}: {
	onValueChange: (value: Id<"concertVenues">[]) => void;
	value: Id<"concertVenues">[];
	venues: SelectedConcertVenueRow[];
}) {
	const anchor = useComboboxAnchor();
	const items = venues.map((row) => row.venueId);
	const venueLabels = new Map(
		venues.map((row) => [row.venueId, getVenueDisplayName(row)]),
	);

	function handleValueChange(nextValue: string[]) {
		onValueChange(nextValue as Id<"concertVenues">[]);
	}

	return (
		<Combobox
			items={items}
			multiple
			itemToStringLabel={(item) =>
				venueLabels.get(item as Id<"concertVenues">) ?? item
			}
			onValueChange={handleValueChange}
			value={value}
		>
			<ComboboxChips ref={anchor} className="w-full">
				<ComboboxValue>
					{(values: string[]) => (
						<>
							{values.map((venueId) => (
								<ComboboxChip key={venueId}>
									{venueLabels.get(venueId as Id<"concertVenues">) ?? venueId}
								</ComboboxChip>
							))}
							<ComboboxChipsInput
								placeholder={
									values.length > 0 ? "Add venue..." : "Filter venues..."
								}
							/>
						</>
					)}
				</ComboboxValue>
			</ComboboxChips>
			<ComboboxContent anchor={anchor}>
				<ComboboxEmpty>No venues found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => {
						const venueId = item as Id<"concertVenues">;
						return (
							<ComboboxItem key={item} value={item}>
								{venueLabels.get(venueId) ?? item}
							</ComboboxItem>
						);
					}}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

function getVenueDisplayName(row: SelectedConcertVenueRow): string {
	return row.label?.trim() || row.venue.name;
}

"use client";

import { Check } from "lucide-react";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
} from "~/components/ui/combobox";
import { cn } from "~/lib/utils";
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
	const items = venues.map((row) => row.venueId);
	const venueLabels = new Map(
		venues.map((row) => [row.venueId, getVenueDisplayName(row)]),
	);

	function handleValueChange(nextValue: string[]) {
		onValueChange(nextValue as Id<"concertVenues">[]);
	}

	return (
		<Combobox
			getItemLabel={(item) =>
				venueLabels.get(item as Id<"concertVenues">) ?? item
			}
			items={items}
			multiple
			onValueChange={handleValueChange}
			value={value}
		>
			<ComboboxTrigger>
				<ComboboxChips>
					{value.map((venueId) => (
						<ComboboxChip key={venueId} value={venueId}>
							{venueLabels.get(venueId) ?? venueId}
						</ComboboxChip>
					))}
					<ComboboxChipsInput
						placeholder={value.length > 0 ? "Add venue..." : "Filter venues..."}
					/>
				</ComboboxChips>
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxEmpty>No venues found.</ComboboxEmpty>
				<ComboboxList>
					{(item) => {
						const venueId = item as Id<"concertVenues">;
						const isSelected = value.includes(venueId);

						return (
							<ComboboxItem value={item}>
								<Check
									className={cn(
										"mr-2 size-4",
										isSelected ? "opacity-100" : "opacity-0",
									)}
								/>
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

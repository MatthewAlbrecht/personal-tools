"use client";

import { useForm } from "@tanstack/react-form";
import type * as React from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import type { ListingsView } from "~/lib/yugioh/listing-filters";
import {
	type ListingSort,
	defaultListingSort,
	sortPhrase,
} from "~/lib/yugioh/listing-sort";
import { listingSortSchema } from "../_utils/schemas";

/** The orders worth offering on a small screen, the view's default first. */
function sortOptions(view: ListingsView): ListingSort[] {
	const common: ListingSort[] = [
		{ key: "price", direction: "asc" },
		{ key: "price", direction: "desc" },
		{ key: "grade", direction: "asc" },
		{ key: "card", direction: "asc" },
		{ key: "condition", direction: "asc" },
	];
	return view === "sold"
		? [
				defaultListingSort("sold"),
				...common,
				{ key: "seen", direction: "desc" },
			]
		: [
				defaultListingSort("available"),
				{ key: "date", direction: "asc" },
				...common,
			];
}

function optionValue(sort: ListingSort): string {
	return `${sort.key}:${sort.direction}`;
}

/**
 * The sort on small screens, where the list has no column headers: "Newest
 * first", "Cheapest first", and so on. A column sort it doesn't offer (from
 * the desktop table) still shows as picked.
 */
export function ListingSortSelect({
	sort,
	view,
	onChange,
	className,
}: {
	sort: ListingSort;
	view: ListingsView;
	onChange: (sort: ListingSort) => void;
	className?: string;
}): React.ReactElement {
	const form = useForm({
		defaultValues: sort,
		validators: { onSubmit: listingSortSchema },
		onSubmit: ({ value }) => onChange(value),
	});
	const options = sortOptions(view);
	if (!options.some((option) => optionValue(option) === optionValue(sort))) {
		options.push(sort);
	}

	return (
		<form.Subscribe selector={(state) => state.values}>
			{(values) => (
				<Select
					value={optionValue(values)}
					onValueChange={(next) => {
						const picked = options.find(
							(option) => optionValue(option) === next,
						);
						if (!picked) return;
						form.setFieldValue("key", picked.key);
						form.setFieldValue("direction", picked.direction);
						void form.handleSubmit();
					}}
				>
					<SelectTrigger
						aria-label="Sort"
						className={cn("h-11 text-base", className)}
					>
						<SelectValue>{capitalize(sortPhrase(values, view))}</SelectValue>
					</SelectTrigger>
					<SelectContent align="end">
						<SelectGroup>
							{options.map((option) => (
								<SelectItem
									key={optionValue(option)}
									value={optionValue(option)}
								>
									{capitalize(sortPhrase(option, view))}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			)}
		</form.Subscribe>
	);
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

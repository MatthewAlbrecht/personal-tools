"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "convex/react";
import { ListFilter, X } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Toggle } from "~/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { SECTION_LABELS } from "~/lib/yugioh/deck";
import {
	CONDITION_FILTERS,
	type ConditionFilter,
	LISTING_VIEWS,
	type ListingFilters,
	type ListingKind,
	type ListingsView,
	type Marketplace,
	type MatchFilter,
	extraFilters,
} from "~/lib/yugioh/listing-filters";
import { MARKETPLACE_LABELS } from "~/lib/yugioh/listing-format";
import {
	LANGUAGES,
	LANGUAGE_LABELS,
	type Language,
	READ_CONDITION_LABELS,
} from "~/lib/yugioh/title-reading";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	ANY,
	listingFiltersSchema,
	listingsViewSchema,
} from "../_utils/schemas";
import type { DeckView } from "../_utils/types";
import { YugiohDrawer } from "./yugioh-drawer";

const VIEW_LABELS: Record<ListingsView, string> = {
	available: "Available",
	sold: "Sold",
};

const KIND_LABELS: Record<ListingKind, string> = {
	buyItNow: "Buy it now",
	auction: "Auction",
};

const CONDITION_FILTER_LABELS: Record<ConditionFilter, string> = {
	...READ_CONDITION_LABELS,
	unknown: "Not stated",
};

const MATCH_LABELS: Record<MatchFilter, string> = {
	match: "Matched",
	unsure: "Unsure",
	notMatch: "Not a match",
	reading: "Reading title",
};

/** A Card the Card filter can pick. */
type CardOption = { _id: string; label: string };

/**
 * The Listings toolbar: the view (Available · Sold), the New toggle within
 * it, the Filters button with how many more are set, and those filters as
 * removable chips. Every change is a URL change, through `onChange`.
 */
export function ListingsToolbar({
	deckId,
	filters,
	newCount,
	matching,
	locations,
	onChange,
}: {
	deckId: Id<"yugiohDecks">;
	filters: ListingFilters;
	/** Null while loading. */
	newCount: number | null;
	matching: number | null;
	locations: string[];
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });
	const cards: CardOption[] = cardOptions(deck);
	const extra = extraFilters(filters);

	return (
		<div className="flex flex-col gap-2">
			<div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
				<ViewToggles
					key={`${filters.view ?? "available"}-${filters.new ?? false}`}
					filters={filters}
					newCount={newCount}
					onChange={onChange}
				/>
				<Button
					variant="outline"
					className="h-11 md:h-9"
					onClick={() => setDrawerOpen(true)}
				>
					<ListFilter data-icon="inline-start" />
					Filters
					{extra.length > 0 && (
						<Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums">
							{extra.length}
							<span className="sr-only"> set</span>
						</Badge>
					)}
				</Button>
			</div>
			{extra.length > 0 && (
				<ul aria-label="Filters set" className="flex flex-wrap gap-1.5">
					{extra.map((name) => {
						const label = filterLabel(name, filters, cards);
						return (
							<li key={name}>
								<Button
									variant="secondary"
									size="sm"
									className="h-11 rounded-full pr-2 md:h-8"
									aria-label={`Remove filter: ${label}`}
									onClick={() => onChange({ ...filters, [name]: undefined })}
								>
									{label}
									<X data-icon="inline-end" aria-hidden />
								</Button>
							</li>
						);
					})}
					<li>
						<Button
							variant="ghost"
							size="sm"
							className="h-11 md:h-8"
							onClick={() => onChange(keepView(filters))}
						>
							Clear
						</Button>
					</li>
				</ul>
			)}
			<ListingFiltersDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				filters={filters}
				matching={matching}
				locations={locations}
				cards={cards}
				onChange={onChange}
			/>
		</div>
	);
}

/** Clearing filters keeps the view and the New toggle. */
function keepView(filters: ListingFilters): ListingFilters {
	return { view: filters.view, new: filters.new };
}

/**
 * Available · Sold, then New: Listings first seen since my last visit, within
 * the view, with how many there are.
 */
function ViewToggles({
	filters,
	newCount,
	onChange,
}: {
	filters: ListingFilters;
	newCount: number | null;
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const form = useForm({
		defaultValues: {
			view: filters.view ?? "available",
			new: filters.new ?? false,
		},
		validators: { onSubmit: listingsViewSchema },
		onSubmit: ({ value }) =>
			onChange({
				...filters,
				view: value.view === "available" ? undefined : value.view,
				new: value.new || undefined,
			}),
	});
	return (
		<div className="flex items-center gap-2">
			<form.Field name="view">
				{(field) => (
					<ToggleGroup
						aria-label="Show"
						variant="outline"
						spacing={0}
						value={[field.state.value]}
						onValueChange={(next) => {
							const [picked] = next as ListingsView[];
							// Pressing the open view again would clear the group; keep it.
							if (!picked || picked === field.state.value) return;
							field.handleChange(picked);
							void form.handleSubmit();
						}}
					>
						{LISTING_VIEWS.map((view) => (
							<ToggleGroupItem
								key={view}
								value={view}
								className="h-11 px-3 md:h-9"
							>
								{VIEW_LABELS[view]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				)}
			</form.Field>
			<form.Field name="new">
				{(field) => (
					<Toggle
						variant="outline"
						className="h-11 px-3 md:h-9"
						pressed={field.state.value}
						onPressedChange={(pressed) => {
							field.handleChange(pressed);
							void form.handleSubmit();
						}}
					>
						<span
							aria-hidden
							className="size-2 shrink-0 rounded-full bg-primary"
						/>
						New
						{newCount !== null && newCount > 0 && (
							<span className="text-muted-foreground tabular-nums">
								{newCount}
							</span>
						)}
					</Toggle>
				)}
			</form.Field>
		</div>
	);
}

type FilterFormValues = {
	marketplace: Marketplace | typeof ANY;
	type: ListingKind | typeof ANY;
	language: Language | typeof ANY;
	condition: ConditionFilter | typeof ANY;
	graded: "yes" | "no" | typeof ANY;
	match: MatchFilter | typeof ANY;
	location: string;
	card: string;
};

function formValues(filters: ListingFilters): FilterFormValues {
	return {
		marketplace: filters.marketplace ?? ANY,
		type: filters.type ?? ANY,
		language: filters.language ?? ANY,
		condition: filters.condition ?? ANY,
		graded: filters.graded === undefined ? ANY : filters.graded ? "yes" : "no",
		match: filters.match ?? ANY,
		location: filters.location ?? ANY,
		card: filters.card ?? ANY,
	};
}

/** The filters the drawer's fields set, keeping the view and New. */
function filtersFrom(
	values: FilterFormValues,
	filters: ListingFilters,
): ListingFilters {
	function set<T extends string>(value: T | typeof ANY): T | undefined {
		return value === ANY ? undefined : (value as T);
	}
	return {
		view: filters.view,
		new: filters.new,
		marketplace: set(values.marketplace),
		type: set(values.type),
		language: set(values.language),
		condition: set(values.condition),
		graded: values.graded === ANY ? undefined : values.graded === "yes",
		match: set(values.match),
		location: set(values.location),
		card: set(values.card),
	};
}

type SelectOption = { value: string; label: string };

/**
 * Every filter in one drawer. Each field applies as it changes; the footer
 * clears them or closes the drawer on the result.
 */
function ListingFiltersDrawer({
	open,
	onOpenChange,
	filters,
	matching,
	locations,
	cards,
	onChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	filters: ListingFilters;
	matching: number | null;
	locations: string[];
	cards: CardOption[];
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const form = useForm({
		defaultValues: formValues(filters),
		validators: { onSubmit: listingFiltersSchema },
		onSubmit: ({ value }) => onChange(filtersFrom(value, filters)),
	});

	// A location or Card from an old link still shows as picked.
	const countries =
		filters.location === undefined || locations.includes(filters.location)
			? locations
			: [...locations, filters.location];
	const locationOptions = countries.map((country) => ({
		value: country,
		label: country,
	}));
	const cardSelectOptions = cards.map((card) => ({
		value: card._id,
		label: card.label,
	}));
	if (filters.card && !cards.some((card) => card._id === filters.card)) {
		cardSelectOptions.push({ value: filters.card, label: "A removed Card" });
	}

	const fields: Array<{
		name: keyof FilterFormValues;
		label: string;
		options: SelectOption[];
	}> = [
		{ name: "card", label: "Card", options: cardSelectOptions },
		{ name: "type", label: "Type", options: entries(KIND_LABELS) },
		{ name: "match", label: "Match", options: entries(MATCH_LABELS) },
		{
			name: "condition",
			label: "Condition",
			options: CONDITION_FILTERS.map((value) => ({
				value,
				label: CONDITION_FILTER_LABELS[value],
			})),
		},
		{
			name: "language",
			label: "Language",
			options: LANGUAGES.map((value) => ({
				value,
				label: LANGUAGE_LABELS[value],
			})),
		},
		{
			name: "graded",
			label: "Graded",
			options: [
				{ value: "yes", label: "Graded" },
				{ value: "no", label: "Not graded" },
			],
		},
		{ name: "location", label: "Location", options: locationOptions },
		{
			name: "marketplace",
			label: "Marketplace",
			options: entries(MARKETPLACE_LABELS),
		},
	];

	return (
		<YugiohDrawer
			open={open}
			onOpenChange={onOpenChange}
			title="Filters"
			description="Filters narrow this view. Nothing is hidden until you set one."
			footer={
				<div className="flex gap-2">
					<Button
						variant="outline"
						className="h-11 flex-1 md:h-9"
						onClick={() => onChange(keepView(filters))}
					>
						Clear filters
					</Button>
					<Button
						className="h-11 flex-1 md:h-9"
						onClick={() => onOpenChange(false)}
					>
						{matching === null
							? "Show Listings"
							: `Show ${matching} ${matching === 1 ? "Listing" : "Listings"}`}
					</Button>
				</div>
			}
		>
			<FieldGroup>
				{fields.map(({ name, label, options }) => (
					<form.Field key={name} name={name}>
						{(field) => (
							<Field>
								<FieldLabel htmlFor={`listing-filter-${name}`}>
									{label}
								</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(next) => {
										// Badges and Clear change the URL behind the form's back;
										// start from what the URL says, then apply this field.
										form.reset(formValues(filters));
										field.handleChange(next as never);
										void form.handleSubmit();
									}}
								>
									<SelectTrigger
										id={`listing-filter-${name}`}
										className="h-11 w-full text-base md:h-9 md:text-sm"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value={ANY}>Any</SelectItem>
											{options.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
				))}
			</FieldGroup>
		</YugiohDrawer>
	);
}

function entries<T extends string>(labels: Record<T, string>): SelectOption[] {
	return (Object.entries(labels) as Array<[T, string]>).map(
		([value, label]) => ({ value, label }),
	);
}

/** The Deck's Cards by name; a name in two Sections says which. */
function cardOptions(deck: DeckView | null | undefined): CardOption[] {
	const cards = deck?.sections.flatMap((section) => section.cards) ?? [];
	return cards
		.map((card) => ({
			_id: card._id,
			label: cards.some(
				(other) => other._id !== card._id && other.cardName === card.cardName,
			)
				? `${card.cardName} · ${SECTION_LABELS[card.section]}`
				: card.cardName,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** A set filter in words, for its removable badge. */
function filterLabel(
	name: keyof ListingFilters,
	filters: ListingFilters,
	cards: CardOption[],
): string {
	switch (name) {
		case "view":
			return filters.view ? VIEW_LABELS[filters.view] : "";
		case "new":
			return "New";
		case "marketplace":
			return filters.marketplace ? MARKETPLACE_LABELS[filters.marketplace] : "";
		case "type":
			return filters.type ? KIND_LABELS[filters.type] : "";
		case "language":
			return filters.language ? LANGUAGE_LABELS[filters.language] : "";
		case "condition":
			return filters.condition === "unknown"
				? "Condition not stated"
				: filters.condition
					? READ_CONDITION_LABELS[filters.condition]
					: "";
		case "graded":
			return filters.graded ? "Graded" : "Not graded";
		case "match":
			return filters.match ? MATCH_LABELS[filters.match] : "";
		case "location":
			return filters.location ?? "";
		case "card":
			return (
				cards.find((card) => card._id === filters.card)?.label ??
				"A removed Card"
			);
	}
}

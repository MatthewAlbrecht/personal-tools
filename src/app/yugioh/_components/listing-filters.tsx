"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "convex/react";
import { Ban, ListFilter, X } from "lucide-react";
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
import {
	PRIORITIES,
	PRIORITY_LABELS,
	type Priority,
	SECTION_LABELS,
} from "~/lib/yugioh/deck";
import {
	CONDITION_FILTERS,
	type ConditionFilter,
	LISTING_VIEWS,
	type ListingFilters,
	type ListingKind,
	type ListingsView,
	type Marketplace,
	activeFilterCount,
	defaultListingFilters,
	extraFilters,
	isDefaultListingFilters,
	withCardShown,
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
import { PRIORITY_ICONS } from "./card-priority";
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

/** A Card the Card filter can pick. */
type CardOption = { _id: string; label: string };

/**
 * The Listings toolbar: the view (Available · Sold), the New toggle within
 * it, the Filters button with how many more are set, Marked wrong (the
 * Rejected Listings, to restore a mistake), and those filters as
 * removable chips, the defaults (English, Not graded) included so it's clear
 * why some Listings are hidden. Every change is a URL change, through
 * `onChange`.
 */
export function ListingsToolbar({
	deckId,
	filters,
	newCount,
	rejectedCount,
	matching,
	locations,
	onChange,
}: {
	deckId: Id<"yugiohDecks">;
	filters: ListingFilters;
	/** Null while loading. */
	newCount: number | null;
	/** How many of the view's Listings are marked wrong; null while loading. */
	rejectedCount: number | null;
	matching: number | null;
	locations: string[];
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });
	const cards: CardOption[] = cardOptions(deck);
	const extra = extraFilters(filters);
	const count = activeFilterCount(filters);

	return (
		<div className="flex flex-col gap-2">
			<div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
				<ViewToggles
					key={`${filters.view ?? "available"}-${filters.new ?? false}-${filters.rejected ?? false}`}
					filters={filters}
					newCount={newCount}
					rejectedCount={rejectedCount}
					onChange={onChange}
				/>
				<Button
					variant="outline"
					className="h-11 md:h-9"
					onClick={() => setDrawerOpen(true)}
				>
					<ListFilter data-icon="inline-start" />
					Filters
					{count > 0 && (
						<Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums">
							{count}
							<span className="sr-only"> set</span>
						</Badge>
					)}
				</Button>
			</div>
			{extra.length > 0 && (
				<ul aria-label="Filters set" className="flex flex-wrap gap-1.5">
					{extra.map((name) => {
						if (name === "excludeCards") {
							return (filters.excludeCards ?? []).map((cardId) => (
								<li key={`hide-${cardId}`}>
									<FilterChip
										label={`Hiding ${cardLabel(cardId, cards)}`}
										removeLabel={`Show ${cardLabel(cardId, cards)} again`}
										onRemove={() => onChange(withCardShown(filters, cardId))}
									/>
								</li>
							));
						}
						const label = filterLabel(name, filters, cards);
						return (
							<li key={name}>
								<FilterChip
									label={label}
									removeLabel={`Remove filter: ${label}`}
									onRemove={() => onChange({ ...filters, [name]: undefined })}
								/>
							</li>
						);
					})}
					{!isDefaultListingFilters(filters) && (
						<li>
							<Button
								variant="ghost"
								size="sm"
								className="h-11 md:h-8"
								onClick={() => onChange(defaultListingFilters(filters))}
							>
								Reset
							</Button>
						</li>
					)}
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

/** A set filter as a removable chip. */
function FilterChip({
	label,
	removeLabel,
	onRemove,
}: {
	label: string;
	removeLabel: string;
	onRemove: () => void;
}): React.ReactElement {
	return (
		<Button
			variant="secondary"
			size="sm"
			className="h-11 max-w-72 rounded-full pr-2 md:h-8"
			aria-label={removeLabel}
			title={label}
			onClick={onRemove}
		>
			<span className="truncate">{label}</span>
			<X data-icon="inline-end" aria-hidden />
		</Button>
	);
}

/**
 * Available · Sold, then New: Listings first seen since my last visit, within
 * the view, with how many there are; and Marked wrong, the view's Rejected
 * Listings (shown when there are some, or it's on).
 */
function ViewToggles({
	filters,
	newCount,
	rejectedCount,
	onChange,
}: {
	filters: ListingFilters;
	newCount: number | null;
	rejectedCount: number | null;
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const form = useForm({
		defaultValues: {
			view: filters.view ?? "available",
			new: filters.new ?? false,
			rejected: filters.rejected ?? false,
		},
		validators: { onSubmit: listingsViewSchema },
		onSubmit: ({ value }) =>
			onChange({
				...filters,
				view: value.view === "available" ? undefined : value.view,
				new: value.new || undefined,
				rejected: value.rejected || undefined,
			}),
	});
	const showRejected =
		filters.rejected || (rejectedCount !== null && rejectedCount > 0);
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
						New
						{newCount !== null && newCount > 0 && (
							<span className="text-muted-foreground tabular-nums">
								{newCount}
							</span>
						)}
					</Toggle>
				)}
			</form.Field>
			{showRejected ? (
				<form.Field name="rejected">
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
							<Ban aria-hidden />
							Marked wrong
							{rejectedCount !== null && rejectedCount > 0 && (
								<span className="text-muted-foreground tabular-nums">
									{rejectedCount}
								</span>
							)}
						</Toggle>
					)}
				</form.Field>
			) : null}
		</div>
	);
}

type FilterFormValues = {
	marketplace: Marketplace | typeof ANY;
	type: ListingKind | typeof ANY;
	language: Language | typeof ANY;
	condition: ConditionFilter | typeof ANY;
	graded: "yes" | "no" | typeof ANY;
	location: string;
	card: string;
	priority: Priority[];
};

function formValues(filters: ListingFilters): FilterFormValues {
	return {
		marketplace: filters.marketplace ?? ANY,
		type: filters.type ?? ANY,
		language: filters.language ?? ANY,
		condition: filters.condition ?? ANY,
		graded: filters.graded === undefined ? ANY : filters.graded ? "yes" : "no",
		location: filters.location ?? ANY,
		card: filters.card ?? ANY,
		priority: filters.priority ?? [],
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
		rejected: filters.rejected,
		location: set(values.location),
		card: set(values.card),
		excludeCards: filters.excludeCards,
		priority: values.priority.length > 0 ? values.priority : undefined,
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
		name: Exclude<keyof FilterFormValues, "priority">;
		label: string;
		options: SelectOption[];
		/** What the field's "no filter" choice says. */
		anyLabel?: string;
	}> = [
		{ name: "card", label: "Card", options: cardSelectOptions },
		{ name: "type", label: "Type", options: entries(KIND_LABELS) },
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
			anyLabel: "Any language",
			options: LANGUAGES.map((value) => ({
				value,
				label: LANGUAGE_LABELS[value],
			})),
		},
		{
			name: "graded",
			label: "Graded",
			anyLabel: "Graded or not",
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
			description="Filters narrow this view. English and Not graded are on until you change them."
			footer={
				<div className="flex gap-2">
					<Button
						variant="outline"
						className="h-11 flex-1 md:h-9"
						disabled={isDefaultListingFilters(filters)}
						onClick={() => onChange(defaultListingFilters(filters))}
					>
						Reset filters
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
				<form.Field name="priority">
					{(field) => (
						<Field>
							<FieldLabel id="listing-filter-priority-label">
								Card priority
							</FieldLabel>
							<ToggleGroup
								aria-labelledby="listing-filter-priority-label"
								multiple
								variant="outline"
								spacing={0}
								className="w-full"
								value={filters.priority ?? []}
								onValueChange={(next) => {
									// As with the selects: start from the URL, then apply this.
									form.reset(formValues(filters));
									const picked = new Set(next);
									field.handleChange(PRIORITIES.filter((p) => picked.has(p)));
									void form.handleSubmit();
								}}
							>
								{PRIORITIES.map((priority) => {
									const Icon = PRIORITY_ICONS[priority];
									return (
										<ToggleGroupItem
											key={priority}
											value={priority}
											className="h-11 flex-1 md:h-9"
										>
											<Icon aria-hidden data-icon="inline-start" />
											{PRIORITY_LABELS[priority]}
										</ToggleGroupItem>
									);
								})}
							</ToggleGroup>
						</Field>
					)}
				</form.Field>
				{fields.map(({ name, label, options, anyLabel = "Any" }) => (
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
											<SelectItem value={ANY}>{anyLabel}</SelectItem>
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
		case "rejected":
			return "Marked wrong";
		case "location":
			return filters.location ?? "";
		case "card":
			return filters.card ? cardLabel(filters.card, cards) : "";
		case "excludeCards":
			return `Hiding ${filters.excludeCards?.length ?? 0} Cards`;
		case "priority":
			return priorityLabel(filters.priority ?? []);
	}
}

/** "High priority", "High or Low priority": the priority filter's chip. */
function priorityLabel(priorities: Priority[]): string {
	const names = priorities.map((priority) => PRIORITY_LABELS[priority]);
	const list =
		names.length > 1
			? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
			: (names[0] ?? "");
	return `${list} priority`;
}

/** A Card's name as the Card filter shows it, or "A removed Card". */
function cardLabel(cardId: string, cards: CardOption[]): string {
	return cards.find((card) => card._id === cardId)?.label ?? "A removed Card";
}

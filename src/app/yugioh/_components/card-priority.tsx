"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, Equal } from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Field, FieldLabel } from "~/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { applyCardPatch, updateCachedDeck } from "../_utils/optimistic";
import {
	ANY,
	cardsPriorityFilterSchema,
	prioritySchema,
} from "../_utils/schemas";
import type { DeckCard } from "../_utils/types";

/** Up, level, down: the mark each priority wears wherever it shows. */
export const PRIORITY_ICONS: Record<Priority, typeof ChevronUp> = {
	high: ChevronUp,
	medium: Equal,
	low: ChevronDown,
};

const SAVE_FAILED = "Couldn't save the priority. Try again.";

/** Sets a Card's priority at once, rolling back with a toast if it fails. */
function useSetPriority(
	deckId: Id<"yugiohDecks">,
): (deckCardId: Id<"yugiohDeckCards">, priority: Priority) => Promise<void> {
	const updateCard = useMutation(
		api.yugioh.decks.updateCard,
	).withOptimisticUpdate((store, { deckCardId, ...patch }) => {
		updateCachedDeck(store, deckId, (deck) =>
			applyCardPatch(deck, deckCardId, patch),
		);
	});
	return async (deckCardId, priority) => {
		try {
			await updateCard({ deckCardId, priority });
		} catch (error) {
			toast.error(errorMessage(error, SAVE_FAILED));
		}
	};
}

/**
 * A Card's priority on its tile, over the art's bottom-left corner, and the
 * menu to change it. High is filled and Low outlined, so each reads at a
 * glance over any art; Medium, the default, stays out of the way until the
 * tile is hovered or focused (on touch screens it shows faintly, as there's
 * no hover).
 */
export function TilePriorityMenu({
	deckId,
	card,
}: {
	deckId: Id<"yugiohDecks">;
	card: DeckCard;
}): React.ReactElement {
	const setPriority = useSetPriority(deckId);
	const Icon = PRIORITY_ICONS[card.priority];
	const label = PRIORITY_LABELS[card.priority];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`${label} priority: change ${card.cardName}'s priority`}
					title={`${label} priority`}
					data-priority={card.priority}
					className={cn(
						// Sits inside the art's bottom-left corner; the hit area reaches 44px.
						"before:-inset-2.5 sm:before:-inset-2 absolute bottom-1.5 left-1.5 size-6 rounded-full shadow-sm ring-1 backdrop-blur-sm before:absolute sm:bottom-2 sm:left-2 sm:size-7 [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-4",
						"transition-[background-color,color,opacity,box-shadow] duration-150 ease-out motion-reduce:transition-none",
						card.priority === "high" &&
							"bg-primary text-primary-foreground ring-primary/20 hover:bg-primary/90 hover:text-primary-foreground",
						card.priority === "low" &&
							"bg-background/85 text-muted-foreground ring-border hover:bg-background hover:text-foreground",
						card.priority === "medium" &&
							"bg-background/85 text-muted-foreground opacity-0 pointer-coarse:opacity-60 ring-border hover:bg-background hover:text-foreground focus-visible:opacity-100 group-focus-within/card:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100",
					)}
				>
					<Icon aria-hidden strokeWidth={2.5} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-36">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					Priority
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={card.priority}
					onValueChange={(next) => {
						const priority = PRIORITIES.find((p) => p === next);
						if (priority && priority !== card.priority) {
							void setPriority(card._id, priority);
						}
					}}
				>
					{PRIORITIES.map((priority) => {
						const ItemIcon = PRIORITY_ICONS[priority];
						return (
							<DropdownMenuRadioItem key={priority} value={priority}>
								<ItemIcon aria-hidden className="text-muted-foreground" />
								{PRIORITY_LABELS[priority]}
							</DropdownMenuRadioItem>
						);
					})}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** High / Medium / Low in the Card drawer. Saves as it changes. */
export function PriorityField({
	deckId,
	card,
}: {
	deckId: Id<"yugiohDecks">;
	card: DeckCard;
}): React.ReactElement {
	const setPriority = useSetPriority(deckId);
	const form = useForm({
		defaultValues: { priority: card.priority },
		validators: { onSubmit: prioritySchema },
		onSubmit: async ({ value }) => setPriority(card._id, value.priority),
	});

	return (
		<form.Field name="priority">
			{(field) => (
				<Field>
					<FieldLabel id="card-priority-label">Priority</FieldLabel>
					<ToggleGroup
						aria-labelledby="card-priority-label"
						variant="outline"
						spacing={0}
						className="w-full"
						// The saved value (optimistic), so a failed save shows what stuck.
						value={[card.priority]}
						onValueChange={(next) => {
							const picked = PRIORITIES.find((p) => p === next[0]);
							// Pressing the active option again would clear the group; keep it.
							if (!picked || picked === card.priority) return;
							field.handleChange(picked);
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
	);
}

/**
 * All / High / Medium / Low over the Cards grid, kept in the URL (through
 * `onChange`). Each priority wears its mark, so the filter and the tiles
 * read alike.
 */
export function CardsPriorityFilter({
	value,
	onChange,
}: {
	value: Priority | undefined;
	onChange: (priority: Priority | undefined) => void;
}): React.ReactElement {
	const form = useForm({
		defaultValues: { priority: value ?? ANY } as {
			priority: Priority | typeof ANY;
		},
		validators: { onSubmit: cardsPriorityFilterSchema },
		onSubmit: ({ value: next }) =>
			onChange(next.priority === ANY ? undefined : next.priority),
	});
	const current = value ?? ANY;

	return (
		<form.Field name="priority">
			{(field) => (
				<ToggleGroup
					aria-label="Show Cards of priority"
					variant="outline"
					spacing={0}
					value={[current]}
					onValueChange={(next) => {
						const [picked] = next as Array<Priority | typeof ANY>;
						// Pressing the active option again would clear the group; keep it.
						if (!picked || picked === current) return;
						field.handleChange(picked);
						void form.handleSubmit();
					}}
				>
					<ToggleGroupItem value={ANY} className="h-11 px-3 md:h-9">
						All
					</ToggleGroupItem>
					{PRIORITIES.map((priority) => {
						const Icon = PRIORITY_ICONS[priority];
						return (
							<ToggleGroupItem
								key={priority}
								value={priority}
								aria-label={`${PRIORITY_LABELS[priority]} priority`}
								title={`${PRIORITY_LABELS[priority]} priority`}
								className="h-11 px-2.5 md:h-9"
							>
								<Icon aria-hidden />
								<span className="max-sm:sr-only">
									{PRIORITY_LABELS[priority]}
								</span>
							</ToggleGroupItem>
						);
					})}
				</ToggleGroup>
			)}
		</form.Field>
	);
}

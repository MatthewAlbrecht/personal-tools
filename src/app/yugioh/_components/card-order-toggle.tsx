"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import type * as React from "react";
import { toast } from "sonner";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { CardOrder } from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { applyCardOrder } from "../_utils/optimistic";
import { cardOrderSchema } from "../_utils/schemas";

const OPTIONS: Array<{ value: CardOrder; label: string }> = [
	{ value: "byCost", label: "By cost" },
	{ value: "custom", label: "Custom" },
];

/** By cost / Custom for one Deck. Saves on change; the choice is kept per Deck. */
export function CardOrderToggle({
	deckId,
	value,
}: {
	deckId: Id<"yugiohDecks">;
	value: CardOrder;
}): React.ReactElement {
	const setCardOrder = useMutation(
		api.yugioh.decks.setCardOrder,
	).withOptimisticUpdate((store, args) => {
		const deck = store.getQuery(api.yugioh.decks.getDeck, { deckId });
		if (!deck) return;
		store.setQuery(
			api.yugioh.decks.getDeck,
			{ deckId },
			applyCardOrder(deck, args.cardOrder),
		);
	});

	const form = useForm({
		defaultValues: { cardOrder: value },
		validators: { onSubmit: cardOrderSchema },
		onSubmit: async ({ value: next }) => {
			try {
				await setCardOrder({ deckId, cardOrder: next.cardOrder });
			} catch (error) {
				toast.error(errorMessage(error, "Couldn't save. Try again."));
			}
		},
	});

	return (
		<form.Field name="cardOrder">
			{(field) => (
				<ToggleGroup
					aria-label="Card order"
					variant="outline"
					spacing={0}
					value={[value]}
					onValueChange={(next) => {
						const [picked] = next as CardOrder[];
						// Pressing the active option again would clear the group; keep it.
						if (!picked || picked === value) return;
						field.handleChange(picked);
						void form.handleSubmit();
					}}
				>
					{OPTIONS.map((option) => (
						<ToggleGroupItem
							key={option.value}
							value={option.value}
							className="h-11 px-3 md:h-9"
						>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			)}
		</form.Field>
	);
}

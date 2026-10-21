"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import { deckNameSchema } from "../_utils/schemas";
import { YugiohDrawer } from "./yugioh-drawer";

export function NewDeckDrawer({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): React.ReactElement {
	const router = useRouter();
	const createDeck = useMutation(api.yugioh.decks.createDeck);
	const form = useForm({
		defaultValues: { name: "" },
		validators: { onChange: deckNameSchema, onSubmit: deckNameSchema },
		onSubmit: async ({ value }) => {
			try {
				const deckId = await createDeck({ name: value.name });
				router.push(`/yugioh/decks/${deckId}`);
			} catch (error) {
				toast.error(
					errorMessage(error, "Couldn't create the Deck. Try again."),
				);
			}
		},
	});

	return (
		<YugiohDrawer
			open={open}
			onOpenChange={(next) => {
				if (!next) form.reset();
				onOpenChange(next);
			}}
			title="New Deck"
			description="Name the build. You'll add its Cards next."
		>
			<form
				id="new-deck-form"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="name">
						{(field) => {
							const invalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={invalid}>
									<FieldLabel htmlFor={field.name}>Deck name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										aria-invalid={invalid}
										autoComplete="off"
										placeholder="Snake-Eye Fire King"
										className="text-base md:text-sm"
									/>
									{invalid ? (
										<FieldError errors={field.state.meta.errors} />
									) : null}
								</Field>
							);
						}}
					</form.Field>
					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								Create Deck
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</YugiohDrawer>
	);
}

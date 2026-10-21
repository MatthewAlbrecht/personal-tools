"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { useRef } from "react";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import {
	MAX_COPIES_NEEDED,
	SECTIONS,
	SECTION_LABELS,
	type Section,
} from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { addCardSchema } from "../_utils/schemas";
import { OverloadedRaritiesCombobox, RarityCombobox } from "./printing-fields";
import { YugiohDrawer } from "./yugioh-drawer";

const COPY_OPTIONS = Array.from({ length: MAX_COPIES_NEEDED }, (_, i) => i + 1);

function emptyCard(section: Section) {
	return {
		cardName: "",
		setCode: "",
		rarity: "",
		overloadedRarities: [] as string[],
		section,
		copiesNeeded: 1,
	};
}

export function AddCardDrawer({
	deckId,
	open,
	onOpenChange,
}: {
	deckId: Id<"yugiohDecks">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): React.ReactElement {
	const addCard = useMutation(api.yugioh.decks.addCard);
	const nameInput = useRef<HTMLInputElement>(null);
	const form = useForm({
		defaultValues: emptyCard("main"),
		validators: { onChange: addCardSchema, onSubmit: addCardSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await addCard({ deckId, ...value });
				toast.success(`Added ${value.cardName.trim()}`);
				// Stay open for the next Card, keeping the Section.
				formApi.reset(emptyCard(value.section));
				nameInput.current?.focus();
			} catch (error) {
				toast.error(errorMessage(error, "Couldn't add the Card. Try again."));
			}
		},
	});

	return (
		<YugiohDrawer
			open={open}
			onOpenChange={onOpenChange}
			title="Add Card"
			description="The Printing you're after: set code and rarity."
			footer={
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" form="add-card-form" disabled={isSubmitting}>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							Add Card
						</Button>
					)}
				</form.Subscribe>
			}
		>
			<form
				id="add-card-form"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<FieldGroup>
					<form.Field name="cardName">
						{(field) => {
							const invalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={invalid}>
									<FieldLabel htmlFor="add-card-name">Card name</FieldLabel>
									<Input
										ref={nameInput}
										id="add-card-name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										aria-invalid={invalid}
										autoComplete="off"
										placeholder="Ash Blossom & Joyous Spring"
										className="text-base md:text-sm"
									/>
									{invalid ? (
										<FieldError errors={field.state.meta.errors} />
									) : null}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="setCode">
						{(field) => {
							const invalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={invalid}>
									<FieldLabel htmlFor="add-card-set-code">Set code</FieldLabel>
									<Input
										id="add-card-set-code"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										aria-invalid={invalid}
										autoComplete="off"
										autoCapitalize="characters"
										spellCheck={false}
										placeholder="RA01-EN008"
										className="font-mono text-base tracking-tight md:text-sm"
									/>
									{invalid ? (
										<FieldError errors={field.state.meta.errors} />
									) : null}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="rarity">
						{(field) => {
							const invalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={invalid}>
									<FieldLabel htmlFor="add-card-rarity">Rarity</FieldLabel>
									<RarityCombobox
										id="add-card-rarity"
										value={field.state.value}
										onChange={field.handleChange}
										onBlur={field.handleBlur}
										invalid={invalid}
									/>
									{invalid ? (
										<FieldError errors={field.state.meta.errors} />
									) : null}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="overloadedRarities">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="add-card-overloaded">
									Overloaded rarities
								</FieldLabel>
								<OverloadedRaritiesCombobox
									id="add-card-overloaded"
									value={field.state.value}
									onChange={field.handleChange}
								/>
								<FieldDescription>
									Other rarities printed under this set code.
								</FieldDescription>
							</Field>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="section">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="add-card-section">Section</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(next) =>
											field.handleChange(next as Section)
										}
									>
										<SelectTrigger id="add-card-section" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{SECTIONS.map((section) => (
													<SelectItem key={section} value={section}>
														{SECTION_LABELS[section]}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>

						<form.Field name="copiesNeeded">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="add-card-copies">
										Copies needed
									</FieldLabel>
									<Select
										value={String(field.state.value)}
										onValueChange={(next) => field.handleChange(Number(next))}
									>
										<SelectTrigger id="add-card-copies" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{COPY_OPTIONS.map((count) => (
													<SelectItem key={count} value={String(count)}>
														{count}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
					</div>
				</FieldGroup>
			</form>
		</YugiohDrawer>
	);
}

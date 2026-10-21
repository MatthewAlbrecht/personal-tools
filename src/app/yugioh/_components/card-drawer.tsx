"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "~/components/ui/button-group";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import type { Reference } from "~/lib/yugioh/deals";
import {
	CONDITIONS,
	CONDITION_LABELS,
	type Condition,
	MAX_COPIES_NEEDED,
	SECTION_LABELS,
} from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { type CardPatch, applyCardPatch } from "../_utils/optimistic";
import {
	chosenPrintingSchema,
	conditionSchema,
	copiesSchema,
	printingSchema,
} from "../_utils/schemas";
import type { CandidatePrinting, DeckCard } from "../_utils/types";
import { CardArt } from "./card-art";
import { ReferenceLine } from "./deal-grade";
import { OverloadedRaritiesCombobox, RarityCombobox } from "./printing-fields";
import { TcgplayerLink } from "./tcgplayer-link";
import { YugiohDrawer } from "./yugioh-drawer";

const SAVE_FAILED = "Couldn't save. Try again.";

/** Card details, opened from a row via `?card=`. Every change saves as it's made. */
export function CardDrawer({
	deckId,
	card,
	onClose,
}: {
	deckId: Id<"yugiohDecks">;
	card: DeckCard | null;
	onClose: () => void;
}): React.ReactElement {
	// Keep showing the last Card while the drawer animates closed.
	const [shown, setShown] = useState<DeckCard | null>(card);
	if (card !== null && card !== shown) setShown(card);

	const updateCard = useMutation(
		api.yugioh.decks.updateCard,
	).withOptimisticUpdate((store, { deckCardId, ...patch }) => {
		const deck = store.getQuery(api.yugioh.decks.getDeck, { deckId });
		if (!deck) return;
		store.setQuery(
			api.yugioh.decks.getDeck,
			{ deckId },
			applyCardPatch(deck, deckCardId, patch),
		);
	});

	async function save(patch: CardPatch): Promise<void> {
		if (!shown) return;
		try {
			await updateCard({ deckCardId: shown._id, ...patch });
		} catch (error) {
			toast.error(errorMessage(error, SAVE_FAILED));
		}
	}

	const chosen = shown?.candidates.find(
		(candidate) => candidate.printingId === shown.chosenPrintingId,
	);
	const pictured = chosen ?? shown?.candidates[0];

	return (
		<YugiohDrawer
			open={card !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={shown?.cardName ?? "Card"}
			header={
				shown ? (
					<DrawerHeader className="flex-row items-start gap-4 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
						<CardArt
							setCode={pictured?.setCode ?? null}
							imageUrl={pictured?.tcgplayer.imageUrl ?? null}
							alt={
								pictured
									? `${shown.cardName}, ${pictured.rarity}`
									: shown.cardName
							}
							size="drawer"
						/>
						<div className="flex min-w-0 flex-col gap-1">
							<DrawerTitle className="font-display text-xl leading-tight">
								{shown.cardName}
							</DrawerTitle>
							<DrawerDescription>
								{SECTION_LABELS[shown.section]} Deck
							</DrawerDescription>
						</div>
					</DrawerHeader>
				) : undefined
			}
			footer={shown ? <RemoveCard card={shown} onRemoved={onClose} /> : null}
		>
			{shown ? (
				<div className="flex flex-col gap-8">
					<FieldSet>
						<FieldLegend variant="label">Copies</FieldLegend>
						<div className="grid grid-cols-2 gap-4">
							<CopiesStepper
								key={`owned-${shown.copiesOwned}`}
								label="Owned"
								value={shown.copiesOwned}
								min={0}
								max={shown.copiesNeeded}
								decreaseLabel="Fewer owned"
								increaseLabel="More owned"
								onSave={(count) => save({ copiesOwned: count })}
							/>
							<CopiesStepper
								key={`needed-${shown.copiesNeeded}`}
								label="Needed"
								value={shown.copiesNeeded}
								min={1}
								max={MAX_COPIES_NEEDED}
								decreaseLabel="Fewer needed"
								increaseLabel="More needed"
								onSave={(count) => save({ copiesNeeded: count })}
							/>
						</div>
					</FieldSet>

					<ConditionField
						key={`condition-${shown._id}-${shown.lowestAcceptableCondition}`}
						value={shown.lowestAcceptableCondition}
						onSave={(lowestAcceptableCondition) =>
							save({ lowestAcceptableCondition })
						}
					/>

					<Printings key={shown._id} deckId={deckId} card={shown} />
				</div>
			) : null}
		</YugiohDrawer>
	);
}

function CopiesStepper({
	label,
	value,
	min,
	max,
	decreaseLabel,
	increaseLabel,
	onSave,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	decreaseLabel: string;
	increaseLabel: string;
	onSave: (count: number) => Promise<void>;
}): React.ReactElement {
	const form = useForm({
		defaultValues: { count: value },
		validators: {
			onSubmit: copiesSchema.extend({
				count: z.number().int().min(min).max(max),
			}),
		},
		onSubmit: async ({ value: next }) => onSave(next.count),
	});

	return (
		<form.Field name="count">
			{(field) => {
				function step(delta: number): void {
					field.handleChange(field.state.value + delta);
					void form.handleSubmit();
				}
				return (
					<Field>
						<FieldLabel className="font-normal text-muted-foreground text-xs">
							{label}
						</FieldLabel>
						<ButtonGroup aria-label={`Copies ${label.toLowerCase()}`}>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-11 md:size-9"
								aria-label={decreaseLabel}
								disabled={field.state.value <= min}
								onClick={() => step(-1)}
							>
								<Minus />
							</Button>
							<ButtonGroupText
								aria-live="polite"
								className="min-w-11 justify-center bg-background font-semibold text-base tabular-nums md:min-w-10"
							>
								{field.state.value}
							</ButtonGroupText>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="size-11 md:size-9"
								aria-label={increaseLabel}
								disabled={field.state.value >= max}
								onClick={() => step(1)}
							>
								<Plus />
							</Button>
						</ButtonGroup>
					</Field>
				);
			}}
		</form.Field>
	);
}

function ConditionField({
	value,
	onSave,
}: {
	value: Condition;
	onSave: (condition: Condition) => Promise<void>;
}): React.ReactElement {
	const form = useForm({
		defaultValues: { lowestAcceptableCondition: value },
		validators: { onSubmit: conditionSchema },
		onSubmit: async ({ value: next }) => onSave(next.lowestAcceptableCondition),
	});
	return (
		<form.Field name="lowestAcceptableCondition">
			{(field) => (
				<Field>
					<FieldLabel htmlFor="card-condition">
						Lowest acceptable condition
					</FieldLabel>
					<Select
						value={field.state.value}
						onValueChange={(next) => {
							field.handleChange(next as Condition);
							void form.handleSubmit();
						}}
					>
						<SelectTrigger id="card-condition" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{CONDITIONS.map((condition) => (
									<SelectItem key={condition} value={condition}>
										{CONDITION_LABELS[condition]}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<FieldDescription>
						Listings in worse condition won't count toward prices.
					</FieldDescription>
				</Field>
			)}
		</form.Field>
	);
}

/**
 * Candidate Printings as a radio group. Once one is chosen, the others
 * collapse under "N other Printings" but stay saved.
 */
function Printings({
	deckId,
	card,
}: {
	deckId: Id<"yugiohDecks">;
	card: DeckCard;
}): React.ReactElement {
	const choosePrinting = useMutation(api.yugioh.decks.choosePrinting);
	const now = useMinuteClock();
	const references = useQuery(api.yugioh.deals.listReferencePrices, {
		deckId,
		now,
	});
	function ebayReference(
		printingId: Id<"yugiohPrintings">,
	): Reference | undefined {
		return references?.find(
			(reference) =>
				reference.deckCardId === card._id &&
				reference.printingId === printingId,
		)?.ebay;
	}
	const [showOthers, setShowOthers] = useState(false);
	const [adding, setAdding] = useState(false);
	const decided = card.chosenPrintingId !== null;
	const [first, ...rest] = card.candidates;
	const canRemove = card.candidates.length > 1;

	const form = useForm({
		defaultValues: { printingId: card.chosenPrintingId ?? "" },
		validators: { onSubmit: chosenPrintingSchema },
		onSubmit: async ({ value }) => {
			try {
				await choosePrinting({
					deckCardId: card._id,
					printingId: value.printingId as Id<"yugiohPrintings">,
				});
			} catch (error) {
				toast.error(errorMessage(error, SAVE_FAILED));
			}
		},
	});

	return (
		<FieldSet>
			<FieldLegend variant="label">Printings</FieldLegend>
			<FieldDescription>
				{decided
					? "Every Copy will be the Chosen Printing."
					: "Choose the Printing every Copy will be."}
			</FieldDescription>
			<form.Field name="printingId">
				{(field) => (
					<RadioGroup
						value={field.state.value}
						onValueChange={(next) => {
							field.handleChange(String(next));
							// Choosing collapses the others in place.
							setShowOthers(false);
							void form.handleSubmit();
						}}
						className="gap-2"
					>
						{first ? (
							<CandidateOption
								cardName={card.cardName}
								candidate={first}
								ebayReference={ebayReference(first.printingId)}
								chosen={first.printingId === card.chosenPrintingId}
								canRemove={canRemove}
							/>
						) : null}
						{rest.length > 0 ? (
							<Collapsible
								open={!decided || showOthers}
								onOpenChange={setShowOthers}
							>
								{decided ? (
									<CollapsibleTrigger
										render={
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="group/others -ml-2 text-muted-foreground"
											/>
										}
									>
										<ChevronDown
											data-icon="inline-start"
											className="transition-transform duration-200 ease-out group-data-[panel-open]/others:rotate-180 motion-reduce:transition-none"
										/>
										{rest.length} other{" "}
										{rest.length === 1 ? "Printing" : "Printings"}
									</CollapsibleTrigger>
								) : null}
								<CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
									<div className="flex flex-col gap-2 pt-2">
										{rest.map((candidate) => (
											<CandidateOption
												key={candidate._id}
												cardName={card.cardName}
												candidate={candidate}
												ebayReference={ebayReference(candidate.printingId)}
												chosen={false}
												canRemove={canRemove}
											/>
										))}
									</div>
								</CollapsibleContent>
							</Collapsible>
						) : null}
					</RadioGroup>
				)}
			</form.Field>

			<Collapsible open={adding} onOpenChange={setAdding}>
				{adding ? null : (
					<CollapsibleTrigger
						render={
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="-ml-2 w-fit"
							/>
						}
					>
						<Plus data-icon="inline-start" />
						Add another Printing
					</CollapsibleTrigger>
				)}
				<CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
					<AddPrintingForm
						deckCardId={card._id}
						onDone={() => {
							setAdding(false);
							if (decided) setShowOthers(true);
						}}
					/>
				</CollapsibleContent>
			</Collapsible>
		</FieldSet>
	);
}

function CandidateOption({
	cardName,
	candidate,
	ebayReference,
	chosen,
	canRemove,
}: {
	cardName: string;
	candidate: CandidatePrinting;
	/** Undefined while loading. */
	ebayReference: Reference | undefined;
	chosen: boolean;
	canRemove: boolean;
}): React.ReactElement {
	const id = `printing-${candidate.printingId}`;
	return (
		<div className="flex items-start gap-1">
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<FieldLabel htmlFor={id}>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldTitle className="flex-wrap">
								<span className="font-mono text-[0.8125rem] tracking-tight">
									{candidate.setCode}
								</span>
								<span>{candidate.rarity}</span>
								{chosen ? <span className="sr-only">(Chosen)</span> : null}
							</FieldTitle>
							{candidate.overloadedRarities.length > 0 ? (
								<FieldDescription className="text-xs">
									Set code also printed as{" "}
									{candidate.overloadedRarities.join(", ")}
								</FieldDescription>
							) : null}
						</FieldContent>
						<RadioGroupItem value={candidate.printingId} id={id} />
					</Field>
				</FieldLabel>
				<div className="flex flex-col gap-1 px-3 pb-1">
					{ebayReference === undefined ? (
						<Skeleton className="h-5 w-40" />
					) : (
						<ReferenceLine reference={ebayReference} className="text-sm" />
					)}
					<TcgplayerLink cardName={cardName} candidate={candidate} />
				</div>
			</div>
			{canRemove ? <RemoveCandidate candidate={candidate} /> : null}
		</div>
	);
}

function RemoveCandidate({
	candidate,
}: {
	candidate: CandidatePrinting;
}): React.ReactElement {
	const removeCandidate = useMutation(api.yugioh.decks.removeCandidatePrinting);
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="mt-1.5 size-11 text-muted-foreground md:size-9"
					aria-label={`Remove ${candidate.setCode} ${candidate.rarity}`}
				>
					<Trash2 />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove this Printing?</AlertDialogTitle>
					<AlertDialogDescription>
						{candidate.setCode} {candidate.rarity} stops being a Candidate for
						this Card. You can add it back later.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep it</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-white hover:bg-destructive/90"
						onClick={async () => {
							try {
								await removeCandidate({ candidateId: candidate._id });
							} catch (error) {
								toast.error(
									errorMessage(
										error,
										"Couldn't remove the Printing. Try again.",
									),
								);
							}
						}}
					>
						Remove Printing
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function AddPrintingForm({
	deckCardId,
	onDone,
}: {
	deckCardId: Id<"yugiohDeckCards">;
	onDone: () => void;
}): React.ReactElement {
	const addCandidate = useMutation(api.yugioh.decks.addCandidatePrinting);
	const form = useForm({
		defaultValues: {
			setCode: "",
			rarity: "",
			overloadedRarities: [] as string[],
		},
		validators: { onChange: printingSchema, onSubmit: printingSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await addCandidate({ deckCardId, ...value });
				formApi.reset();
				onDone();
			} catch (error) {
				toast.error(
					errorMessage(error, "Couldn't add the Printing. Try again."),
				);
			}
		},
	});

	return (
		<form
			className="pt-3"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-4 rounded-lg bg-muted/40 p-3">
				<form.Field name="setCode">
					{(field) => {
						const invalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={invalid}>
								<FieldLabel htmlFor="add-printing-set-code">
									Set code
								</FieldLabel>
								<Input
									id="add-printing-set-code"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={invalid}
									autoComplete="off"
									autoCapitalize="characters"
									spellCheck={false}
									placeholder="MP23-EN001"
									className="bg-background font-mono text-base tracking-tight md:text-sm"
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
								<FieldLabel htmlFor="add-printing-rarity">Rarity</FieldLabel>
								<RarityCombobox
									id="add-printing-rarity"
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
							<FieldLabel htmlFor="add-printing-overloaded">
								Overloaded rarities
							</FieldLabel>
							<OverloadedRaritiesCombobox
								id="add-printing-overloaded"
								value={field.state.value}
								onChange={field.handleChange}
							/>
							<FieldDescription>
								Other rarities printed under this set code.
							</FieldDescription>
						</Field>
					)}
				</form.Field>
				<div className="flex gap-2">
					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button type="submit" size="sm" disabled={isSubmitting}>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								Add Printing
							</Button>
						)}
					</form.Subscribe>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							form.reset();
							onDone();
						}}
					>
						Cancel
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}

function RemoveCard({
	card,
	onRemoved,
}: {
	card: DeckCard;
	onRemoved: () => void;
}): React.ReactElement {
	const removeCard = useMutation(api.yugioh.decks.removeCard);
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					className="text-destructive hover:text-destructive"
				>
					<Trash2 data-icon="inline-start" />
					Remove Card
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove {card.cardName}?</AlertDialogTitle>
					<AlertDialogDescription>
						It leaves this Deck with its Candidate Printings and Copies owned.
						Other Decks keep theirs.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep it</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-white hover:bg-destructive/90"
						onClick={async () => {
							try {
								onRemoved();
								await removeCard({ deckCardId: card._id });
							} catch (error) {
								toast.error(
									errorMessage(error, "Couldn't remove the Card. Try again."),
								);
							}
						}}
					>
						Remove Card
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

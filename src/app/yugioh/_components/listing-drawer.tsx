"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "~/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import {
	formatMoney,
	gradingLabel,
	listingTypeLabel,
} from "~/lib/yugioh/listing-format";
import {
	LANGUAGE_LABELS,
	READ_CONDITION_LABELS,
	type TitleRead,
} from "~/lib/yugioh/title-reading";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { NOT_A_MATCH, listingMatchSchema } from "../_utils/schemas";
import type { ListingView } from "../_utils/types";
import { MatchSummary } from "./listing-match";
import { YugiohDrawer } from "./yugioh-drawer";

const SAVE_FAILED = "Couldn't save. Try again.";

/** One Listing's details, read title and match, opened with `?listing=`. */
export function ListingDrawer({
	deckId,
	listing,
	now,
	onClose,
}: {
	deckId: Id<"yugiohDecks">;
	listing: ListingView | null;
	now: number;
	onClose: () => void;
}): React.ReactElement {
	return (
		<YugiohDrawer
			open={listing !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Listing"
			header={
				listing ? (
					<DrawerHeader className="gap-1 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
						<DrawerTitle className="font-display text-2xl tabular-nums">
							{listing.price === null
								? "No price"
								: formatMoney(listing.price, listing.currency ?? "USD")}
						</DrawerTitle>
						<p className="text-muted-foreground text-sm tabular-nums">
							eBay · {listingTypeLabel(listing, now)}
							{listing.shipping === null
								? null
								: listing.shipping === 0
									? " · Free shipping"
									: ` · +${formatMoney(listing.shipping, listing.currency ?? "USD")} shipping`}
						</p>
					</DrawerHeader>
				) : undefined
			}
			footer={
				listing ? (
					<Button asChild className="h-11 w-full md:h-9">
						<a href={listing.url} target="_blank" rel="noopener noreferrer">
							Open on eBay
							<ExternalLink data-icon="inline-end" />
						</a>
					</Button>
				) : undefined
			}
		>
			{listing ? (
				<div className="flex flex-col gap-6">
					<p className="text-sm">{listing.title}</p>
					<TitleSays listing={listing} />
					<MatchForm
						key={`${listing._id}-${listing.match.status}-${listing.match.printing?._id ?? ""}`}
						deckId={deckId}
						listing={listing}
					/>
				</div>
			) : null}
		</YugiohDrawer>
	);
}

/** "What the title says": everything the AI read, as a definition list. */
function TitleSays({ listing }: { listing: ListingView }): React.ReactElement {
	const read = listing.titleRead;
	return (
		<section aria-labelledby="title-says" className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-3">
				<h3 id="title-says" className="font-medium text-sm">
					What the title says
				</h3>
				{read ? (
					<span className="text-muted-foreground text-xs">Read from title</span>
				) : null}
			</div>
			{read ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
					<ReadRow term="Set code">
						{read.setCode === null ? (
							<NotStated />
						) : (
							<span className="font-mono text-[0.8125rem] tracking-tight">
								{read.setCode}
							</span>
						)}
					</ReadRow>
					<ReadRow term="Rarity">{read.rarity ?? <NotStated />}</ReadRow>
					<ReadRow term="Condition">
						{read.condition === null ? (
							<span className="text-muted-foreground">
								Unknown, check photos
							</span>
						) : (
							READ_CONDITION_LABELS[read.condition]
						)}
					</ReadRow>
					<ReadRow term="Copies">
						<span className="tabular-nums">{read.copies}</span>
					</ReadRow>
					<ReadRow term="Language">{LANGUAGE_LABELS[read.language]}</ReadRow>
					<ReadRow term="Grading">{gradingLabel(read)}</ReadRow>
				</dl>
			) : listing.match.status === "reading" ? (
				<p className="flex items-center gap-2 text-muted-foreground text-sm">
					<Spinner />
					Reading the title…
				</p>
			) : (
				<p className="text-muted-foreground text-sm">
					Couldn't read this title. Its set code alone decided the match.
				</p>
			)}
		</section>
	);
}

function ReadRow({
	term,
	children,
}: {
	term: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<>
			<dt className="text-muted-foreground">{term}</dt>
			<dd>{children}</dd>
		</>
	);
}

function NotStated(): React.ReactElement {
	return <span className="text-muted-foreground">Not stated</span>;
}

/**
 * Sets the match myself: one of this Deck's Printings, or "Not a match". My
 * choice is kept on every later capture.
 */
function MatchForm({
	deckId,
	listing,
}: {
	deckId: Id<"yugiohDecks">;
	listing: ListingView;
}): React.ReactElement {
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });
	const setListingMatch = useMutation(api.yugioh.listings.setListingMatch);
	const { match } = listing;

	const form = useForm({
		defaultValues: {
			match:
				match.status === "match" && match.printing
					? (match.printing._id as string)
					: match.status === "notMatch"
						? NOT_A_MATCH
						: "",
		},
		validators: { onSubmit: listingMatchSchema },
		onSubmit: async ({ value }) => {
			try {
				await setListingMatch({
					listingId: listing._id,
					printingId:
						value.match === NOT_A_MATCH
							? null
							: (value.match as Id<"yugiohPrintings">),
				});
			} catch (error) {
				toast.error(errorMessage(error, SAVE_FAILED));
			}
		},
	});

	const options = printingOptions(deck?.sections ?? [], match.printing);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<FieldSet>
				<FieldLegend variant="label">Match</FieldLegend>
				<div className="flex items-center gap-2 text-sm">
					<span className="text-muted-foreground">Now:</span>
					<MatchSummary match={match} />
				</div>
				<form.Field name="match">
					{(field) => {
						const invalid =
							field.state.meta.isTouched && field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={invalid || undefined}>
								<FieldLabel htmlFor="listing-match">
									Which Printing is this?
								</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(next) => field.handleChange(next)}
								>
									<SelectTrigger
										id="listing-match"
										className="w-full min-w-0"
										aria-invalid={invalid || undefined}
									>
										<SelectValue placeholder="Choose a Printing" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{options.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectGroup>
										<SelectSeparator />
										<SelectGroup>
											<SelectItem value={NOT_A_MATCH}>Not a match</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
								{match.overridden ? (
									<FieldDescription>
										Your choice. Kept on future captures.
									</FieldDescription>
								) : null}
								{invalid ? (
									<FieldError errors={field.state.meta.errors} />
								) : null}
							</Field>
						);
					}}
				</form.Field>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button
							type="submit"
							variant="outline"
							className="h-11 self-start md:h-9"
							disabled={isSubmitting}
						>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							Save
						</Button>
					)}
				</form.Subscribe>
			</FieldSet>
		</form>
	);
}

type PrintingOption = { value: string; label: string };

/**
 * The Deck's Printings, one per set code and rarity, plus the matched
 * Printing when it belongs to another Deck.
 */
function printingOptions(
	sections: {
		cards: {
			cardName: string;
			candidates: { printingId: string; setCode: string; rarity: string }[];
		}[];
	}[],
	matched: ListingView["match"]["printing"],
): PrintingOption[] {
	const options = new Map<string, PrintingOption>();
	for (const card of sections.flatMap((section) => section.cards)) {
		for (const candidate of card.candidates) {
			options.set(candidate.printingId, {
				value: candidate.printingId,
				label: `${card.cardName} · ${candidate.setCode} ${candidate.rarity}`,
			});
		}
	}
	if (matched && !options.has(matched._id)) {
		options.set(matched._id, {
			value: matched._id,
			label: `${matched.cardName} · ${matched.setCode} ${matched.rarity}`,
		});
	}
	return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}

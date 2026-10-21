"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
	Ban,
	ChevronDown,
	ExternalLink,
	PencilLine,
	Undo2,
} from "lucide-react";
import Link from "next/link";
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
import { REFERENCE_WINDOW_DAYS } from "~/lib/yugioh/deals";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import {
	type ConditionChoice,
	isConditionSetByYou,
	listingCondition,
} from "~/lib/yugioh/listing-edits";
import {
	MARKETPLACE_LABELS,
	READ_CONDITION_ABBREVIATIONS,
	formatMoney,
	gradingLabel,
	listingTypeLabel,
} from "~/lib/yugioh/listing-format";
import {
	REJECTION_REASON_LABELS,
	type RejectionReason,
} from "~/lib/yugioh/listing-rejection";
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
import { DealGradeBadge, ReferenceLine } from "./deal-grade";
import { ConditionMenu, RarityMenu } from "./listing-edits";
import { MatchSummary } from "./listing-match";
import { MarkWrongMenu } from "./mark-wrong";
import { YugiohDrawer } from "./yugioh-drawer";

const SAVE_FAILED = "Couldn't save. Try again.";

/**
 * One Listing's details, read title and match, opened with `?listing=`. Its
 * footer marks it wrong (or restores it) and opens it on the marketplace.
 */
export function ListingDrawer({
	deckId,
	listing,
	now,
	onClose,
	onMarkWrong,
	onUnmark,
	onSetCondition,
	onSetRarity,
}: {
	deckId: Id<"yugiohDecks">;
	listing: ListingView | null;
	now: number;
	onClose: () => void;
	onMarkWrong: (listing: ListingView, reason: RejectionReason) => void;
	onUnmark: (listing: ListingView) => void;
	onSetCondition: (
		listing: ListingView,
		condition: ConditionChoice | null,
	) => void;
	onSetRarity: (
		listing: ListingView,
		choice: ListingView["rarityChoices"][number],
	) => void;
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
							{headline(listing)}
						</DrawerTitle>
						<p className="text-muted-foreground text-sm tabular-nums">
							{MARKETPLACE_LABELS[listing.marketplace]} ·{" "}
							{listingTypeLabel(listing, now)}
						</p>
						{listing.rejection ? (
							<p className="flex items-center gap-1.5 text-sm">
								<Ban aria-hidden className="size-4 text-muted-foreground" />
								Marked wrong:{" "}
								{REJECTION_REASON_LABELS[listing.rejection.reason]}
								<span className="text-muted-foreground">
									·{" "}
									{formatDistanceToNowStrict(listing.rejection.at, {
										addSuffix: true,
									})}
								</span>
							</p>
						) : (
							<DealLine deal={listing.deal} marketplace={listing.marketplace} />
						)}
					</DrawerHeader>
				) : undefined
			}
			footer={
				listing ? (
					<div className="flex gap-2">
						{listing.rejection ? (
							<Button
								variant="outline"
								className="h-11 flex-1 md:h-9"
								onClick={() => onUnmark(listing)}
							>
								<Undo2 data-icon="inline-start" />
								Restore
							</Button>
						) : (
							<MarkWrongMenu
								align="start"
								onPick={(reason) => onMarkWrong(listing, reason)}
							>
								<Button variant="outline" className="h-11 flex-1 md:h-9">
									<Ban data-icon="inline-start" />
									Mark as wrong
								</Button>
							</MarkWrongMenu>
						)}
						<Button asChild className="h-11 flex-1 md:h-9">
							<a href={listing.url} target="_blank" rel="noopener noreferrer">
								Open on {MARKETPLACE_LABELS[listing.marketplace]}
								<ExternalLink data-icon="inline-end" />
							</a>
						</Button>
					</div>
				) : undefined
			}
		>
			{listing ? (
				<div className="flex flex-col gap-6">
					<p className="text-sm">{listing.title}</p>
					<PriceBreakdown listing={listing} />
					{listing.rejection ? null : (
						<ConditionAndRarity
							listing={listing}
							onSetCondition={(condition) => onSetCondition(listing, condition)}
							onSetRarity={(choice) => onSetRarity(listing, choice)}
						/>
					)}
					{listing.tcgplayer ? (
						<TcgplayerPageSays listing={listing} details={listing.tcgplayer} />
					) : (
						<TitleSays listing={listing} />
					)}
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

/**
 * How the Listing compares with its Printing's Reference price on its own
 * marketplace: the grade and "78% of $54.00 eBay ref (11 sales, 60 days)".
 * Without a grade, why not. Nothing for a Listing that isn't for a Printing
 * this Deck wants.
 */
function DealLine({
	deal,
	marketplace,
}: {
	deal: ListingView["deal"];
	marketplace: ListingView["marketplace"];
}): React.ReactElement | null {
	const reference = deal.reference;
	if (reference === null) return null;
	if (
		reference.price === null ||
		deal.grade === null ||
		deal.percentOfReference === null
	) {
		return (
			<ReferenceLine
				reference={reference}
				marketplace={marketplace}
				className="text-sm"
			/>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
			<DealGradeBadge deal={deal} />
			<span>
				{deal.percentOfReference}% of {formatMoney(reference.price, "USD")}{" "}
				{MARKETPLACE_LABELS[marketplace]} ref
				<span className="text-muted-foreground">
					{" "}
					({reference.sales} {reference.sales === 1 ? "sale" : "sales"},{" "}
					{REFERENCE_WINDOW_DAYS} days)
				</span>
			</span>
		</div>
	);
}

/** "$47.71 a copy", or the Listing's own price when it can't be landed yet. */
function headline(listing: ListingView): string {
	if (listing.perCopyPrice !== null) {
		return `${formatMoney(listing.perCopyPrice.perCopy, "USD")} a copy`;
	}
	if (listing.price === null) return "No price";
	return formatMoney(listing.price, listing.currency ?? "USD");
}

/**
 * How the Per-copy price adds up: price (converted when it isn't in dollars),
 * shipping, import fees and the Copies it's divided by.
 */
function PriceBreakdown({
	listing,
}: {
	listing: ListingView;
}): React.ReactElement | null {
	const breakdown = listing.perCopyPrice;
	if (listing.price === null) return null;
	const currency = listing.currency ?? "USD";
	if (breakdown === null) {
		return (
			<p className="text-muted-foreground text-sm">
				No exchange rate for {currency} yet, so there's no Per-copy price. Rates
				update daily.
			</p>
		);
	}
	const converted = currency !== "USD";
	return (
		<section aria-labelledby="price-breakdown" className="flex flex-col gap-2">
			<h3 id="price-breakdown" className="font-medium text-sm">
				Per-copy price
			</h3>
			<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm tabular-nums">
				<ReadRow term="Price">
					{converted
						? `${formatMoney(listing.price, currency)} → ${formatMoney(breakdown.price, "USD")}`
						: formatMoney(breakdown.price, "USD")}
				</ReadRow>
				<ReadRow term="Shipping">
					{breakdown.shipping === null ? (
						<NotStated />
					) : breakdown.shipping === 0 ? (
						"Free"
					) : (
						formatMoney(breakdown.shipping, "USD")
					)}
				</ReadRow>
				<ReadRow term="Import fees">
					{formatMoney(breakdown.importFees, "USD")}
					<span className="text-muted-foreground">
						{" "}
						({importFeeNote(listing.sellerLocation, breakdown)})
					</span>
					{breakdown.importFeePercent > 0 ? (
						<>
							{" "}
							<Link
								href="/yugioh/settings"
								className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
							>
								Change rate
							</Link>
						</>
					) : null}
				</ReadRow>
				<ReadRow term="Copies in lot">
					÷ {breakdown.copies}
					{listing.titleRead === null ? (
						<span className="text-muted-foreground"> (title not read)</span>
					) : null}
				</ReadRow>
				<div className="col-span-2 grid grid-cols-subgrid border-t pt-1.5 font-medium">
					<dt>Per copy</dt>
					<dd>{formatMoney(breakdown.perCopy, "USD")}</dd>
				</div>
			</dl>
		</section>
	);
}

/**
 * "United Kingdom 13%", "Chile, default 15%", "none from United States" or
 * "location unknown, default 15%".
 */
function importFeeNote(
	location: string | null,
	fee: { importFeePercent: number; importFeeDefaulted: boolean },
): string {
	const rate = `${fee.importFeeDefaulted ? "default " : ""}${fee.importFeePercent}%`;
	if (location === null) return `location unknown, ${rate}`;
	if (fee.importFeePercent === 0 && !fee.importFeeDefaulted) {
		return `none from ${location}`;
	}
	return fee.importFeeDefaulted
		? `${location}, ${rate}`
		: `${location} ${rate}`;
}

/**
 * The Listing's condition and rarity, each a picker: the condition I set
 * wins over the title's, and a rarity re-matches it to that Printing. What
 * I set says so.
 */
function ConditionAndRarity({
	listing,
	onSetCondition,
	onSetRarity,
}: {
	listing: ListingView;
	onSetCondition: (condition: ConditionChoice | null) => void;
	onSetRarity: (choice: ListingView["rarityChoices"][number]) => void;
}): React.ReactElement {
	const condition = listingCondition(listing);
	const printing =
		listing.match.status === "match" ? listing.match.printing : null;
	return (
		<section aria-labelledby="listing-edits" className="flex flex-col gap-2">
			<h3 id="listing-edits" className="font-medium text-sm">
				Condition and rarity
			</h3>
			<dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
				<dt className="text-muted-foreground">Condition</dt>
				<dd className="flex min-w-0 items-center gap-3">
					<ConditionMenu listing={listing} onPick={onSetCondition}>
						<PickerButton
							label={
								condition === null
									? "Not stated"
									: READ_CONDITION_LABELS[condition]
							}
							short={
								condition === null
									? null
									: READ_CONDITION_ABBREVIATIONS[condition]
							}
							aria-label="Change condition"
						/>
					</ConditionMenu>
					{isConditionSetByYou(listing) ? <SetByYouNote /> : null}
				</dd>
				{printing ? (
					<>
						<dt className="text-muted-foreground">Rarity</dt>
						<dd className="flex min-w-0 items-center gap-3">
							<RarityMenu listing={listing} onPick={onSetRarity}>
								<PickerButton
									label={printing.rarity}
									short={rarityAbbreviation(printing.rarity)}
									aria-label="Change rarity"
								/>
							</RarityMenu>
							{listing.match.overridden ? <SetByYouNote /> : null}
						</dd>
					</>
				) : null}
			</dl>
		</section>
	);
}

/** A picker's trigger: "Lightly Played  LP ⌄". */
function PickerButton({
	label,
	short,
	...props
}: {
	label: string;
	short: string | null;
} & React.ComponentProps<typeof Button>): React.ReactElement {
	return (
		<Button
			variant="outline"
			size="sm"
			className="h-11 min-w-0 max-w-full justify-between gap-2 font-normal md:h-8"
			{...props}
		>
			<span className="truncate">{label}</span>
			{short !== null && short !== label ? (
				<span className="text-muted-foreground text-xs">{short}</span>
			) : null}
			<ChevronDown data-icon="inline-end" className="text-muted-foreground" />
		</Button>
	);
}

function SetByYouNote(): React.ReactElement {
	return (
		<span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
			<PencilLine aria-hidden className="size-3" />
			Set by you
		</span>
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

/**
 * What a TCGplayer product page says about a Listing or sale: the seller,
 * TCGplayer's own condition wording, how many Copies, and the language.
 * Nothing here is read by AI.
 */
function TcgplayerPageSays({
	listing,
	details,
}: {
	listing: ListingView;
	details: NonNullable<ListingView["tcgplayer"]>;
}): React.ReactElement {
	return (
		<section aria-labelledby="page-says" className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-3">
				<h3 id="page-says" className="font-medium text-sm">
					What TCGplayer says
				</h3>
				<span className="text-muted-foreground text-xs">
					From the product page
				</span>
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
				{details.seller === null ? null : (
					<ReadRow term="Seller">{details.seller}</ReadRow>
				)}
				<ReadRow term="Condition">{details.condition}</ReadRow>
				{details.quantity === null ? null : (
					<ReadRow term={listing.sold ? "Copies sold" : "Copies for sale"}>
						<span className="tabular-nums">{details.quantity}</span>
					</ReadRow>
				)}
				{listing.titleRead ? (
					<ReadRow term="Language">
						{LANGUAGE_LABELS[listing.titleRead.language]}
					</ReadRow>
				) : null}
			</dl>
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

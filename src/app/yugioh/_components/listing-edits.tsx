"use client";

import { useMutation } from "convex/react";
import { Undo2 } from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import {
	COPIES_CHOICES,
	type ConditionChoice,
	type CopiesChoice,
	NOT_STATED,
	conditionChoice,
	copiesLabel,
	isConditionSetByYou,
	isCopiesSetByYou,
	listingCopies,
} from "~/lib/yugioh/listing-edits";
import { READ_CONDITION_ABBREVIATIONS } from "~/lib/yugioh/listing-format";
import {
	READ_CONDITIONS,
	READ_CONDITION_LABELS,
	type ReadCondition,
} from "~/lib/yugioh/title-reading";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import { updateCachedListing, withCopies } from "../_utils/optimistic";
import type { ListingView } from "../_utils/types";
import { listingName, type useListingRejection } from "./mark-wrong";

const SAVE_FAILED = "Couldn't save. Try again.";

type RarityChoice = ListingView["rarityChoices"][number];

/**
 * Changing a Listing's condition, copies and rarity from its row or drawer. Each
 * change saves at once and a toast offers Undo. A rarity whose Printing the
 * Deck doesn't need folds the row away first; a rarity with no Printing
 * marks the Listing wrong ("Wrong rarity").
 */
export function useListingEdits(
	rejection: ReturnType<typeof useListingRejection>,
): {
	setCondition: (
		listing: ListingView,
		condition: ConditionChoice | null,
	) => void;
	setCopies: (listing: ListingView, copies: CopiesChoice | null) => void;
	setRarity: (listing: ListingView, choice: RarityChoice) => void;
} {
	const saveCondition = useMutation(
		api.yugioh.listings.setListingCondition,
	).withOptimisticUpdate((store, { listingId, condition }) =>
		updateCachedListing(store, listingId, (listing) => ({
			...listing,
			conditionOverride: condition,
		})),
	);
	const saveCopies = useMutation(
		api.yugioh.listings.setListingCopies,
	).withOptimisticUpdate((store, { listingId, copies }) =>
		updateCachedListing(store, listingId, (listing) =>
			withCopies(listing, copies),
		),
	);
	const saveMatch = useMutation(
		api.yugioh.listings.setListingMatch,
	).withOptimisticUpdate((store, { listingId, printingId, overridden }) =>
		updateCachedListing(store, listingId, (listing) =>
			withRarity(listing, printingId, overridden ?? true),
		),
	);

	async function attempt(save: () => Promise<unknown>): Promise<boolean> {
		try {
			await save();
			return true;
		} catch (error) {
			toast.error(errorMessage(error, SAVE_FAILED));
			return false;
		}
	}

	async function setCondition(
		listing: ListingView,
		condition: ConditionChoice | null,
	): Promise<void> {
		const previous = listing.conditionOverride;
		if (condition === previous) return;
		const listingId = listing._id;
		if (!(await attempt(() => saveCondition({ listingId, condition })))) {
			return;
		}
		toast(
			condition === null
				? "Condition back to what the title says"
				: `Condition set to ${conditionName(condition)}`,
			{
				description:
					condition === null
						? listingName(listing)
						: `${listingName(listing)}. Kept on future captures.`,
				action: {
					label: "Undo",
					onClick: () =>
						void attempt(() =>
							saveCondition({ listingId, condition: previous }),
						),
				},
			},
		);
	}

	async function setCopies(
		listing: ListingView,
		copies: CopiesChoice | null,
	): Promise<void> {
		const previous = listing.copiesOverride;
		if (copies === previous) return;
		const listingId = listing._id;
		if (!(await attempt(() => saveCopies({ listingId, copies })))) return;
		toast(
			copies === null
				? "Copies back to what the title says"
				: `Copies set to ${copies}`,
			{
				description:
					copies === null
						? listingName(listing)
						: `${listingName(listing)}. Kept on future captures.`,
				action: {
					label: "Undo",
					onClick: () =>
						void attempt(() => saveCopies({ listingId, copies: previous })),
				},
			},
		);
	}

	function setRarity(listing: ListingView, choice: RarityChoice): void {
		const matched = listing.match.printing;
		if (choice.printingId === null) {
			rejection.markWrong(listing, "wrongRarity");
			return;
		}
		if (matched === null || choice.printingId === matched._id) return;
		const listingId = listing._id;
		const printingId = choice.printingId;
		const previous = {
			printingId: matched._id,
			overridden: listing.match.overridden,
		};
		const save = () => attempt(() => saveMatch({ listingId, printingId }));
		function announce(): void {
			toast(`Rarity set to ${choice.rarity}`, {
				description: choice.needed
					? `${listingName(listing)}. Kept on future captures.`
					: `${listingName(listing)} in ${rarityAbbreviation(choice.rarity)} isn't a Printing this Deck needs, so it left Listings.`,
				action: {
					label: "Undo",
					onClick: () =>
						void attempt(() => saveMatch({ listingId, ...previous })),
				},
			});
		}
		if (choice.needed) {
			void save().then((saved) => {
				if (saved) announce();
			});
		} else {
			rejection.leaveThen(listing, save, announce);
		}
	}

	return {
		setCondition: (listing, condition) => void setCondition(listing, condition),
		setCopies: (listing, copies) => void setCopies(listing, copies),
		setRarity,
	};
}

/**
 * A Listing rematched to one of its rarity choices, as the server will show
 * it: gone when the Deck doesn't need that Printing (or for "Not a match").
 * A Printing outside its choices is left for the server to answer.
 */
function withRarity(
	listing: ListingView,
	printingId: RarityChoice["printingId"],
	overridden: boolean,
): ListingView | null {
	if (printingId === null) return null;
	const choice = listing.rarityChoices.find((c) => c.printingId === printingId);
	const printing = listing.match.printing;
	if (!choice || !printing) return listing;
	if (!choice.needed) return null;
	return {
		...listing,
		match: {
			...listing.match,
			overridden,
			printing: { ...printing, _id: printingId, rarity: choice.rarity },
		},
	};
}

/** "Lightly Played", or "Not stated". */
function conditionName(condition: ConditionChoice): string {
	return condition === NOT_STATED
		? "Not stated"
		: READ_CONDITION_LABELS[condition];
}

/**
 * Picks the Listing's condition: the five conditions (name and acronym) and
 * "Not stated". Once I've set one, it can go back to what the title says.
 * `children` is the trigger.
 */
export function ConditionMenu({
	listing,
	onPick,
	align = "start",
	children,
}: {
	listing: ListingView;
	onPick: (condition: ConditionChoice | null) => void;
	align?: "start" | "end";
	children: React.ReactElement;
}): React.ReactElement {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-56">
				<ConditionMenuItems listing={listing} onPick={onPick} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The condition picker's items, for `ConditionMenu` and the row menu's
 * "Change condition" submenu.
 */
export function ConditionMenuItems({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick: (condition: ConditionChoice | null) => void;
}): React.ReactElement {
	const read = listing.titleRead?.condition ?? null;
	return (
		<>
			<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
				Condition: yours wins over the title
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuRadioGroup
				value={conditionChoice(listing)}
				onValueChange={(value) => onPick(value as ConditionChoice)}
			>
				{READ_CONDITIONS.map((condition) => (
					<DropdownMenuRadioItem key={condition} value={condition}>
						{READ_CONDITION_LABELS[condition]}
						<DropdownMenuShortcut className="tracking-normal">
							{READ_CONDITION_ABBREVIATIONS[condition]}
						</DropdownMenuShortcut>
					</DropdownMenuRadioItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuRadioItem value={NOT_STATED}>
					Not stated
				</DropdownMenuRadioItem>
			</DropdownMenuRadioGroup>
			{isConditionSetByYou(listing) ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => onPick(null)}>
						<Undo2 aria-hidden />
						Use the title's
						<DropdownMenuShortcut className="tracking-normal">
							{titleConditionShort(read)}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				</>
			) : null}
		</>
	);
}

function titleConditionShort(condition: ReadCondition | null): string {
	return condition === null ? "None" : READ_CONDITION_ABBREVIATIONS[condition];
}

/**
 * Picks the Copies in a Listing: 1, 2 or 3. Once I've set them, they can go
 * back to what the title says. `children` is the trigger.
 */
export function CopiesMenu({
	listing,
	onPick,
	align = "start",
	children,
}: {
	listing: ListingView;
	onPick: (copies: CopiesChoice | null) => void;
	align?: "start" | "end";
	children: React.ReactElement;
}): React.ReactElement {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-56">
				<CopiesMenuItems listing={listing} onPick={onPick} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The copies picker's items, for `CopiesMenu` and the row menu's "Change
 * copies" submenu.
 */
export function CopiesMenuItems({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick: (copies: CopiesChoice | null) => void;
}): React.ReactElement {
	return (
		<>
			<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
				Copies in the lot: yours win over the title
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuRadioGroup
				value={String(listingCopies(listing))}
				onValueChange={(value) => onPick(Number(value) as CopiesChoice)}
			>
				{COPIES_CHOICES.map((copies) => (
					<DropdownMenuRadioItem key={copies} value={String(copies)}>
						{copiesLabel(copies)}
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
			{isCopiesSetByYou(listing) ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => onPick(null)}>
						<Undo2 aria-hidden />
						Use the title's
						<DropdownMenuShortcut className="tracking-normal">
							{listing.titleRead === null
								? "None"
								: `×${listing.titleRead.copies}`}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				</>
			) : null}
		</>
	);
}

/**
 * Picks the Listing's rarity among the Printings under its set code; picking
 * one re-matches the Listing to it. Overloaded rarities I have no Printing of
 * come after, under "Not one you need": picking one marks it wrong.
 * `children` is the trigger.
 */
export function RarityMenu({
	listing,
	onPick,
	align = "start",
	children,
}: {
	listing: ListingView;
	onPick: (choice: RarityChoice) => void;
	align?: "start" | "end";
	children: React.ReactElement;
}): React.ReactElement {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-64">
				<RarityMenuItems listing={listing} onPick={onPick} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The rarity picker's items, for `RarityMenu` and the row menu's "Change
 * rarity" submenu.
 */
export function RarityMenuItems({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick: (choice: RarityChoice) => void;
}): React.ReactElement {
	const printing = listing.match.printing;
	const mine = listing.rarityChoices.filter(
		(choice) => choice.printingId !== null,
	);
	const others = listing.rarityChoices.filter(
		(choice) => choice.printingId === null,
	);
	return (
		<>
			<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
				Rarity
				{printing ? (
					<>
						{" "}
						under{" "}
						<span className="font-mono tracking-tight">{printing.setCode}</span>
					</>
				) : null}
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuRadioGroup
				value={printing?._id ?? ""}
				onValueChange={(value) => {
					const choice = mine.find((c) => c.printingId === value);
					if (choice) onPick(choice);
				}}
			>
				{mine.map((choice) => (
					<DropdownMenuRadioItem
						key={choice.rarity}
						value={choice.printingId ?? ""}
					>
						<span className="truncate">{choice.rarity}</span>
						<DropdownMenuShortcut className="tracking-normal">
							{rarityAbbreviation(choice.rarity)}
						</DropdownMenuShortcut>
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
			{others.length > 0 ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
						Not one you need: marks it wrong
					</DropdownMenuLabel>
					{others.map((choice) => (
						<DropdownMenuItem
							key={choice.rarity}
							inset
							onSelect={() => onPick(choice)}
						>
							<span className="truncate">{choice.rarity}</span>
							<DropdownMenuShortcut className="tracking-normal">
								{rarityAbbreviation(choice.rarity)}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					))}
				</>
			) : mine.length <= 1 ? (
				<p className="px-2 pt-1 pb-1.5 text-muted-foreground text-xs">
					No other rarity is known under this set code.
				</p>
			) : null}
		</>
	);
}

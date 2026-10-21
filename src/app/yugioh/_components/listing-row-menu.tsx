"use client";

import {
	Ban,
	ExternalLink,
	EyeOff,
	Gauge,
	Gem,
	PanelRightOpen,
	Undo2,
} from "lucide-react";
import type * as React from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import {
	type ConditionChoice,
	listingCondition,
} from "~/lib/yugioh/listing-edits";
import { MARKETPLACE_LABELS, conditionCell } from "~/lib/yugioh/listing-format";
import type { RejectionReason } from "~/lib/yugioh/listing-rejection";
import type { ListingView } from "../_utils/types";
import { ConditionMenuItems, RarityMenuItems } from "./listing-edits";
import { MarkWrongMenuItems } from "./mark-wrong";

/** Where the row menu is open: the Listing, and the point it grows from. */
export type RowMenuAt = {
	listing: ListingView;
	/** Viewport coordinates: the click, or under the row from the keyboard. */
	x: number;
	y: number;
};

/**
 * Motion for the menu and its submenus (Family Values: it grows out of the
 * point I clicked). In: scale 95% to 100% and fade, from the click point
 * (Radix's transform origin), on a strong ease-out. No drift: the
 * slide-ins the shadcn menu adds are zeroed. Out: a quick fade, no scale.
 * Reduced motion: fade only.
 */
const MENU_MOTION =
	"ease-[cubic-bezier(0.19,1,0.22,1)] [--tw-enter-translate-x:0]! [--tw-enter-translate-y:0]! [--tw-exit-scale:1]! data-[state=closed]:duration-100 data-[state=closed]:ease-out motion-reduce:[--tw-enter-scale:1]!";

/**
 * The Listings table's row menu, one for the whole table, opened at a point
 * by a click on a row (or Enter on a focused one): Details, Open on the
 * marketplace, Change rarity ›, Change condition ›, Hide the Card, and
 * Remove › (mark wrong, with its reasons), or Restore under Marked wrong,
 * where a Listing is restored before it's changed.
 */
export function ListingRowMenu({
	at,
	onClose,
	onCloseAutoFocus,
	rejectedView,
	onDetails,
	onHideCard,
	onMarkWrong,
	onUnmark,
	onSetCondition,
	onSetRarity,
}: {
	at: RowMenuAt | null;
	onClose: () => void;
	/** Where focus goes once it closes (the row), instead of the anchor. */
	onCloseAutoFocus: (event: Event) => void;
	rejectedView: boolean;
	onDetails?: (listing: ListingView) => void;
	onHideCard?: (listing: ListingView) => void;
	onMarkWrong: (listing: ListingView, reason: RejectionReason) => void;
	onUnmark: (listing: ListingView) => void;
	onSetCondition?: (
		listing: ListingView,
		condition: ConditionChoice | null,
	) => void;
	onSetRarity?: (
		listing: ListingView,
		choice: ListingView["rarityChoices"][number],
	) => void;
}): React.ReactElement {
	const listing = at?.listing ?? null;
	return (
		<DropdownMenu
			open={at !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DropdownMenuTrigger asChild>
				{/* A zero-size anchor at the click: the menu grows from it. */}
				<span
					aria-hidden
					tabIndex={-1}
					className="pointer-events-none fixed size-0"
					style={{ left: at?.x ?? 0, top: at?.y ?? 0 }}
				/>
			</DropdownMenuTrigger>
			{listing ? (
				<DropdownMenuContent
					// A new point is a new menu, not the old one moving.
					key={`${listing._id}-${at?.x}-${at?.y}`}
					align="start"
					side="bottom"
					sideOffset={2}
					collisionPadding={8}
					onCloseAutoFocus={onCloseAutoFocus}
					className={cn("w-56", MENU_MOTION)}
					aria-label={`Listing: ${cardName(listing)}`}
				>
					<RowMenuItems
						listing={listing}
						rejectedView={rejectedView}
						onDetails={onDetails}
						onHideCard={onHideCard}
						onMarkWrong={onMarkWrong}
						onUnmark={onUnmark}
						onSetCondition={onSetCondition}
						onSetRarity={onSetRarity}
					/>
				</DropdownMenuContent>
			) : null}
		</DropdownMenu>
	);
}

function RowMenuItems({
	listing,
	rejectedView,
	onDetails,
	onHideCard,
	onMarkWrong,
	onUnmark,
	onSetCondition,
	onSetRarity,
}: {
	listing: ListingView;
	rejectedView: boolean;
	onDetails?: (listing: ListingView) => void;
	onHideCard?: (listing: ListingView) => void;
	onMarkWrong: (listing: ListingView, reason: RejectionReason) => void;
	onUnmark: (listing: ListingView) => void;
	onSetCondition?: (
		listing: ListingView,
		condition: ConditionChoice | null,
	) => void;
	onSetRarity?: (
		listing: ListingView,
		choice: ListingView["rarityChoices"][number],
	) => void;
}): React.ReactElement {
	const printing = listing.match.printing;
	const marketplace = MARKETPLACE_LABELS[listing.marketplace];
	// Marked wrong: restore a Listing before changing it.
	const editable = !rejectedView && listing.rejection === null;
	const canSetRarity = editable && onSetRarity && printing !== null;
	const canSetCondition = editable && onSetCondition;
	const condition = conditionCell(listingCondition(listing), false);
	const name = cardName(listing);
	return (
		<>
			{onDetails ? (
				<DropdownMenuItem onSelect={() => onDetails(listing)}>
					<PanelRightOpen aria-hidden />
					Details
				</DropdownMenuItem>
			) : null}
			<DropdownMenuItem asChild>
				<a
					href={listing.url}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`Open on ${marketplace} (opens in a new tab)`}
				>
					<ExternalLink aria-hidden />
					Open on {marketplace}
				</a>
			</DropdownMenuItem>
			{canSetRarity || canSetCondition ? (
				<>
					<DropdownMenuSeparator />
					{canSetRarity ? (
						<DropdownMenuSub>
							<SubTrigger
								icon={<Gem aria-hidden />}
								value={rarityAbbreviation(printing.rarity)}
							>
								Change rarity
							</SubTrigger>
							<DropdownMenuSubContent
								sideOffset={4}
								collisionPadding={8}
								className={cn("w-64", MENU_MOTION, "duration-100")}
							>
								<RarityMenuItems
									listing={listing}
									onPick={(choice) => onSetRarity(listing, choice)}
								/>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					) : null}
					{canSetCondition ? (
						<DropdownMenuSub>
							<SubTrigger
								icon={<Gauge aria-hidden />}
								value={condition?.short ?? "—"}
							>
								Change condition
							</SubTrigger>
							<DropdownMenuSubContent
								sideOffset={4}
								collisionPadding={8}
								className={cn("w-56", MENU_MOTION, "duration-100")}
							>
								<ConditionMenuItems
									listing={listing}
									onPick={(choice) => onSetCondition(listing, choice)}
								/>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					) : null}
				</>
			) : null}
			<DropdownMenuSeparator />
			{onHideCard && printing ? (
				<DropdownMenuItem onSelect={() => onHideCard(listing)}>
					<EyeOff aria-hidden />
					<span className="min-w-0 truncate" title={`Hide ${name}`}>
						Hide {name}
					</span>
				</DropdownMenuItem>
			) : null}
			{listing.rejection ? (
				<DropdownMenuItem onSelect={() => onUnmark(listing)}>
					<Undo2 aria-hidden />
					Restore
				</DropdownMenuItem>
			) : (
				<DropdownMenuSub>
					<SubTrigger icon={<Ban aria-hidden />}>Remove</SubTrigger>
					<DropdownMenuSubContent
						sideOffset={4}
						collisionPadding={8}
						className={cn("w-52", MENU_MOTION, "duration-100")}
					>
						<MarkWrongMenuItems
							onPick={(reason) => onMarkWrong(listing, reason)}
						/>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			)}
		</>
	);
}

/**
 * A submenu's item: icon, label, then the current value (muted, "UtR")
 * before the chevron the shadcn trigger adds.
 */
function SubTrigger({
	icon,
	value,
	children,
}: {
	icon: React.ReactElement;
	value?: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<DropdownMenuSubTrigger>
			{icon}
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{value ? (
				<span className="shrink-0 text-muted-foreground text-xs">{value}</span>
			) : null}
		</DropdownMenuSubTrigger>
	);
}

function cardName(listing: ListingView): string {
	return listing.match.printing?.cardName ?? listing.title;
}

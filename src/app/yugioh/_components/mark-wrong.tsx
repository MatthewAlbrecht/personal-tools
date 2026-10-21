"use client";

import { useMutation } from "convex/react";
import { Ban } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	REJECTION_REASONS,
	REJECTION_REASON_LABELS,
	type RejectionReason,
} from "~/lib/yugioh/listing-rejection";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import type { ListingView } from "../_utils/types";

/** How long a row takes to fold away once it's marked (or unmarked). */
export const ROW_EXIT_MS = 200;

const SAVE_FAILED = "Couldn't save. Try again.";

/** What a Listing is called in a toast: its Card, else its title. */
function listingName(listing: ListingView): string {
	return listing.match.printing?.cardName ?? listing.title;
}

/**
 * Marking Listings wrong, and unmarking them, for one Listings view. A row
 * folds away first (`leaving` holds it while it does), then the change saves
 * and a toast offers Undo. With reduced motion it saves at once.
 */
export function useListingRejection(): {
	leaving: ReadonlySet<string>;
	markWrong: (listing: ListingView, reason: RejectionReason) => void;
	unmark: (listing: ListingView) => void;
} {
	const setRejection = useMutation(api.yugioh.listings.setListingRejection);
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());

	function setLeavingFor(listingId: string, isLeaving: boolean): void {
		setLeaving((current) => {
			const next = new Set(current);
			if (isLeaving) next.add(listingId);
			else next.delete(listingId);
			return next;
		});
	}

	async function save(
		listing: ListingView,
		reason: RejectionReason | null,
	): Promise<boolean> {
		try {
			await setRejection({ listingId: listing._id, reason });
			return true;
		} catch (error) {
			toast.error(errorMessage(error, SAVE_FAILED));
			return false;
		}
	}

	/** Folds the row away, then saves; the saved query result removes it. */
	function leaveThenSave(
		listing: ListingView,
		reason: RejectionReason | null,
		onSaved: () => void,
	): void {
		setLeavingFor(listing._id, true);
		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		window.setTimeout(
			async () => {
				if (await save(listing, reason)) onSaved();
				setLeavingFor(listing._id, false);
			},
			reduced ? 0 : ROW_EXIT_MS,
		);
	}

	function markWrong(listing: ListingView, reason: RejectionReason): void {
		leaveThenSave(listing, reason, () => {
			toast(`Marked wrong: ${REJECTION_REASON_LABELS[reason]}`, {
				description: `${listingName(listing)} won't count toward prices or deals.`,
				action: {
					label: "Undo",
					onClick: () => void save(listing, null),
				},
			});
		});
	}

	function unmark(listing: ListingView): void {
		const reason = listing.rejection?.reason;
		if (reason === undefined) return;
		leaveThenSave(listing, null, () => {
			toast(`Restored ${listingName(listing)}`, {
				description: "It counts toward prices and deals again.",
				action: {
					label: "Undo",
					onClick: () => void save(listing, reason),
				},
			});
		});
	}

	return { leaving, markWrong, unmark };
}

/**
 * "Mark as wrong" and its reasons, one click each. `trigger` is the button
 * that opens it: an icon button on a row, a full button in the drawer.
 */
export function MarkWrongMenu({
	onPick,
	children,
	align = "end",
}: {
	onPick: (reason: RejectionReason) => void;
	children: React.ReactElement;
	align?: "start" | "end";
}): React.ReactElement {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-52">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					Mark as wrong: it won't count
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{REJECTION_REASONS.map((reason) => (
					<DropdownMenuItem key={reason} onSelect={() => onPick(reason)}>
						{REJECTION_REASON_LABELS[reason]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The row's icon button that opens `MarkWrongMenu`. */
export function MarkWrongButton({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick: (reason: RejectionReason) => void;
}): React.ReactElement {
	return (
		<MarkWrongMenu onPick={onPick}>
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
				aria-label={`Mark as wrong: ${listingName(listing)}`}
				title="Mark as wrong"
			>
				<Ban />
			</Button>
		</MarkWrongMenu>
	);
}

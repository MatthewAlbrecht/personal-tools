"use client";

import { ExternalLink, Link2Off } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemSeparator,
	ItemTitle,
} from "~/components/ui/item";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import { searchedCandidates } from "~/lib/yugioh/searches";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { CandidatePrinting, DeckView } from "../_utils/types";

type LinkRow = {
	deckCardId: Id<"yugiohDeckCards">;
	cardName: string;
	printing: CandidatePrinting;
};

/**
 * The Printings the Deck searches for (the Chosen Printing, or every
 * Candidate while undecided), each once.
 */
function searchedPrintings(deck: DeckView): LinkRow[] {
	const rows: LinkRow[] = [];
	const seen = new Set<string>();
	for (const { cards } of deck.sections) {
		for (const card of cards) {
			for (const printing of searchedCandidates(card)) {
				if (seen.has(printing.printingId)) continue;
				seen.add(printing.printingId);
				rows.push({ deckCardId: card._id, cardName: card.cardName, printing });
			}
		}
	}
	return rows;
}

/** "2 Printings need a TCGplayer link", opening the first such Card. */
export function TcgplayerCallout({
	deck,
}: {
	deck: DeckView;
}): React.ReactElement | null {
	const missing = searchedPrintings(deck).filter(
		(row) => row.printing.tcgplayer.status === "needsPaste",
	);
	const first = missing[0];
	if (!first) return null;
	const count = missing.length;
	return (
		<Link
			href={`/yugioh/decks/${deck._id}?card=${first.deckCardId}`}
			className="rounded-lg outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>[data-slot=alert]]:hover:bg-muted/40"
		>
			<Alert>
				<Link2Off />
				<AlertTitle>
					{count} {count === 1 ? "Printing needs" : "Printings need"} a
					TCGplayer link
				</AlertTitle>
				<AlertDescription>
					Paste the product URL on each Card. Start with {first.cardName}.
				</AlertDescription>
			</Alert>
		</Link>
	);
}

/** One row per searched Printing: its product page, or a TCGplayer search. */
export function TcgplayerLinks({
	deck,
}: {
	deck: DeckView;
}): React.ReactElement | null {
	const rows = searchedPrintings(deck);
	if (rows.length === 0) return null;
	return (
		<section aria-labelledby="tcgplayer-links" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h2
					id="tcgplayer-links"
					className="font-semibold text-muted-foreground text-sm uppercase tracking-wide"
				>
					TCGplayer
				</h2>
				<p className="text-muted-foreground text-sm">
					Each Printing's product page, for current Listings and latest sales.
				</p>
			</div>
			<ul className="flex flex-col rounded-lg border">
				{rows.map((row, index) => (
					<li key={row.printing.printingId}>
						{index > 0 ? <ItemSeparator className="my-0" /> : null}
						<TcgplayerRow row={row} />
					</li>
				))}
			</ul>
		</section>
	);
}

function TcgplayerRow({ row }: { row: LinkRow }): React.ReactElement {
	const { printing } = row;
	const { tcgplayer } = printing;
	return (
		<Item size="sm" className="flex-nowrap rounded-none">
			<ItemContent className="min-w-0">
				<ItemTitle className="w-full truncate">{row.cardName}</ItemTitle>
				<ItemDescription className="truncate">
					<span className="font-mono text-[0.8125rem] tracking-tight">
						{printing.setCode}
					</span>
					{" · "}
					<abbr title={printing.rarity} className="no-underline">
						<span className="md:hidden">
							{rarityAbbreviation(printing.rarity)}
						</span>
						<span className="hidden md:inline">{printing.rarity}</span>
					</abbr>
				</ItemDescription>
			</ItemContent>
			<ItemActions className="shrink-0">
				{tcgplayer.status === "searching" ? (
					<output className="flex items-center gap-2 text-muted-foreground text-xs">
						<Spinner />
						Finding…
					</output>
				) : tcgplayer.status === "found" && tcgplayer.productUrl ? (
					<OutButton
						href={tcgplayer.productUrl}
						label={`Product page for ${row.cardName}, ${printing.setCode} ${printing.rarity}`}
					>
						Product page
					</OutButton>
				) : (
					<OutButton
						href={tcgplayer.searchUrl}
						label={`Search TCGplayer for ${printing.setCode}`}
						variant="ghost"
					>
						Search TCGplayer
					</OutButton>
				)}
			</ItemActions>
		</Item>
	);
}

function OutButton({
	href,
	label,
	variant = "outline",
	children,
}: {
	href: string;
	label: string;
	variant?: "outline" | "ghost";
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<Button variant={variant} size="sm" className="h-11 md:h-8" asChild>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`${label} (opens in a new tab)`}
			>
				{children}
				<ExternalLink data-icon="inline-end" />
			</a>
		</Button>
	);
}

export function TcgplayerLinksSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-4 w-24" />
			<div className="flex flex-col rounded-lg border">
				{[0, 1, 2].map((key) => (
					<div key={key} className="flex items-center gap-3 px-3 py-2.5">
						<div className="flex flex-1 flex-col gap-1.5">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-32" />
						</div>
						<Skeleton className="h-8 w-28" />
					</div>
				))}
			</div>
		</div>
	);
}

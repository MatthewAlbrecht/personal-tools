"use client";

import { useQuery } from "convex/react";
import { Layers, ListFilter, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { useCardGridColumns } from "~/lib/hooks/use-card-grid-columns";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useHourClock } from "~/lib/hooks/use-hour-clock";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import {
	type GridColumns,
	priorityFilterFromParam,
	sectionsWithPriority,
	shownGridColumns,
} from "~/lib/yugioh/card-grid";
import { formatWholeDollars } from "~/lib/yugioh/costs";
import {
	PRIORITY_LABELS,
	type Priority,
	SECTION_LABELS,
} from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DeckSection } from "../_utils/types";
import { AddCardDrawer } from "./add-card-drawer";
import { CaptureStalenessNote } from "./capture-staleness-note";
import { CardDrawer } from "./card-drawer";
import { CardOrderToggle } from "./card-order-toggle";
import { CardsPriorityFilter } from "./card-priority";
import { CardTileGrid, CardTileGridSkeleton } from "./card-tile-grid";
import { DeckCostHeader, DeckCostHeaderSkeleton } from "./deck-cost";
import { GridColumnsToggle } from "./grid-columns-toggle";

export function DeckPage({
	deckId,
}: {
	deckId: Id<"yugiohDecks">;
}): React.ReactElement | null {
	const now = useHourClock();
	const deck = useHeldWhileLoading(
		useQuery(api.yugioh.decks.getDeck, { deckId, now }),
		deckId,
	);
	const router = useRouter();
	const pathname = usePathname() ?? `/yugioh/decks/${deckId}`;
	const searchParams = useSearchParams() ?? new URLSearchParams();
	const [adding, setAdding] = useState(false);
	const columns = useCardGridColumns();
	const phone = useMediaQuery("(max-width: 639px)");

	if (deck === undefined) return <DeckPageSkeleton />;
	// DeckShell (the layout) shows the missing-Deck state.
	if (deck === null) return null;

	const openCardId = searchParams.get("card");
	const openCard = deck.sections
		.flatMap((group) => group.cards)
		.find((card) => card._id === openCardId);

	const priority = priorityFilterFromParam(searchParams.get("priority"));
	const shownSections = sectionsWithPriority(deck.sections, priority);
	// Moving a Card among a filtered few would misplace it among the rest.
	const sortable = deck.cardOrder === "custom" && priority === undefined;

	function showPriority(next: Priority | undefined): void {
		const params = new URLSearchParams(searchParams.toString());
		if (next) params.set("priority", next);
		else params.delete("priority");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}

	function cardHref(cardId: string): string {
		const params = new URLSearchParams(searchParams.toString());
		params.set("card", cardId);
		return `${pathname}?${params.toString()}`;
	}

	function closeCard(): void {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("card");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<DeckCostHeader
				deck={deck}
				cardHref={cardHref}
				note={<CaptureStalenessNote />}
			/>

			{deck.cardCount === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Layers />
						</EmptyMedia>
						<EmptyTitle>No Cards in this Deck</EmptyTitle>
						<EmptyDescription>
							Add the first Card, or have an agent load your list.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={() => setAdding(true)}>
							<Plus data-icon="inline-start" />
							Add Card
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<>
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<Button className="h-11 md:h-9" onClick={() => setAdding(true)}>
									<Plus data-icon="inline-start" />
									Add Card
								</Button>
								<CardsPriorityFilter
									key={priority ?? "all"}
									value={priority}
									onChange={showPriority}
								/>
							</div>
							<div className="flex items-center gap-2">
								<GridColumnsToggle value={shownGridColumns(columns, phone)} />
								<CardOrderToggle deckId={deckId} value={deck.cardOrder} />
							</div>
						</div>
						{deck.cardOrder === "custom" && (
							<p className="text-muted-foreground text-sm">
								{sortable
									? "Drag a Card's handle to move it within its Section, or tap the handle to move it earlier, later, to the start or to the end."
									: "Show All Cards to move them."}
							</p>
						)}
					</div>
					{shownSections.length === 0 && priority !== undefined ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ListFilter />
								</EmptyMedia>
								<EmptyTitle>
									No {PRIORITY_LABELS[priority]} priority Cards
								</EmptyTitle>
								<EmptyDescription>
									Set a Card's priority from its tile or its drawer.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									variant="outline"
									onClick={() => showPriority(undefined)}
								>
									Show all Cards
								</Button>
							</EmptyContent>
						</Empty>
					) : (
						shownSections.map((group) => (
							<SectionList
								key={group.section}
								deckId={deckId}
								group={group}
								sortable={sortable}
								filtered={priority !== undefined}
								columns={columns}
								cardHref={cardHref}
							/>
						))
					)}
				</>
			)}

			<AddCardDrawer deckId={deckId} open={adding} onOpenChange={setAdding} />
			<CardDrawer deckId={deckId} card={openCard ?? null} onClose={closeCard} />
		</div>
	);
}

function SectionList({
	deckId,
	group,
	sortable,
	filtered,
	columns,
	cardHref,
}: {
	deckId: Id<"yugiohDecks">;
	group: DeckSection;
	sortable: boolean;
	/** Showing only some Cards: the Section's subtotal would mislead. */
	filtered: boolean;
	columns: GridColumns;
	cardHref: (cardId: string) => string;
}): React.ReactElement {
	const count = group.cards.length;
	const subtotal = group.cost;
	return (
		<section
			aria-labelledby={`section-${group.section}`}
			className="flex flex-col gap-3"
		>
			<div className="flex items-baseline justify-between gap-3">
				<h2
					id={`section-${group.section}`}
					className="font-semibold text-muted-foreground text-sm uppercase tracking-wide"
				>
					{SECTION_LABELS[group.section]}
					<span className="font-normal normal-case tracking-normal">
						{" · "}
						{count} {count === 1 ? "Card" : "Cards"}
					</span>
				</h2>
				{!filtered && subtotal !== null && subtotal.toFinish > 0 && (
					<p className="text-right text-muted-foreground text-sm tabular-nums">
						<span className="font-semibold text-foreground">
							{formatWholeDollars(subtotal.toFinish)}
						</span>
						<span className="sr-only"> to finish</span>
						{subtotal.buyNow > 0 && (
							<> · {formatWholeDollars(subtotal.buyNow)} buy now</>
						)}
					</p>
				)}
			</div>
			<CardTileGrid
				deckId={deckId}
				section={group.section}
				cards={group.cards}
				columns={columns}
				sortable={sortable}
				cardHref={cardHref}
			/>
		</section>
	);
}

export function DeckPageSkeleton(): React.ReactElement {
	const columns = useCardGridColumns();
	return (
		<div className="flex flex-col gap-6">
			<DeckCostHeaderSkeleton />
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-11 w-28 md:h-9" />
				<Skeleton className="h-11 w-56 md:h-9" />
			</div>
			<div className="flex flex-col gap-3">
				<Skeleton className="h-5 w-32" />
				<CardTileGridSkeleton columns={columns} count={columns * 2} />
			</div>
		</div>
	);
}

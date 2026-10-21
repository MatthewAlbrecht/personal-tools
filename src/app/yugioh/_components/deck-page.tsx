"use client";

import { useQuery } from "convex/react";
import { Layers, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { SECTION_LABELS } from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DeckSection } from "../_utils/types";
import { AddCardDrawer } from "./add-card-drawer";
import { CardDrawer } from "./card-drawer";
import { CardOrderToggle } from "./card-order-toggle";
import { CardRow } from "./card-row";
import { DeckProgress } from "./deck-progress";
import { SortableCardList } from "./sortable-card-list";

export function DeckPage({
	deckId,
}: {
	deckId: Id<"yugiohDecks">;
}): React.ReactElement | null {
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });
	const router = useRouter();
	const pathname = usePathname() ?? `/yugioh/decks/${deckId}`;
	const searchParams = useSearchParams() ?? new URLSearchParams();
	const [adding, setAdding] = useState(false);

	if (deck === undefined) return <DeckPageSkeleton />;
	// DeckShell (the layout) shows the missing-Deck state.
	if (deck === null) return null;

	const openCardId = searchParams.get("card");
	const openCard = deck.sections
		.flatMap((group) => group.cards)
		.find((card) => card._id === openCardId);

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
			<div className="max-w-sm">
				<DeckProgress
					copiesOwned={deck.copiesOwned}
					copiesNeeded={deck.copiesNeeded}
				/>
			</div>

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
						<div className="flex items-center justify-between gap-2">
							<Button className="h-11 md:h-9" onClick={() => setAdding(true)}>
								<Plus data-icon="inline-start" />
								Add Card
							</Button>
							<CardOrderToggle deckId={deckId} value={deck.cardOrder} />
						</div>
						{deck.cardOrder === "custom" && (
							<p className="text-muted-foreground text-sm">
								Drag a handle to move a Card within its Section, or tap it to
								move the Card up, down, to the top or to the bottom.
							</p>
						)}
					</div>
					{deck.sections.map((group) => (
						<SectionList
							key={group.section}
							deckId={deckId}
							group={group}
							sortable={deck.cardOrder === "custom"}
							cardHref={cardHref}
						/>
					))}
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
	cardHref,
}: {
	deckId: Id<"yugiohDecks">;
	group: DeckSection;
	sortable: boolean;
	cardHref: (cardId: string) => string;
}): React.ReactElement {
	const count = group.cards.length;
	return (
		<section
			aria-labelledby={`section-${group.section}`}
			className="flex flex-col gap-2"
		>
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
			<Card className={cn("gap-0 py-0", !sortable && "overflow-hidden")}>
				{sortable ? (
					<SortableCardList
						deckId={deckId}
						section={group.section}
						cards={group.cards}
						cardHref={cardHref}
					/>
				) : (
					<ul className="divide-y">
						{group.cards.map((card) => (
							<li key={card._id}>
								<CardRow card={card} href={cardHref(card._id)} />
							</li>
						))}
					</ul>
				)}
			</Card>
		</section>
	);
}

export function DeckPageSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-6">
			<Skeleton className="h-8 w-full max-w-sm" />
			<Skeleton className="h-9 w-28" />
			<div className="flex flex-col gap-2">
				<Skeleton className="h-5 w-32" />
				<Card className="gap-0 py-0">
					<ul className="divide-y">
						{[0, 1, 2, 3, 4, 5].map((key) => (
							<li
								key={key}
								className="flex items-center gap-3 px-3 py-2.5 md:px-4"
							>
								<Skeleton className="aspect-[59/86] w-10 rounded-[3px] md:w-12" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-4 w-2/5" />
									<Skeleton className="h-3 w-1/3" />
								</div>
								<Skeleton className="h-4 w-12" />
							</li>
						))}
					</ul>
				</Card>
			</div>
		</div>
	);
}

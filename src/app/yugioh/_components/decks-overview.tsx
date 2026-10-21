"use client";

import { useQuery } from "convex/react";
import { Layers, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useHourClock } from "~/lib/hooks/use-hour-clock";
import { api } from "../../../../convex/_generated/api";
import type { DeckSummary } from "../_utils/types";
import { DeckCostLine } from "./deck-cost";
import { DeckProgress } from "./deck-progress";
import { NewDeckDrawer } from "./new-deck-drawer";

export function DecksOverview(): React.ReactElement {
	const now = useHourClock();
	const decks = useHeldWhileLoading(
		useQuery(api.yugioh.decks.listDecks, { now }),
		"decks",
	);
	const [creating, setCreating] = useState(false);

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<header className="flex items-center justify-between gap-4">
				<h1 className="font-display font-semibold text-2xl md:text-3xl">
					Decks
				</h1>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						className="size-11 md:size-9"
						asChild
					>
						<Link href="/yugioh/settings" aria-label="Settings">
							<Settings />
						</Link>
					</Button>
					<Button onClick={() => setCreating(true)}>
						<Plus data-icon="inline-start" />
						New Deck
					</Button>
				</div>
			</header>

			{decks === undefined ? (
				<DecksOverviewSkeleton />
			) : decks.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Layers />
						</EmptyMedia>
						<EmptyTitle>No Decks yet</EmptyTitle>
						<EmptyDescription>
							Start a Deck to track what it costs to finish.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={() => setCreating(true)}>
							<Plus data-icon="inline-start" />
							New Deck
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<ul className="grid gap-4 md:grid-cols-2">
					{decks.map((deck) => (
						<li key={deck._id}>
							<DeckSummaryCard deck={deck} />
						</li>
					))}
				</ul>
			)}

			<NewDeckDrawer open={creating} onOpenChange={setCreating} />
		</div>
	);
}

function DeckSummaryCard({ deck }: { deck: DeckSummary }): React.ReactElement {
	const unpriced = deck.cost?.cardsWithoutPrice.length ?? 0;
	return (
		<Link
			href={`/yugioh/decks/${deck._id}`}
			className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<Card className="gap-3 transition-colors hover:bg-muted/40 active:bg-muted">
				<CardHeader>
					<CardTitle className="truncate font-display text-xl">
						{deck.name}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<DeckCostLine cost={deck.cost} cardCount={deck.cardCount} />
					<DeckProgress
						copiesOwned={deck.copiesOwned}
						copiesNeeded={deck.copiesNeeded}
					/>
					{unpriced > 0 && (
						<p className="text-muted-foreground text-xs">
							{unpriced} {unpriced === 1 ? "Card" : "Cards"} without a price
						</p>
					)}
				</CardContent>
			</Card>
		</Link>
	);
}

export function DecksOverviewSkeleton(): React.ReactElement {
	return (
		<div className="grid gap-4 md:grid-cols-2">
			{[0, 1].map((key) => (
				<Card key={key} className="gap-4">
					<CardHeader>
						<Skeleton className="h-7 w-2/3" />
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<Skeleton className="h-8 w-40" />
						<Skeleton className="ml-auto h-5 w-24" />
						<Skeleton className="h-1.5 w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

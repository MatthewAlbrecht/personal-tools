"use client";

import { useQuery } from "convex/react";
import { CircleCheck, ExternalLink, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { MAX_SET_CODES_PER_SEARCH, missesCopies } from "~/lib/yugioh/searches";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { EbaySearch } from "../_utils/types";
import {
	TcgplayerCallout,
	TcgplayerLinks,
	TcgplayerLinksSkeleton,
} from "./tcgplayer-links";

export function SearchesPage({
	deckId,
}: {
	deckId: Id<"yugiohDecks">;
}): React.ReactElement | null {
	const searches = useQuery(api.yugioh.searches.listSearches, { deckId });
	const deck = useQuery(api.yugioh.decks.getDeck, { deckId });

	if (searches === undefined || deck === undefined) {
		return <SearchesPageSkeleton />;
	}
	// DeckShell (the layout) shows the missing-Deck state.
	if (searches === null || deck === null) return null;

	if (searches.length === 0 && deck.cardCount > 0 && !missesCopies(deck)) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CircleCheck />
					</EmptyMedia>
					<EmptyTitle>You own every Card</EmptyTitle>
					<EmptyDescription>
						All {deck.copiesNeeded} copies are in hand, so there's nothing to
						search for.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button variant="outline" asChild>
						<Link href={`/yugioh/decks/${deckId}`}>Go to Cards</Link>
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	if (searches.length === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<SearchIcon />
					</EmptyMedia>
					<EmptyTitle>No Searches yet</EmptyTitle>
					<EmptyDescription>Add Cards to get Searches.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button variant="outline" asChild>
						<Link href={`/yugioh/decks/${deckId}`}>Go to Cards</Link>
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<TcgplayerCallout deck={deck} />
			<section aria-labelledby="ebay-searches" className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<h2
						id="ebay-searches"
						className="font-semibold text-muted-foreground text-sm uppercase tracking-wide"
					>
						eBay Searches
					</h2>
					<p className="text-muted-foreground text-sm">
						For Cards you still need copies of, up to {MAX_SET_CODES_PER_SEARCH}{" "}
						set codes each. Open Newly listed for new supply, Sold for what
						Copies really go for.
					</p>
				</div>
				<ul className="grid gap-3 md:grid-cols-2">
					{searches.map((search, index) => (
						<li key={search.setCodes.join(",")} className="flex">
							<SearchCard search={search} number={index + 1} />
						</li>
					))}
				</ul>
			</section>
			<TcgplayerLinks deck={deck} />
		</div>
	);
}

function SearchCard({
	search,
	number,
}: {
	search: EbaySearch;
	number: number;
}): React.ReactElement {
	const count = search.setCodes.length;
	return (
		<Card className="w-full gap-4">
			<CardHeader>
				<CardTitle className="text-[0.9375rem]">
					Search {number}
					<span className="font-normal text-muted-foreground tabular-nums">
						{" · "}
						{count} {count === 1 ? "set code" : "set codes"}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-3">
				<ul aria-label="Set codes" className="flex flex-wrap gap-1.5">
					{search.setCodes.map((setCode) => (
						<li key={setCode}>
							<Badge
								variant="outline"
								className="font-medium font-mono text-[0.8125rem] tracking-tight"
								title={describeSetCode(search, setCode)}
							>
								{setCode}
							</Badge>
						</li>
					))}
				</ul>
				{search.exclusions.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-muted-foreground text-xs">Leaves out</span>
						<ul aria-label="Exclusions" className="flex flex-wrap gap-1.5">
							{search.exclusions.map((word) => (
								<li key={word}>
									<Badge variant="secondary" className="font-medium">
										−{word}
									</Badge>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
			<CardFooter className="flex-col gap-2 sm:flex-row">
				<Button className="h-11 w-full sm:h-9 sm:flex-1" asChild>
					<a
						href={search.newlyListedUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`Newly listed on eBay, Search ${number} (opens in a new tab)`}
					>
						Newly listed
						<ExternalLink data-icon="inline-end" />
					</a>
				</Button>
				<Button
					variant="outline"
					className="h-11 w-full sm:h-9 sm:flex-1"
					asChild
				>
					<a
						href={search.soldUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`Sold on eBay, Search ${number} (opens in a new tab)`}
					>
						Sold
						<ExternalLink data-icon="inline-end" />
					</a>
				</Button>
			</CardFooter>
		</Card>
	);
}

/** "Ash Blossom & Joyous Spring, Quarter Century Secret Rare" for a set code's tooltip. */
function describeSetCode(search: EbaySearch, setCode: string): string {
	return search.printings
		.filter((printing) => printing.setCode === setCode)
		.map((printing) => `${printing.cardName}, ${printing.rarity}`)
		.join("\n");
}

export function SearchesPageSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-full max-w-md" />
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{[0, 1, 2].map((key) => (
						<Card key={key} className="gap-4">
							<CardHeader>
								<Skeleton className="h-5 w-36" />
							</CardHeader>
							<CardContent className="flex flex-wrap gap-1.5">
								{[0, 1, 2, 3, 4].map((badge) => (
									<Skeleton key={badge} className="h-6 w-24 rounded-full" />
								))}
							</CardContent>
							<CardFooter className="flex-col gap-2 sm:flex-row">
								<Skeleton className="h-11 w-full sm:h-9 sm:flex-1" />
								<Skeleton className="h-11 w-full sm:h-9 sm:flex-1" />
							</CardFooter>
						</Card>
					))}
				</div>
			</div>
			<TcgplayerLinksSkeleton />
		</div>
	);
}

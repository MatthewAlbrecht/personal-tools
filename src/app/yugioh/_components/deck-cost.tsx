import { CircleHelp } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { formatWholeDollars } from "~/lib/yugioh/costs";
import type { DeckView } from "../_utils/types";
import { DeckProgress } from "./deck-progress";

type DeckCostFigures = NonNullable<DeckView["cost"]>;

/**
 * The Deck page's lead: cost to finish as the hero figure, the buy-now total
 * and progress beside it, then the Cards left out of the total, by name.
 */
export function DeckCostHeader({
	deck,
	cardHref,
	note,
}: {
	deck: DeckView;
	cardHref: (cardId: string) => string;
	/** One more muted callout under the others, such as "Last captured 9h ago". */
	note?: React.ReactNode;
}): React.ReactElement {
	const cost = deck.cost;
	const complete = cost !== null && cost.unfinishedCards === 0;
	const unpriced = cost?.cardsWithoutPrice ?? [];
	const nonePriced =
		cost !== null && !complete && unpriced.length === cost.unfinishedCards;

	return (
		<section aria-label="Cost to finish" className="flex flex-col gap-3">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
				{cost !== null && (
					<div className="flex flex-col">
						{complete ? (
							<p className="font-display font-semibold text-4xl md:text-5xl">
								Complete
							</p>
						) : nonePriced ? (
							<>
								<p className="font-display font-semibold text-2xl text-muted-foreground md:text-3xl">
									No Reference prices yet
								</p>
								<p className="text-muted-foreground text-sm">
									A Card needs 3 sales in the last 60 days for a Reference
									price.
								</p>
							</>
						) : (
							<>
								<p className="font-display font-semibold text-4xl tabular-nums md:text-5xl">
									{formatWholeDollars(cost.toFinish)}
								</p>
								<p className="text-muted-foreground text-sm">to finish</p>
							</>
						)}
					</div>
				)}
				<div className="flex w-full flex-col gap-2 md:max-w-xs">
					{cost !== null && !complete && <BuyNowLine cost={cost} />}
					<DeckProgress
						copiesOwned={deck.copiesOwned}
						copiesNeeded={deck.copiesNeeded}
					/>
				</div>
			</div>
			{unpriced.length > 0 && (
				<p className="flex gap-1.5 text-muted-foreground text-sm">
					<CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
					<span>
						{unpricedLead(unpriced.length, nonePriced)}
						{unpriced.map((card, index) => (
							<span key={card._id}>
								{index > 0 && ", "}
								<Link
									href={cardHref(card._id)}
									replace
									scroll={false}
									className="rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
								>
									{card.cardName}
								</Link>
							</span>
						))}
						.
					</span>
				</p>
			)}
			{note}
		</section>
	);
}

/** Leads the list of Cards without a price, which the total leaves out. */
function unpricedLead(count: number, nonePriced: boolean): string {
	const cards = count === 1 ? "1 Card has" : `${count} Cards have`;
	if (nonePriced) return `${cards} no Reference price yet: `;
	return count === 1
		? `${cards} no Reference price yet, so it isn't in the total: `
		: `${cards} no Reference price yet, so they aren't in the total: `;
}

/** "$860 buy now", "for 5 of 8 Cards" when some have nothing listed. */
function BuyNowLine({ cost }: { cost: DeckCostFigures }): React.ReactElement {
	const covered = cost.unfinishedCards - cost.cardsWithoutBuyNow;
	if (covered === 0) {
		return (
			<p className="text-muted-foreground text-sm md:text-right">
				No buy-it-now Listings yet
			</p>
		);
	}
	return (
		<p className="text-sm md:text-right">
			<span className="font-semibold tabular-nums">
				{formatWholeDollars(cost.buyNow)}
			</span>{" "}
			buy now
			{cost.cardsWithoutBuyNow > 0 && (
				<span className="text-muted-foreground">
					{" "}
					for {covered} of {cost.unfinishedCards} Cards
				</span>
			)}
		</p>
	);
}

/** One line for the Decks overview: "$1,240 · $860 buy now", or nothing before prices. */
export function DeckCostLine({
	cost,
	cardCount,
}: {
	cost: DeckCostFigures | null;
	cardCount: number;
}): React.ReactElement | null {
	if (cost === null || cardCount === 0) return null;
	if (cost.unfinishedCards === 0) {
		return <p className="font-display font-semibold text-2xl">Complete</p>;
	}
	if (cost.cardsWithoutPrice.length === cost.unfinishedCards) return null;
	const covered = cost.unfinishedCards - cost.cardsWithoutBuyNow;
	return (
		<p className="flex flex-wrap items-baseline gap-x-1.5">
			<span className="font-display font-semibold text-2xl tabular-nums">
				{formatWholeDollars(cost.toFinish)}
			</span>
			<span className="text-muted-foreground text-sm">to finish</span>
			{covered > 0 && (
				<span className="text-muted-foreground text-sm tabular-nums">
					· {formatWholeDollars(cost.buyNow)} buy now
					{cost.cardsWithoutBuyNow > 0 &&
						` for ${covered} of ${cost.unfinishedCards} Cards`}
				</span>
			)}
		</p>
	);
}

export function DeckCostHeaderSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-10 w-40 md:h-12" />
				<Skeleton className="h-4 w-16" />
			</div>
			<div className="flex w-full flex-col gap-2 md:max-w-xs">
				<Skeleton className="h-5 w-32" />
				<Skeleton className="h-1.5 w-full" />
			</div>
		</div>
	);
}

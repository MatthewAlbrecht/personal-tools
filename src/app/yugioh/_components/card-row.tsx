import { Check } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "~/lib/utils";
import { formatWholeDollars } from "~/lib/yugioh/costs";
import { isCardFinished, rarityAbbreviation } from "~/lib/yugioh/deck";
import { newListingsRate } from "~/lib/yugioh/listing-format";
import type { DeckCard } from "../_utils/types";
import { CardArt } from "./card-art";

/**
 * One Card in a Section. Tapping opens the Card drawer via `?card=`.
 * `withHandle` tightens the left edge for the Custom order grip handle.
 */
export function CardRow({
	card,
	href,
	withHandle = false,
}: {
	card: DeckCard;
	href: string;
	withHandle?: boolean;
}): React.ReactElement {
	const chosen = card.candidates.find(
		(candidate) => candidate.printingId === card.chosenPrintingId,
	);
	const shown =
		chosen ?? (card.candidates.length === 1 ? card.candidates[0] : undefined);
	const pictured = shown ?? card.candidates[0];
	const finished = isCardFinished(card);
	const left = card.copiesNeeded - card.copiesOwned;

	return (
		<Link
			href={href}
			replace
			scroll={false}
			className={cn(
				"flex min-h-14 items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 active:bg-muted md:px-4",
				finished && "opacity-60",
				withHandle && "pl-0 md:pl-0",
			)}
		>
			<CardArt
				setCode={pictured?.setCode ?? null}
				imageUrl={pictured?.tcgplayer.imageUrl ?? null}
				alt={pictured ? `${card.cardName}, ${pictured.rarity}` : card.cardName}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium text-[0.9375rem]">
					{card.cardName}
				</span>
				<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
					{shown ? (
						<span className="truncate">
							<span className="font-mono text-[0.8125rem] tracking-tight">
								{shown.setCode}
							</span>
							{" · "}
							<abbr title={shown.rarity} className="no-underline">
								<span className="md:hidden">
									{rarityAbbreviation(shown.rarity)}
								</span>
								<span className="hidden md:inline">{shown.rarity}</span>
							</abbr>
						</span>
					) : (
						<span className="truncate">
							Undecided · {card.candidates.length} Printings
						</span>
					)}
					<span aria-hidden>·</span>
					<span className="shrink-0 tabular-nums">
						{card.copiesOwned} / {card.copiesNeeded}
						<span className="sr-only"> Copies owned</span>
					</span>
				</span>
				{/* Third line, only when there's something to say. */}
				{card.newListingsPerWeek !== null && card.newListingsPerWeek > 0 && (
					<span className="truncate text-muted-foreground text-xs tabular-nums">
						{newListingsRate(card.newListingsPerWeek)}
					</span>
				)}
			</div>
			<div className="flex shrink-0 flex-col items-end justify-center text-right text-sm tabular-nums">
				{finished ? (
					<Check
						aria-label="Finished"
						className="size-4 text-muted-foreground"
					/>
				) : card.cost === null ? (
					<span className="text-muted-foreground">{left} left</span>
				) : (
					<CardCostColumn cost={card.cost} />
				)}
			</div>
		</Link>
	);
}

/** Remaining cost (whole dollars) over the buy-now total, or "No price". */
function CardCostColumn({
	cost,
}: {
	cost: NonNullable<DeckCard["cost"]>;
}): React.ReactElement {
	return (
		<>
			{cost.toFinish === null ? (
				<span className="text-muted-foreground">No price</span>
			) : (
				<span className="font-medium">
					{formatWholeDollars(cost.toFinish)}
					<span className="sr-only"> to finish</span>
				</span>
			)}
			{cost.buyNow !== null && (
				<span className="text-muted-foreground text-xs">
					{formatWholeDollars(cost.buyNow)} buy now
				</span>
			)}
		</>
	);
}

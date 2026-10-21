"use client";

import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type * as React from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import {
	type GridColumns,
	largeTcgplayerImage,
	tileCopies,
	tilePrintings,
} from "~/lib/yugioh/card-grid";
import { formatWholeDollars } from "~/lib/yugioh/costs";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import { newListingsRate } from "~/lib/yugioh/listing-format";
import type { DeckCard } from "../_utils/types";

/** Real card corners: about 3 mm on a 59 × 86 mm card. */
const CARD_CORNERS = "rounded-[4.5%/3.1%]";

/** Image widths per column choice, for `next/image` to pick a source. */
const IMAGE_SIZES: Record<GridColumns, string> = {
	2: "(min-width: 1024px) 480px, 50vw",
	3: "(min-width: 1024px) 320px, 33vw",
	4: "(min-width: 1024px) 240px, (min-width: 640px) 25vw, 33vw",
};

/**
 * One Card in the Cards grid: its art large, then name, Printing, Copies and
 * cost to finish. Tapping opens the Card drawer via `?card=`.
 */
export function CardTile({
	card,
	href,
	columns,
	dragging = false,
}: {
	card: DeckCard;
	href: string;
	columns: GridColumns;
	/** Lifted while its Custom order handle is dragged. */
	dragging?: boolean;
}): React.ReactElement {
	const { shown, pictured } = tilePrintings(card);
	const copies = tileCopies(card);

	return (
		<Link
			href={href}
			replace
			scroll={false}
			className="group/tile @container/tile flex flex-col gap-2.5 outline-none"
		>
			<div
				className={cn(
					"relative transition-[translate,scale,box-shadow,opacity] duration-150 ease-out",
					CARD_CORNERS,
					"shadow-sm ring-1 ring-border group-hover/tile:shadow-md",
					"motion-safe:group-hover/tile:-translate-y-0.5 motion-safe:group-active/tile:scale-[0.98]",
					"ring-offset-background group-focus-visible/tile:ring-2 group-focus-visible/tile:ring-ring group-focus-visible/tile:ring-offset-2",
					// Finished Cards step back; hovering brings the art forward again.
					copies.finished && "opacity-70 group-hover/tile:opacity-100",
					dragging && "scale-[1.03] opacity-100 shadow-xl",
				)}
			>
				<TileArt
					imageUrl={pictured?.tcgplayer.imageUrl ?? null}
					setCode={pictured?.setCode ?? null}
					alt={
						pictured
							? `${card.cardName}, ${pictured.setCode} ${pictured.rarity}`
							: card.cardName
					}
					sizes={IMAGE_SIZES[columns]}
				/>
				{copies.finished && (
					<span className="-top-2 -right-2 absolute flex @[12rem]/tile:size-7 size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border">
						<Check aria-hidden className="@[12rem]/tile:size-4 size-3.5" />
					</span>
				)}
			</div>

			<div className="flex min-w-0 flex-col gap-0.5 px-0.5">
				<span
					className={cn(
						"line-clamp-2 font-medium @[12rem]/tile:text-[0.9375rem] text-[0.8125rem] leading-snug",
						copies.finished && "text-muted-foreground",
					)}
				>
					{card.cardName}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{shown ? (
						<>
							<span
								translate="no"
								className="font-mono @[12rem]/tile:text-[0.8125rem] text-[0.6875rem] tracking-tight"
							>
								{shown.setCode}
							</span>
							{" · "}
							<abbr title={shown.rarity} className="no-underline">
								<span className="@[18rem]/tile:hidden">
									{rarityAbbreviation(shown.rarity)}
								</span>
								<span className="@[18rem]/tile:inline hidden">
									{shown.rarity}
								</span>
							</abbr>
						</>
					) : (
						<>Undecided · {card.candidates.length} Printings</>
					)}
				</span>

				<div className="mt-1 flex items-start justify-between gap-2">
					<CopyPips
						pips={copies.pips}
						owned={card.copiesOwned}
						needed={card.copiesNeeded}
						finished={copies.finished}
					/>
					{copies.finished ? (
						<span className="sr-only">Finished</span>
					) : (
						<TileCost cost={card.cost} left={copies.left} />
					)}
				</div>
				{/* Only when there's something to say. */}
				{!copies.finished &&
					card.newListingsPerWeek !== null &&
					card.newListingsPerWeek > 0 && (
						<span className="truncate text-muted-foreground text-xs tabular-nums">
							{newListingsRate(card.newListingsPerWeek)}
						</span>
					)}
			</div>
		</Link>
	);
}

/**
 * The art at the 59:86 card ratio. TCGplayer's scans are the card edge to
 * edge, so covering the frame trims well under 1%. It fades in as it loads;
 * without an image, a card back in theme tokens with the set's prefix.
 */
function TileArt({
	imageUrl,
	setCode,
	alt,
	sizes,
}: {
	imageUrl: string | null;
	setCode: string | null;
	alt: string;
	sizes: string;
}): React.ReactElement {
	const [loaded, setLoaded] = useState(false);
	return (
		<div
			className={cn(
				"relative aspect-[59/86] w-full overflow-hidden bg-muted",
				CARD_CORNERS,
			)}
		>
			{imageUrl ? (
				<Image
					src={largeTcgplayerImage(imageUrl)}
					alt={alt}
					fill
					sizes={sizes}
					onLoad={() => setLoaded(true)}
					className={cn(
						"object-cover transition-opacity duration-300 ease-out",
						loaded ? "opacity-100" : "opacity-0",
					)}
				/>
			) : (
				<CardBack prefix={setCode?.split("-")[0] ?? ""} />
			)}
		</div>
	);
}

/** A quiet card back: an inset frame and the oval, with the set's prefix. */
function CardBack({ prefix }: { prefix: string }): React.ReactElement {
	return (
		<div aria-hidden className="absolute inset-0">
			<div className="absolute inset-[6%] rounded-[3%/2%] border border-foreground/10" />
			<div className="-translate-y-1/2 absolute inset-x-[20%] top-1/2 flex aspect-[3/4] items-center justify-center rounded-[50%] border border-foreground/15 bg-background/50">
				<span className="font-mono @[12rem]/tile:text-xs text-[0.625rem] text-muted-foreground tracking-tight">
					{prefix}
				</span>
			</div>
		</div>
	);
}

/** One pip per Copy needed, filled for each owned, with the count beside. */
function CopyPips({
	pips,
	owned,
	needed,
	finished,
}: {
	pips: boolean[];
	owned: number;
	needed: number;
	finished: boolean;
}): React.ReactElement {
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
			<span aria-hidden className="flex items-center gap-[3px]">
				{pips.map((filled, index) => (
					<span
						key={index}
						className={cn(
							"size-1.5 rounded-full",
							filled
								? finished
									? "bg-muted-foreground"
									: "bg-foreground"
								: "ring-1 ring-muted-foreground ring-inset",
						)}
					/>
				))}
			</span>
			<span>
				{owned}/{needed}
				<span className="sr-only"> Copies owned</span>
			</span>
		</span>
	);
}

/** Cost to finish over the buy-now total, "No price", or Copies left. */
function TileCost({
	cost,
	left,
}: {
	cost: DeckCard["cost"];
	left: number;
}): React.ReactElement {
	if (cost === null) {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				{left} left
			</span>
		);
	}
	return (
		<span className="flex min-w-0 flex-col items-end text-right tabular-nums">
			{cost.toFinish === null ? (
				<span className="text-muted-foreground text-xs">No price</span>
			) : (
				<span className="font-semibold @[12rem]/tile:text-sm text-[0.8125rem] leading-tight">
					{formatWholeDollars(cost.toFinish)}
					<span className="sr-only"> to finish</span>
				</span>
			)}
			{cost.buyNow !== null && (
				<span className="truncate text-muted-foreground text-xs">
					{formatWholeDollars(cost.buyNow)} buy now
				</span>
			)}
		</span>
	);
}

/** A tile's shape while the Deck loads. */
export function CardTileSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-2.5">
			<Skeleton className={cn("aspect-[59/86] w-full", CARD_CORNERS)} />
			<div className="flex flex-col gap-1.5 px-0.5">
				<Skeleton className="h-4 w-4/5" />
				<Skeleton className="h-3 w-1/2" />
				<div className="mt-1 flex justify-between">
					<Skeleton className="h-3 w-10" />
					<Skeleton className="h-3 w-8" />
				</div>
			</div>
		</div>
	);
}

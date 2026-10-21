"use client";

import { useMutation } from "convex/react";
import {
	ArrowLeft,
	ArrowLeftToLine,
	ArrowRight,
	ArrowRightToLine,
	GripVertical,
} from "lucide-react";
import { useRef, useState } from "react";
import type * as React from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useHourClock } from "~/lib/hooks/use-hour-clock";
import { cn } from "~/lib/utils";
import type { GridColumns } from "~/lib/yugioh/card-grid";
import { SECTION_LABELS, type Section } from "~/lib/yugioh/deck";
import {
	type TileBox,
	gridDragTarget,
	gridShift,
} from "~/lib/yugioh/drag-reorder";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { applyCardMove, updateCachedDeck } from "../_utils/optimistic";
import type { DeckCard } from "../_utils/types";
import { TilePriorityMenu } from "./card-priority";
import { CardTile, CardTileSkeleton } from "./card-tile";

/**
 * Columns per choice. A phone (under `sm`) shows at most 3: at 4 a tile is
 * too narrow for its name and price.
 */
export const GRID_CLASSES: Record<GridColumns, string> = {
	2: "grid-cols-2 gap-x-4 gap-y-7 md:gap-x-6 md:gap-y-9",
	3: "grid-cols-3 gap-x-3 gap-y-6 md:gap-x-5 md:gap-y-8",
	4: "grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:gap-x-4 md:gap-y-7",
};

/** How far a press must travel before it's a drag rather than a tap. */
const DRAG_THRESHOLD = 4;
/** Auto-scroll zones: the top one clears the sticky site header and Deck tabs. */
const TOP_EDGE = 128;
const BOTTOM_EDGE = 72;
const MAX_SCROLL_STEP = 14;
const SHIFT_TRANSITION = "transform 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";

type DragSession = {
	cardId: DeckCard["_id"];
	pointerId: number;
	startX: number;
	startY: number;
	startScrollY: number;
	lastX: number;
	lastY: number;
	fromIndex: number;
	toIndex: number;
	/** Tile boxes measured at press time, in page coordinates. */
	tiles: Array<TileBox & { element: HTMLElement }>;
	dragging: boolean;
	frame: number;
};

/**
 * A Section's Cards as a grid of tiles. In Custom order each tile gets a grip
 * handle: drag it to move the Card within this Section, or tap it (Enter or
 * Space on a keyboard) to move it earlier, later, to the start or to the end.
 */
export function CardTileGrid({
	deckId,
	section,
	cards,
	columns,
	sortable,
	cardHref,
}: {
	deckId: Id<"yugiohDecks">;
	section: Section;
	cards: DeckCard[];
	columns: GridColumns;
	sortable: boolean;
	cardHref: (cardId: string) => string;
}): React.ReactElement {
	const gridRef = useRef<HTMLUListElement>(null);
	const session = useRef<DragSession | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [menuId, setMenuId] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");
	// The hour getDeck was priced at, so the server orders unpositioned Cards as shown.
	const now = useHourClock();

	const moveCard = useMutation(api.yugioh.decks.moveCard).withOptimisticUpdate(
		(store, args) => {
			updateCachedDeck(store, deckId, (deck) =>
				applyCardMove(deck, args.deckCardId, args.toIndex),
			);
		},
	);

	function move(card: DeckCard, toIndex: number): void {
		const index = Math.min(Math.max(toIndex, 0), cards.length - 1);
		if (cards[index]?._id === card._id) return;
		setAnnouncement(
			`${card.cardName} moved to ${index + 1} of ${cards.length} in ${SECTION_LABELS[section]}.`,
		);
		moveCard({ deckCardId: card._id, toIndex: index, now }).catch(
			(error: unknown) => {
				toast.error(errorMessage(error, "Couldn't move the Card. Try again."));
			},
		);
	}

	function handlePointerDown(
		event: React.PointerEvent<HTMLButtonElement>,
		cardId: DeckCard["_id"],
	): void {
		if (event.button !== 0 || session.current || !gridRef.current) return;
		// Keeps the menu from opening on press; a press that doesn't drag opens it on release.
		event.preventDefault();
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Capture is best effort: it throws for a pointer that's already gone.
		}
		const tiles = [...gridRef.current.children].map((child) => {
			const element = child as HTMLElement;
			const box = element.getBoundingClientRect();
			return {
				element,
				left: box.left + window.scrollX,
				top: box.top + window.scrollY,
				width: box.width,
				height: box.height,
			};
		});
		const fromIndex = cards.findIndex((card) => card._id === cardId);
		if (fromIndex === -1) return;
		session.current = {
			cardId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startScrollY: window.scrollY,
			lastX: event.clientX,
			lastY: event.clientY,
			fromIndex,
			toIndex: fromIndex,
			tiles,
			dragging: false,
			frame: 0,
		};
	}

	function handlePointerMove(
		event: React.PointerEvent<HTMLButtonElement>,
	): void {
		const drag = session.current;
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
		if (!drag.dragging) {
			const travel = Math.hypot(
				event.clientX - drag.startX,
				event.clientY - drag.startY,
			);
			if (travel < DRAG_THRESHOLD) return;
			drag.dragging = true;
			const reduced = prefersReducedMotion();
			drag.tiles.forEach((tile, index) => {
				// The dragged tile follows the finger exactly; the others make room.
				tile.element.style.transition =
					index === drag.fromIndex || reduced ? "none" : SHIFT_TRANSITION;
			});
			setDraggingId(drag.cardId);
			autoScroll(drag);
		}
		track(drag);
	}

	function track(drag: DragSession): void {
		const { tiles, fromIndex } = drag;
		const from = tiles[fromIndex];
		if (!from) return;
		const dx = drag.lastX - drag.startX;
		const dy = drag.lastY - drag.startY + (window.scrollY - drag.startScrollY);
		from.element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
		drag.toIndex = gridDragTarget(tiles, fromIndex, dx, dy);

		for (const [index, tile] of tiles.entries()) {
			if (index === fromIndex) continue;
			const shift = gridShift(tiles, fromIndex, drag.toIndex, index);
			tile.element.style.transform =
				shift.x || shift.y ? `translate3d(${shift.x}px, ${shift.y}px, 0)` : "";
		}
	}

	function autoScroll(drag: DragSession): void {
		function step(): void {
			if (session.current !== drag) return;
			const y = drag.lastY;
			let delta = 0;
			if (y < TOP_EDGE) {
				delta = -MAX_SCROLL_STEP * Math.min(1, (TOP_EDGE - y) / TOP_EDGE);
			} else if (y > window.innerHeight - BOTTOM_EDGE) {
				delta =
					MAX_SCROLL_STEP *
					Math.min(1, (y - (window.innerHeight - BOTTOM_EDGE)) / BOTTOM_EDGE);
			}
			if (delta !== 0) {
				window.scrollBy(0, delta);
				track(drag);
			}
			drag.frame = requestAnimationFrame(step);
		}
		drag.frame = requestAnimationFrame(step);
	}

	function finish(
		event: React.PointerEvent<HTMLButtonElement>,
		drop: boolean,
	): void {
		const drag = session.current;
		if (!drag || event.pointerId !== drag.pointerId) return;
		session.current = null;
		cancelAnimationFrame(drag.frame);
		if (!drag.dragging) {
			if (drop) setMenuId(drag.cardId);
			return;
		}
		const dropped = drag.tiles[drag.fromIndex]?.element;
		const before = dropped?.getBoundingClientRect();
		for (const tile of drag.tiles) {
			tile.element.style.transition = "none";
			tile.element.style.transform = "";
		}
		const card = cards[drag.fromIndex];
		// Commit the reorder now so the dropped tile can be measured in its new slot.
		flushSync(() => {
			setDraggingId(null);
			if (drop && card) move(card, drag.toIndex);
		});
		if (!dropped || !before || prefersReducedMotion()) return;
		// The dropped tile settles from where the finger left it into its slot.
		const after = dropped.getBoundingClientRect();
		const dx = before.left - after.left;
		const dy = before.top - after.top;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
		dropped.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
		dropped.getBoundingClientRect();
		dropped.style.transition = SHIFT_TRANSITION;
		dropped.style.transform = "";
	}

	return (
		<>
			<ul ref={gridRef} className={cn("grid", GRID_CLASSES[columns])}>
				{cards.map((card, index) => (
					<li
						key={card._id}
						className={cn(
							"group/card relative",
							draggingId === card._id && "z-10",
						)}
					>
						<CardTile
							card={card}
							href={cardHref(card._id)}
							columns={columns}
							dragging={draggingId === card._id}
						/>
						{/* Covers the art only, so the mark sits on its bottom corner. */}
						<div className="pointer-events-none absolute inset-x-0 top-0 aspect-[59/86] *:pointer-events-auto">
							<TilePriorityMenu deckId={deckId} card={card} />
						</div>
						{sortable && (
							<DropdownMenu
								open={menuId === card._id}
								onOpenChange={(open) => setMenuId(open ? card._id : null)}
							>
								<DropdownMenuTrigger
									asChild
									onPointerDown={(event) => handlePointerDown(event, card._id)}
									onPointerMove={handlePointerMove}
									onPointerUp={(event) => finish(event, true)}
									onPointerCancel={(event) => finish(event, false)}
								>
									<Button
										variant="secondary"
										size="icon"
										aria-label={`Move ${card.cardName}`}
										className={cn(
											// Sits on the art's top-left corner; the hit area reaches 44px.
											"before:-inset-1.5 absolute top-1.5 left-1.5 size-8 cursor-grab touch-none select-none rounded-full bg-background/85 shadow-sm ring-1 ring-border backdrop-blur-sm [-webkit-touch-callout:none] before:absolute hover:bg-background",
											draggingId === card._id && "cursor-grabbing",
										)}
									>
										<GripVertical />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<DropdownMenuGroup>
										<DropdownMenuItem
											disabled={index === 0}
											onSelect={() => move(card, index - 1)}
										>
											<ArrowLeft />
											Move earlier
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={index === cards.length - 1}
											onSelect={() => move(card, index + 1)}
										>
											<ArrowRight />
											Move later
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={index === 0}
											onSelect={() => move(card, 0)}
										>
											<ArrowLeftToLine />
											Move to start
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={index === cards.length - 1}
											onSelect={() => move(card, cards.length - 1)}
										>
											<ArrowRightToLine />
											Move to end
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</li>
				))}
			</ul>
			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</>
	);
}

/** A Section's grid while the Deck loads. */
export function CardTileGridSkeleton({
	columns,
	count,
}: {
	columns: GridColumns;
	count: number;
}): React.ReactElement {
	return (
		<ul className={cn("grid", GRID_CLASSES[columns])}>
			{Array.from({ length: count }, (_, index) => (
				<li key={index}>
					<CardTileSkeleton />
				</li>
			))}
		</ul>
	);
}

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

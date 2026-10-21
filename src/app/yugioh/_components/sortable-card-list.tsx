"use client";

import { useMutation } from "convex/react";
import {
	ArrowDown,
	ArrowDownToLine,
	ArrowUp,
	ArrowUpToLine,
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
import { SECTION_LABELS, type Section } from "~/lib/yugioh/deck";
import { dragTarget } from "~/lib/yugioh/drag-reorder";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "../_utils/errors";
import { applyCardMove, updateCachedDeck } from "../_utils/optimistic";
import type { DeckCard } from "../_utils/types";
import { CardRow } from "./card-row";

/** How far a press must travel before it's a drag rather than a tap. */
const DRAG_THRESHOLD = 4;
/** Auto-scroll zones: the top one clears the sticky site header and Deck tabs. */
const TOP_EDGE = 128;
const BOTTOM_EDGE = 72;
const MAX_SCROLL_STEP = 14;
const SHIFT_TRANSITION = "transform 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";

type DragSession = {
	cardId: DeckCard["_id"];
	pointerId: number;
	startClientY: number;
	startScrollY: number;
	lastClientY: number;
	fromIndex: number;
	toIndex: number;
	/** Row boxes measured at press time, in page coordinates. */
	rows: Array<{ element: HTMLElement; top: number; height: number }>;
	dragging: boolean;
	frame: number;
};

/**
 * A Section's Cards in Custom order. Each row has a grip handle: drag it to
 * move the Card within this Section, or tap it (Enter or Space on a keyboard)
 * for Move up / down / to top / to bottom.
 */
export function SortableCardList({
	deckId,
	section,
	cards,
	cardHref,
}: {
	deckId: Id<"yugiohDecks">;
	section: Section;
	cards: DeckCard[];
	cardHref: (cardId: string) => string;
}): React.ReactElement {
	const listRef = useRef<HTMLUListElement>(null);
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
		if (event.button !== 0 || session.current || !listRef.current) return;
		// Keeps the menu from opening on press; a press that doesn't drag opens it on release.
		event.preventDefault();
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Capture is best effort: it throws for a pointer that's already gone.
		}
		const rows = [...listRef.current.children].map((child) => {
			const element = child as HTMLElement;
			const box = element.getBoundingClientRect();
			return { element, top: box.top + window.scrollY, height: box.height };
		});
		const fromIndex = cards.findIndex((card) => card._id === cardId);
		if (fromIndex === -1) return;
		session.current = {
			cardId,
			pointerId: event.pointerId,
			startClientY: event.clientY,
			startScrollY: window.scrollY,
			lastClientY: event.clientY,
			fromIndex,
			toIndex: fromIndex,
			rows,
			dragging: false,
			frame: 0,
		};
	}

	function handlePointerMove(
		event: React.PointerEvent<HTMLButtonElement>,
	): void {
		const drag = session.current;
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.lastClientY = event.clientY;
		if (!drag.dragging) {
			if (Math.abs(event.clientY - drag.startClientY) < DRAG_THRESHOLD) return;
			drag.dragging = true;
			const reduced = prefersReducedMotion();
			drag.rows.forEach((row, index) => {
				// The dragged row follows the finger exactly; the others make room.
				row.element.style.transition =
					index === drag.fromIndex || reduced ? "none" : SHIFT_TRANSITION;
			});
			setDraggingId(drag.cardId);
			autoScroll(drag);
		}
		track(drag);
	}

	function track(drag: DragSession): void {
		const { rows, fromIndex } = drag;
		const from = rows[fromIndex];
		if (!from) return;
		const { offset, toIndex } = dragTarget(
			rows,
			fromIndex,
			drag.lastClientY -
				drag.startClientY +
				(window.scrollY - drag.startScrollY),
		);
		from.element.style.transform = `translate3d(0, ${offset}px, 0)`;
		drag.toIndex = toIndex;

		for (const [index, row] of rows.entries()) {
			if (index === fromIndex) continue;
			let shift = 0;
			if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
				shift = -from.height;
			} else if (toIndex < fromIndex && index >= toIndex && index < fromIndex) {
				shift = from.height;
			}
			row.element.style.transform = shift
				? `translate3d(0, ${shift}px, 0)`
				: "";
		}
	}

	function autoScroll(drag: DragSession): void {
		function step(): void {
			if (session.current !== drag) return;
			const y = drag.lastClientY;
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
		const dropped = drag.rows[drag.fromIndex]?.element;
		const before = dropped?.getBoundingClientRect().top ?? 0;
		for (const row of drag.rows) {
			row.element.style.transition = "none";
			row.element.style.transform = "";
		}
		const card = cards[drag.fromIndex];
		// Commit the reorder now so the dropped row can be measured in its new slot.
		flushSync(() => {
			setDraggingId(null);
			if (drop && card) move(card, drag.toIndex);
		});
		if (!dropped || prefersReducedMotion()) return;
		// The dropped row settles from where the finger left it into its slot.
		const after = dropped.getBoundingClientRect().top;
		if (Math.abs(before - after) < 1) return;
		dropped.style.transform = `translate3d(0, ${before - after}px, 0)`;
		dropped.getBoundingClientRect();
		dropped.style.transition = SHIFT_TRANSITION;
		dropped.style.transform = "";
	}

	return (
		<>
			<ul ref={listRef} className="divide-y">
				{cards.map((card, index) => (
					<li
						key={card._id}
						className={cn(
							"relative flex items-stretch bg-card",
							draggingId === card._id && "z-10 shadow-lg ring-1 ring-border",
						)}
					>
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
									variant="ghost"
									size="icon"
									aria-label={`Move ${card.cardName}`}
									className={cn(
										"h-auto w-11 shrink-0 cursor-grab touch-none select-none self-stretch rounded-none text-muted-foreground [-webkit-touch-callout:none]",
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
										<ArrowUp />
										Move up
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={index === cards.length - 1}
										onSelect={() => move(card, index + 1)}
									>
										<ArrowDown />
										Move down
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={index === 0}
										onSelect={() => move(card, 0)}
									>
										<ArrowUpToLine />
										Move to top
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={index === cards.length - 1}
										onSelect={() => move(card, cards.length - 1)}
									>
										<ArrowDownToLine />
										Move to bottom
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						<div className="min-w-0 flex-1">
							<CardRow card={card} href={cardHref(card._id)} withHandle />
						</div>
					</li>
				))}
			</ul>
			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>
		</>
	);
}

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

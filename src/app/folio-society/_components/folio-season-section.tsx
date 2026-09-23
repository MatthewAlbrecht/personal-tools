"use client";

import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import {
	FolioBookCard,
	FolioBookCardSkeleton,
	FolioBookDetail,
	type FolioCatalogCard,
	type FolioProductImage,
} from "./folio-book-card";

export function FolioSeasonSection({
	label,
	cards,
	now,
	onSetOwnership,
	marksFor,
}: {
	label: string;
	cards: FolioCatalogCard[];
	now: number;
	onSetOwnership: (productId: number, status: "owned" | "want" | null) => void;
	marksFor: (
		productId: number,
		fallback: FolioCatalogCard,
	) => {
		owned: boolean;
		want: boolean;
	};
}): ReactNode {
	const cols = useGridColumnCount();
	const [openProductId, setOpenProductId] = useState<number | null>(null);

	const openIndex = useMemo(() => {
		if (openProductId === null) {
			return null;
		}
		const index = cards.findIndex((card) => card.productId === openProductId);
		return index >= 0 ? index : null;
	}, [cards, openProductId]);

	const openCard = openIndex === null ? null : (cards[openIndex] ?? null);
	const insertAfter =
		openIndex === null ? null : rowEndIndex(openIndex, cols, cards.length);

	const images = useQuery(
		api.folioSocietyImages.getActiveImagesByProduct,
		openCard ? { productId: openCard.productId } : "skip",
	);

	useEffect(() => {
		if (openProductId === null) {
			return;
		}
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				setOpenProductId(null);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [openProductId]);

	function toggleCard(card: FolioCatalogCard): void {
		if (openProductId === card.productId) {
			setOpenProductId(null);
			return;
		}
		setOpenProductId(card.productId);
	}

	return (
		<section className="mb-16">
			<h2 className="mb-3 font-[family-name:var(--font-display)] text-3xl tracking-tight">
				{label}
			</h2>
			<div className="mb-7 h-px bg-gradient-to-r from-stone-400/60 via-stone-300/30 to-transparent" />
			<div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
				{cards.flatMap((card, index) => {
					const marks = marksFor(card.productId, card);
					const tile = (
						<FolioBookCard
							key={card.productId}
							card={{ ...card, ...marks }}
							now={now}
							expanded={openProductId === card.productId}
							onToggleExpand={() => toggleCard(card)}
							onSetOwnership={(status) =>
								onSetOwnership(card.productId, status)
							}
						/>
					);
					if (insertAfter !== index || !openCard) {
						return [tile];
					}
					const selectedMarks = marksFor(openCard.productId, openCard);
					return [
						tile,
						<FolioExpandRow key={`${openCard.productId}-detail`}>
							<FolioBookDetail
								key={openCard.productId}
								card={openCard}
								now={now}
								images={images as FolioProductImage[] | undefined}
								onClose={() => setOpenProductId(null)}
								onSetOwnership={onSetOwnership}
								owned={selectedMarks.owned}
								want={selectedMarks.want}
							/>
						</FolioExpandRow>,
					];
				})}
			</div>
		</section>
	);
}

export function FolioSeasonSectionSkeleton(): ReactNode {
	return (
		<section className="mb-12">
			<Skeleton className="mb-6 h-9 w-40" />
			<div className="mb-8 border-border/40 border-b" />
			<div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<FolioBookCardSkeleton key={index} />
				))}
			</div>
		</section>
	);
}

function FolioExpandRow({
	children,
}: {
	children: ReactNode;
}): ReactNode {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			setOpen(true);
		});
		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<div
			className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-out"
			style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
		>
			<div className="min-h-0 overflow-hidden">{children}</div>
		</div>
	);
}

function useGridColumnCount(): number {
	const [cols, setCols] = useState(2);

	useEffect(() => {
		function update(): void {
			if (window.matchMedia("(min-width: 1280px)").matches) {
				setCols(4);
				return;
			}
			if (window.matchMedia("(min-width: 768px)").matches) {
				setCols(3);
				return;
			}
			setCols(2);
		}
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);

	return cols;
}

function rowEndIndex(openIndex: number, cols: number, total: number): number {
	const row = Math.floor(openIndex / cols);
	return Math.min(total - 1, (row + 1) * cols - 1);
}

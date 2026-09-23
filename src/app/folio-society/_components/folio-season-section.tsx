"use client";

import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import {
	FOLIO_GRID_CLASS,
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
	const [openProductId, setOpenProductId] = useState<number | null>(null);

	const openCard = useMemo(() => {
		if (openProductId === null) {
			return null;
		}
		return cards.find((card) => card.productId === openProductId) ?? null;
	}, [cards, openProductId]);

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

	const selectedMarks = openCard
		? marksFor(openCard.productId, openCard)
		: null;

	return (
		<section className="mb-16">
			<h2 className="mb-3 font-[family-name:var(--font-display)] text-stone-800 text-xl tracking-tight md:text-2xl">
				{label}
			</h2>
			<div className="mb-7 h-px bg-gradient-to-r from-stone-400/60 via-stone-300/30 to-transparent" />
			<div className={FOLIO_GRID_CLASS}>
				{cards.map((card) => {
					const marks = marksFor(card.productId, card);
					return (
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
				})}
			</div>
			{openCard && selectedMarks ? (
				<div className="mt-8">
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
				</div>
			) : null}
		</section>
	);
}

export function FolioSeasonSectionSkeleton(): ReactNode {
	return (
		<section className="mb-12">
			<Skeleton className="mb-6 h-7 w-40" />
			<div className="mb-8 border-border/40 border-b" />
			<div className={FOLIO_GRID_CLASS}>
				{Array.from({ length: 8 }).map((_, index) => (
					<FolioBookCardSkeleton key={index} />
				))}
			</div>
		</section>
	);
}

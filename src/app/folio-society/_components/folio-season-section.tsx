"use client";

import { useQuery } from "convex/react";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import {
	type FolioCatalogCard,
	FolioBookCard,
	FolioBookCardSkeleton,
	FolioBookDetail,
	type FolioFamilyEdition,
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
	onSetOwnership: (
		productId: number,
		status: "owned" | "want" | null,
	) => void;
	marksFor: (productId: number, fallback: FolioCatalogCard) => {
		owned: boolean;
		want: boolean;
	};
}): ReactNode {
	const cols = useGridColumnCount();
	const [openTitleKey, setOpenTitleKey] = useState<string | null>(null);
	const [selectedProductId, setSelectedProductId] = useState<number | null>(
		null,
	);

	const openIndex = useMemo(() => {
		if (!openTitleKey) {
			return null;
		}
		const index = cards.findIndex((card) => card.titleKey === openTitleKey);
		return index >= 0 ? index : null;
	}, [cards, openTitleKey]);

	const openCard = openIndex === null ? null : (cards[openIndex] ?? null);
	const insertAfter =
		openIndex === null ? null : rowEndIndex(openIndex, cols, cards.length);

	const family = useQuery(
		api.folioSocietyCatalog.getFamilyByTitleKey,
		openCard ? { titleKey: openCard.titleKey } : "skip",
	);
	const selectedId = selectedProductId ?? openCard?.productId ?? 0;
	const images = useQuery(
		api.folioSocietyImages.getActiveImagesByProduct,
		openCard ? { productId: selectedId } : "skip",
	);

	useEffect(() => {
		if (!openTitleKey) {
			return;
		}
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				setOpenTitleKey(null);
				setSelectedProductId(null);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [openTitleKey]);

	function toggleCard(card: FolioCatalogCard): void {
		if (openTitleKey === card.titleKey) {
			setOpenTitleKey(null);
			setSelectedProductId(null);
			return;
		}
		setOpenTitleKey(card.titleKey);
		setSelectedProductId(card.productId);
	}

	return (
		<section className="mb-12">
			<h2 className="mb-6 font-[family-name:var(--font-display)] text-3xl tracking-tight">
				{label}
			</h2>
			<div className="mb-8 border-border/40 border-b" />
			<div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
				{cards.flatMap((card, index) => {
					const marks = marksFor(card.productId, card);
					const tile = (
						<FolioBookCard
							key={card.titleKey}
							card={{ ...card, ...marks }}
							now={now}
							expanded={openTitleKey === card.titleKey}
							onToggleExpand={() => toggleCard(card)}
							onSetOwnership={(status) =>
								onSetOwnership(card.productId, status)
							}
						/>
					);
					if (insertAfter !== index || !openCard) {
						return [tile];
					}
					const selectedMarks = marksFor(selectedId, openCard);
					return [
						tile,
						<div
							key={`${openCard.titleKey}-detail`}
							className="col-span-full overflow-hidden transition-[max-height] duration-[240ms] ease-out"
						>
							<FolioBookDetail
								card={openCard}
								now={now}
								family={family as FolioFamilyEdition[] | undefined}
								images={images as FolioProductImage[] | undefined}
								selectedProductId={selectedId}
								onSelectProduct={setSelectedProductId}
								onClose={() => {
									setOpenTitleKey(null);
									setSelectedProductId(null);
								}}
								onSetOwnership={onSetOwnership}
								owned={selectedMarks.owned}
								want={selectedMarks.want}
							/>
						</div>,
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

"use client";

import { Bookmark, Check } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

export type FolioCatalogCard = {
	titleKey: string;
	productId: number;
	name: string;
	authorName: string | null;
	url: string;
	price: number | null;
	catalogLaunchTime: number;
	edition: "standard" | "limited" | "signed" | "bundle";
	isComingSoon: boolean;
	heroImageUrl: string | null;
	familyHasLimited: boolean;
	familyHasSigned: boolean;
	owned: boolean;
	want: boolean;
};

export type FolioFamilyEdition = {
	productId: number;
	name: string;
	edition: "standard" | "limited" | "signed" | "bundle";
	price: number | null;
	catalogLaunchTime: number;
	url: string;
	heroImageUrl: string | null;
	isComingSoon: boolean;
	authorName: string | null;
	owned: boolean;
	want: boolean;
};

export type FolioProductImage = {
	_id: string;
	blobUrl: string;
	imageType: "hero" | "gallery" | "thumbnail";
	position?: number;
};

export function FolioBookCard({
	card,
	now,
	expanded,
	onToggleExpand,
	onSetOwnership,
}: {
	card: FolioCatalogCard;
	now: number;
	expanded: boolean;
	onToggleExpand: () => void;
	onSetOwnership: (status: "owned" | "want" | null) => void;
}): ReactNode {
	const coming = isComing(card.isComingSoon, card.catalogLaunchTime, now);
	const showAlsoLe = card.familyHasLimited && card.edition !== "limited";
	const showAlsoSigned = card.familyHasSigned && card.edition !== "signed";
	const initial = card.name.trim().charAt(0).toUpperCase() || "F";

	return (
		<div className="relative">
			<button
				type="button"
				onClick={onToggleExpand}
				aria-expanded={expanded}
				className="w-full text-left"
			>
				<div className="relative mb-3 aspect-[3/4] w-[70%] overflow-hidden border border-stone-400/40 bg-stone-200">
					{card.heroImageUrl ? (
						<img
							src={card.heroImageUrl}
							alt=""
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center bg-stone-200">
							<span className="font-[family-name:var(--font-display)] text-4xl text-stone-500">
								{initial}
							</span>
						</div>
					)}
					<div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
						{card.edition === "limited" ? (
							<CoverChip>LE</CoverChip>
						) : null}
						{card.edition === "signed" ? (
							<CoverChip>Signed</CoverChip>
						) : null}
						{coming ? <CoverChip>Coming</CoverChip> : null}
						{showAlsoLe ? <CoverChip>Also LE</CoverChip> : null}
						{showAlsoSigned ? <CoverChip>Also signed</CoverChip> : null}
					</div>
					{card.owned ? (
						<span className="absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-teal-50">
							<Check className="h-3.5 w-3.5" strokeWidth={2.5} />
						</span>
					) : null}
				</div>
				{card.authorName ? (
					<p className="text-muted-foreground text-xs">{card.authorName}</p>
				) : null}
				<p className="line-clamp-2 font-[family-name:var(--font-display)] text-sm leading-snug">
					{card.name}
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{formatPriceDate(card.price, card.catalogLaunchTime)}
				</p>
			</button>
			<div className="absolute top-1.5 right-[32%] flex flex-col gap-1">
				<button
					type="button"
					aria-label="Owned"
					aria-pressed={card.owned}
					onClick={(event) => {
						event.stopPropagation();
						onSetOwnership(card.owned ? null : "owned");
					}}
					className={cn(
						"flex h-7 w-7 items-center justify-center rounded-full border",
						card.owned
							? "border-teal-800 bg-teal-800 text-teal-50"
							: "border-stone-400/50 bg-background/80 text-stone-500",
					)}
				>
					<Check className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					aria-label="Want"
					aria-pressed={card.want}
					onClick={(event) => {
						event.stopPropagation();
						onSetOwnership(card.want ? null : "want");
					}}
					className={cn(
						"flex h-7 w-7 items-center justify-center rounded-full border",
						card.want
							? "border-teal-800 text-teal-800"
							: "border-stone-400/50 bg-background/80 text-stone-500",
					)}
				>
					<Bookmark className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

export function FolioBookDetail({
	card,
	now,
	family,
	images,
	selectedProductId,
	onSelectProduct,
	onClose,
	onSetOwnership,
	owned,
	want,
}: {
	card: FolioCatalogCard;
	now: number;
	family: FolioFamilyEdition[] | undefined;
	images: FolioProductImage[] | undefined;
	selectedProductId: number;
	onSelectProduct: (productId: number) => void;
	onClose: () => void;
	onSetOwnership: (
		productId: number,
		status: "owned" | "want" | null,
	) => void;
	owned: boolean;
	want: boolean;
}): ReactNode {
	const selected =
		family?.find((row) => row.productId === selectedProductId) ??
		familyMemberFromCard(card);
	const showSwitcher =
		(card.familyHasLimited && card.edition !== "limited") ||
		(card.familyHasSigned && card.edition !== "signed");
	const editions = editionsPresent(family ?? [familyMemberFromCard(card)]);
	const coming = isComing(
		selected.isComingSoon,
		selected.catalogLaunchTime,
		now,
	);
	const thumbs = sortImages(images ?? []);
	const [showAll, setShowAll] = useState(false);
	const [coverUrl, setCoverUrl] = useState<string | null>(null);
	const visibleThumbs = showAll ? thumbs : thumbs.slice(0, 4);
	const cover =
		coverUrl ?? selected.heroImageUrl ?? thumbs[0]?.blobUrl ?? null;
	const initial = selected.name.trim().charAt(0).toUpperCase() || "F";

	useEffect(() => {
		setCoverUrl(null);
	}, [selectedProductId]);

	return (
		<div className="grid gap-6 py-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
			<div>
				<div className="mb-3 aspect-[3/4] w-full overflow-hidden border border-stone-400/40 bg-stone-200">
					{cover ? (
						<img src={cover} alt="" className="h-full w-full object-cover" />
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<span className="font-[family-name:var(--font-display)] text-5xl text-stone-500">
								{initial}
							</span>
						</div>
					)}
				</div>
				{thumbs.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{visibleThumbs.map((image) => (
							<button
								key={image._id}
								type="button"
								onClick={() => setCoverUrl(image.blobUrl)}
								className={cn(
									"h-14 w-11 overflow-hidden border",
									cover === image.blobUrl
										? "border-stone-600"
										: "border-stone-400/40",
								)}
							>
								<img
									src={image.blobUrl}
									alt=""
									className="h-full w-full object-cover"
								/>
							</button>
						))}
					</div>
				) : null}
				{thumbs.length > 4 ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="mt-2 h-7 px-1 text-xs"
						onClick={() => setShowAll((value) => !value)}
					>
						{showAll ? "Show less" : "Show more"}
					</Button>
				) : null}
			</div>
			<div className="min-w-0">
				{showSwitcher && editions.length > 1 ? (
					<div className="mb-4 flex flex-wrap gap-2">
						{editions.map((edition) => {
							const match = (family ?? []).find(
								(row) => row.edition === edition,
							);
							if (!match) {
								return null;
							}
							return (
								<Button
									key={edition}
									type="button"
									variant={
										selected.productId === match.productId
											? "default"
											: "outline"
									}
									size="sm"
									onClick={() => onSelectProduct(match.productId)}
								>
									{editionLabel(edition)}
								</Button>
							);
						})}
					</div>
				) : null}
				{selected.authorName ? (
					<p className="text-muted-foreground text-sm">{selected.authorName}</p>
				) : null}
				<p className="font-[family-name:var(--font-display)] text-xl leading-snug">
					{selected.name}
				</p>
				<p className="mt-2 text-sm">
					{formatPriceDate(selected.price, selected.catalogLaunchTime)}
				</p>
				{coming ? (
					<p className="mt-1 text-muted-foreground text-sm">Coming</p>
				) : null}
				<div className="mt-4 flex gap-2">
					<button
						type="button"
						aria-label="Owned"
						aria-pressed={owned}
						onClick={() => onSetOwnership(selected.productId, owned ? null : "owned")}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-full border",
							owned
								? "border-teal-800 bg-teal-800 text-teal-50"
								: "border-stone-400/50 text-stone-500",
						)}
					>
						<Check className="h-4 w-4" />
					</button>
					<button
						type="button"
						aria-label="Want"
						aria-pressed={want}
						onClick={() => onSetOwnership(selected.productId, want ? null : "want")}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-full border",
							want
								? "border-teal-800 text-teal-800"
								: "border-stone-400/50 text-stone-500",
						)}
					>
						<Bookmark className="h-4 w-4" />
					</button>
				</div>
				<div className="mt-6 flex items-center gap-4">
					<a
						href={folioHref(selected.url)}
						target="_blank"
						rel="noreferrer"
						className="text-sm text-teal-800 underline-offset-4 hover:underline"
					>
						Folio
					</a>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClose}
						className="h-7 px-1 text-xs"
					>
						Close
					</Button>
				</div>
			</div>
		</div>
	);
}

export function FolioBookCardSkeleton(): ReactNode {
	return (
		<div>
			<Skeleton className="mb-3 aspect-[3/4] w-[70%] rounded-none" />
			<Skeleton className="mb-1 h-3 w-24" />
			<Skeleton className="mb-1 h-4 w-36" />
			<Skeleton className="h-3 w-28" />
		</div>
	);
}

function CoverChip({ children }: { children: ReactNode }): ReactNode {
	return (
		<Badge
			variant="outline"
			className="rounded-sm border-stone-400/50 bg-background/85 px-1.5 py-0 font-normal text-[0.6rem] uppercase tracking-wide"
		>
			{children}
		</Badge>
	);
}

export function formatPriceDate(
	price: number | null,
	catalogLaunchTime: number,
): string {
	const parts: string[] = [];
	if (price !== null) {
		parts.push(formatUsd(price));
	}
	if (catalogLaunchTime > 0) {
		parts.push(formatCatalogDay(catalogLaunchTime));
	}
	return parts.join(" · ");
}

function formatUsd(price: number): string {
	if (Number.isInteger(price)) {
		return `$${price}`;
	}
	return `$${price.toFixed(2)}`;
}

function formatCatalogDay(ms: number): string {
	return new Date(ms).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function isComing(
	isComingSoon: boolean,
	catalogLaunchTime: number,
	now: number,
): boolean {
	return isComingSoon || catalogLaunchTime > now;
}

function folioHref(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}
	return `https://www.foliosociety.com/usa${url.startsWith("/") ? url : `/${url}`}`;
}

function familyMemberFromCard(card: FolioCatalogCard): FolioFamilyEdition {
	return {
		productId: card.productId,
		name: card.name,
		edition: card.edition,
		price: card.price,
		catalogLaunchTime: card.catalogLaunchTime,
		url: card.url,
		heroImageUrl: card.heroImageUrl,
		isComingSoon: card.isComingSoon,
		authorName: card.authorName,
		owned: card.owned,
		want: card.want,
	};
}

function editionsPresent(
	rows: FolioFamilyEdition[],
): Array<"standard" | "limited" | "signed"> {
	const set = new Set<"standard" | "limited" | "signed">();
	for (const row of rows) {
		if (
			row.edition === "standard" ||
			row.edition === "limited" ||
			row.edition === "signed"
		) {
			set.add(row.edition);
		}
	}
	const order: Array<"standard" | "limited" | "signed"> = [
		"standard",
		"limited",
		"signed",
	];
	return order.filter((edition) => set.has(edition));
}

function editionLabel(edition: "standard" | "limited" | "signed"): string {
	if (edition === "limited") {
		return "Limited";
	}
	if (edition === "signed") {
		return "Signed";
	}
	return "Standard";
}

function sortImages(images: FolioProductImage[]): FolioProductImage[] {
	return [...images].sort((a, b) => {
		if (a.imageType === "hero" && b.imageType !== "hero") {
			return -1;
		}
		if (b.imageType === "hero" && a.imageType !== "hero") {
			return 1;
		}
		return (a.position ?? 0) - (b.position ?? 0);
	});
}


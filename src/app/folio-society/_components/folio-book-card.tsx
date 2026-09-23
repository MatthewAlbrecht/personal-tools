"use client";

import { BookOpen, Check, ExternalLink, X } from "lucide-react";
import { type ReactNode, useState } from "react";
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
	const initial = card.name.trim().charAt(0).toUpperCase() || "F";

	return (
		<article className="group relative h-full">
			<button
				type="button"
				onClick={onToggleExpand}
				aria-expanded={expanded}
				aria-label={`${expanded ? "Close" : "View"} details for ${card.name}`}
				className="h-full w-full cursor-pointer rounded-sm text-left outline-none transition focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-4"
			>
				<div
					className={cn(
						"group-hover:-translate-y-0.5 relative aspect-[4/5] w-full overflow-hidden border bg-[#eeeee9] transition-all duration-300 group-hover:border-stone-400 group-hover:shadow-[0_14px_30px_-20px_rgba(28,25,23,0.55)]",
						expanded ? "border-teal-800/60 shadow-sm" : "border-stone-300/80",
					)}
				>
					{card.heroImageUrl ? (
						<img
							src={card.heroImageUrl}
							alt={`Cover of ${card.name}`}
							className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.025]"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center bg-stone-200/70">
							<span className="font-[family-name:var(--font-display)] text-4xl text-stone-500">
								{initial}
							</span>
						</div>
					)}
					<div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
						{card.edition === "limited" ? (
							<CoverChip>Limited edition</CoverChip>
						) : null}
						{card.edition === "signed" ? <CoverChip>Signed</CoverChip> : null}
						{coming ? <CoverChip>Coming</CoverChip> : null}
					</div>
				</div>
				<div className="pt-3 pr-9">
					{card.authorName ? (
						<p className="mb-1 truncate text-[0.67rem] text-muted-foreground uppercase tracking-[0.13em]">
							{card.authorName}
						</p>
					) : null}
					<h3 className="line-clamp-2 font-[family-name:var(--font-display)] text-[1.05rem] leading-[1.2]">
						{card.name}
					</h3>
					<p className="mt-1.5 text-muted-foreground text-xs tabular-nums">
						{formatPriceDate(card.price, card.catalogLaunchTime)}
					</p>
				</div>
			</button>
			<div className="absolute top-2 right-2 flex flex-col gap-1.5">
				<button
					type="button"
					aria-label="Owned"
					aria-pressed={card.owned}
					onClick={(event) => {
						event.stopPropagation();
						onSetOwnership(card.owned ? null : "owned");
					}}
					className={cn(
						"flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition hover:scale-105 hover:border-teal-800 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700",
						card.owned
							? "border-teal-800 bg-teal-800 text-teal-50"
							: "border-stone-300 bg-background/90 text-stone-600",
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
						"flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition hover:scale-105 hover:border-teal-800 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700",
						card.want
							? "border-teal-800 bg-teal-50 text-teal-800"
							: "border-stone-300 bg-background/90 text-stone-600",
					)}
				>
					<BookOpen className="h-3.5 w-3.5" />
				</button>
			</div>
		</article>
	);
}

export function FolioBookDetail({
	card,
	now,
	images,
	onClose,
	onSetOwnership,
	owned,
	want,
}: {
	card: FolioCatalogCard;
	now: number;
	images: FolioProductImage[] | undefined;
	onClose: () => void;
	onSetOwnership: (productId: number, status: "owned" | "want" | null) => void;
	owned: boolean;
	want: boolean;
}): ReactNode {
	const coming = isComing(card.isComingSoon, card.catalogLaunchTime, now);
	const thumbs = sortImages(images ?? []);
	const [showAll, setShowAll] = useState(false);
	const [coverUrl, setCoverUrl] = useState<string | null>(null);
	const visibleThumbs = showAll ? thumbs : thumbs.slice(0, 4);
	const cover = coverUrl ?? card.heroImageUrl ?? thumbs[0]?.blobUrl ?? null;
	const initial = card.name.trim().charAt(0).toUpperCase() || "F";

	return (
		<div className="my-3 grid gap-7 border-stone-300 border-y bg-stone-50/70 px-4 py-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:px-6 md:py-8">
			<div>
				<div className="mb-3 aspect-[4/5] w-full overflow-hidden border border-stone-300 bg-[#e9e9e4] shadow-sm">
					{cover ? (
						<img
							src={cover}
							alt={`Cover of ${card.name}`}
							className="h-full w-full object-contain p-4"
						/>
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
								aria-label={`View image ${visibleThumbs.indexOf(image) + 1} of ${card.name}`}
								onClick={() => setCoverUrl(image.blobUrl)}
								className={cn(
									"h-14 w-11 cursor-pointer overflow-hidden border bg-white transition hover:border-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700",
									cover === image.blobUrl
										? "border-stone-600"
										: "border-stone-400/40",
								)}
							>
								<img
									src={image.blobUrl}
									alt=""
									className="h-full w-full object-contain"
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
						className="mt-2 h-7 cursor-pointer px-1 text-xs focus-visible:ring-2 focus-visible:ring-teal-700"
						onClick={() => setShowAll((value) => !value)}
					>
						{showAll ? "Show less" : "Show more"}
					</Button>
				) : null}
			</div>
			<div className="relative min-w-0 pt-1">
				<button
					type="button"
					aria-label={`Close details for ${card.name}`}
					onClick={onClose}
					className="absolute top-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-200 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
				>
					<X className="h-4 w-4" />
				</button>
				<p className="mb-5 text-[0.65rem] text-teal-900 uppercase tracking-[0.18em]">
					{editionLabel(card.edition)}
				</p>
				{card.authorName ? (
					<p className="text-muted-foreground text-sm">{card.authorName}</p>
				) : null}
				<h3 className="mt-1 max-w-2xl font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight">
					{card.name}
				</h3>
				<p className="mt-3 text-sm tabular-nums">
					{formatPriceDate(card.price, card.catalogLaunchTime)}
				</p>
				{coming ? (
					<p className="mt-1 text-muted-foreground text-sm">Coming</p>
				) : null}
				<div className="mt-7 flex items-center gap-2">
					<button
						type="button"
						aria-label="Owned"
						aria-pressed={owned}
						onClick={() =>
							onSetOwnership(card.productId, owned ? null : "owned")
						}
						className={cn(
							"flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition hover:border-teal-800 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700",
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
						onClick={() => onSetOwnership(card.productId, want ? null : "want")}
						className={cn(
							"flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition hover:border-teal-800 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700",
							want
								? "border-teal-800 text-teal-800"
								: "border-stone-400/50 text-stone-500",
						)}
					>
						<BookOpen className="h-4 w-4" />
					</button>
				</div>
				<div className="mt-8 border-stone-300 border-t pt-5">
					<a
						href={folioHref(card.url)}
						target="_blank"
						rel="noreferrer"
						aria-label={`View ${card.name} on Folio Society`}
						className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-teal-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
					>
						View on Folio
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
				</div>
			</div>
		</div>
	);
}

export function FolioBookCardSkeleton(): ReactNode {
	return (
		<div>
			<Skeleton className="mb-3 aspect-[4/5] w-full rounded-none" />
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

function editionLabel(
	edition: "standard" | "limited" | "signed" | "bundle",
): string {
	if (edition === "limited") {
		return "Limited";
	}
	if (edition === "signed") {
		return "Signed edition";
	}
	if (edition === "bundle") {
		return "Collection";
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

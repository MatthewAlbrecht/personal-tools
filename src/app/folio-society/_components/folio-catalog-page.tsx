"use client";

import { useMutation, useQuery } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { badgeVariants } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { useDebouncedState } from "~/lib/hooks/use-debounced-state";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import {
	type FolioFilters,
	parseFolioFilters,
	serializeFolioFilters,
} from "../_utils/filter-state";
import type { FolioCatalogCard } from "./folio-book-card";
import { FolioFilters as FolioFiltersControls } from "./folio-filters";
import {
	FolioSeasonSection,
	FolioSeasonSectionSkeleton,
} from "./folio-season-section";
import { FolioSettingsSheet } from "./folio-settings-sheet";

type CatalogSeason = {
	seasonKey: string;
	seasonSortKey: string;
	label: string;
	cards: FolioCatalogCard[];
};

type CatalogPage = {
	seasons: CatalogSeason[];
	continueCursor: { beforeSeasonSortKey: string } | null;
	isDone: boolean;
	loadedCount: number;
	totalCount: number;
	pageKey: string;
};

type OwnershipMarks = {
	owned: boolean;
	want: boolean;
};

export function FolioCatalogPage(): ReactNode {
	const router = useRouter();
	const pathname = usePathname() ?? "/folio-society";
	const searchParams = useSearchParams();
	const searchParamsString = searchParams?.toString() ?? "";
	const filters = useMemo(
		() => parseFolioFilters(new URLSearchParams(searchParamsString)),
		[searchParamsString],
	);
	const [searchInput, debouncedSearch, setSearchInput] = useDebouncedState(
		filters.search ?? "",
		300,
	);
	const queryFilters = useMemo(
		() => ({
			...filters,
			search: debouncedSearch.trim() || undefined,
		}),
		[debouncedSearch, filters],
	);
	const filterKey = catalogFilterKey(queryFilters);

	const [now, setNow] = useState(() => Date.now());
	const [cursor, setCursor] = useState<{
		beforeSeasonSortKey: string;
	} | null>(null);
	const [seasons, setSeasons] = useState<CatalogSeason[]>([]);
	const appliedCursorRef = useRef<string>("");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [optimisticMarks, setOptimisticMarks] = useState<
		Record<number, OwnershipMarks>
	>({});
	const setOwnership = useMutation(api.folioSocietyCatalog.setOwnership);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setSearchInput(filters.search ?? "");
	}, [filters.search, setSearchInput]);

	useEffect(() => {
		const next = {
			...filters,
			search: debouncedSearch.trim() || undefined,
		};
		const serialized = serializeFolioFilters(next).toString();
		if (serialized === searchParamsString) {
			return;
		}
		router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
			scroll: false,
		});
	}, [debouncedSearch, filters, pathname, router, searchParamsString]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset catalog pagination when filter key changes
	useEffect(() => {
		setNow(Date.now());
		setCursor(null);
		setSeasons([]);
		appliedCursorRef.current = "";
	}, [filterKey]);

	const page = useQuery(api.folioSocietyCatalog.listCatalogPage, {
		now,
		cursor,
		pageSizeSeasons: 1,
		search: queryFilters.search,
		owned: queryFilters.owned || undefined,
		want: queryFilters.want || undefined,
		le: queryFilters.le || undefined,
		signed: queryFilters.signed || undefined,
		thisYear: queryFilters.thisYear || undefined,
		coming: queryFilters.coming || undefined,
		bundles: queryFilters.bundles || undefined,
	}) as CatalogPage | undefined;

	useEffect(() => {
		if (!page) {
			return;
		}
		const expectedKey = cursor?.beforeSeasonSortKey ?? "first";
		if (page.pageKey !== expectedKey) {
			return;
		}
		if (appliedCursorRef.current === expectedKey) {
			return;
		}
		appliedCursorRef.current = expectedKey;
		setSeasons((prev) =>
			cursor === null ? page.seasons : [...prev, ...page.seasons],
		);
	}, [cursor, page]);

	const isDone = page?.isDone === true;
	const continueCursor = page?.continueCursor ?? null;
	const firstPageLoading = cursor === null && page === undefined;
	const totalCount = page?.totalCount ?? 0;
	const loadedBookCount = seasons.reduce(
		(count, season) => count + season.cards.length,
		0,
	);
	const hasActiveFilters = folioFiltersActive(queryFilters);

	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || isDone || !continueCursor || page === undefined) {
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (!entries[0]?.isIntersecting) {
				return;
			}
			setCursor(continueCursor);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [continueCursor, isDone, page]);

	function handleFiltersChange(next: FolioFilters): void {
		setSearchInput(next.search ?? "");
		const flagsChanged =
			next.owned !== filters.owned ||
			next.want !== filters.want ||
			next.le !== filters.le ||
			next.signed !== filters.signed ||
			next.thisYear !== filters.thisYear ||
			next.coming !== filters.coming ||
			next.bundles !== filters.bundles;
		if (!flagsChanged) {
			return;
		}
		const serialized = serializeFolioFilters({
			...next,
			search: (next.search ?? "").trim() || undefined,
		}).toString();
		router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
			scroll: false,
		});
	}

	function marksFor(
		productId: number,
		fallback: FolioCatalogCard,
	): OwnershipMarks {
		const optimistic = optimisticMarks[productId];
		if (optimistic) {
			return optimistic;
		}
		return {
			owned: fallback.owned,
			want: fallback.want,
		};
	}

	async function handleSetOwnership(
		productId: number,
		status: "owned" | "want" | null,
	): Promise<void> {
		const previous = optimisticMarks[productId];
		const card = seasons
			.flatMap((season) => season.cards)
			.find((row) => row.productId === productId);
		const prior: OwnershipMarks =
			previous ??
			marksFor(
				productId,
				card ?? {
					titleKey: "",
					productId: -1,
					name: "",
					authorName: null,
					url: "",
					price: null,
					catalogLaunchTime: 0,
					edition: "standard",
					isComingSoon: false,
					heroImageUrl: null,
					familyHasLimited: false,
					familyHasSigned: false,
					owned: false,
					want: false,
				},
			);
		const next: OwnershipMarks =
			status === "owned"
				? { owned: true, want: false }
				: status === "want"
					? { owned: false, want: true }
					: { owned: false, want: false };
		setOptimisticMarks((current) => ({ ...current, [productId]: next }));
		try {
			await setOwnership({ productId, status });
		} catch {
			setOptimisticMarks((current) => ({ ...current, [productId]: prior }));
			toast.error("Couldn’t save.");
		}
	}

	const filterControls = (
		<FolioFiltersControls
			filters={{
				...filters,
				search: searchInput || undefined,
			}}
			onChange={handleFiltersChange}
		/>
	);

	return (
		<div className="w-full p-6 pt-4">
			<div className="mx-auto max-w-6xl xl:flex xl:items-stretch xl:gap-8">
				<main className="min-w-0 flex-1">
					<div className="mb-8 flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
								Folio Society
							</h1>
							<span className="text-muted-foreground text-sm">
								{totalCount} books
							</span>
						</div>
						<div className="flex items-center gap-2">
							<div className="xl:hidden">
								<Button
									type="button"
									variant="outline"
									size="sm"
									aria-expanded={filtersOpen}
									aria-controls="folio-filters-sheet"
									onClick={() => setFiltersOpen(true)}
								>
									<SlidersHorizontal className="h-4 w-4" />
									Filters
									{hasActiveFilters ? (
										<span
											className={cn(
												badgeVariants(),
												"ml-1 px-1.5 text-[0.65rem]",
											)}
										>
											On
										</span>
									) : null}
								</Button>
							</div>
							<FolioSettingsSheet />
						</div>
					</div>

					{firstPageLoading ? (
						<FolioSeasonSectionSkeleton />
					) : loadedBookCount === 0 ? (
						<p className="text-muted-foreground text-sm">
							{emptyCopy(queryFilters)}
						</p>
					) : (
						<>
							{seasons.map((season) => (
								<FolioSeasonSection
									key={season.seasonKey}
									label={season.label}
									cards={season.cards}
									now={now}
									onSetOwnership={handleSetOwnership}
									marksFor={marksFor}
								/>
							))}
							{!isDone ? <div ref={sentinelRef} className="h-8" /> : null}
						</>
					)}
				</main>

				<aside className="hidden w-48 shrink-0 xl:block">
					<div className="border-border/40 border-l py-0.5 pl-5 xl:sticky xl:top-16">
						<p className="mb-4 font-semibold text-[0.65rem] text-foreground/70 uppercase tracking-[0.16em]">
							Filters
						</p>
						{filterControls}
					</div>
				</aside>
			</div>

			<Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
				<SheetContent
					id="folio-filters-sheet"
					side="right"
					className="w-[17rem] gap-0"
				>
					<SheetHeader>
						<SheetTitle className="font-[family-name:var(--font-display)] text-lg">
							Filters
						</SheetTitle>
					</SheetHeader>
					<div className="flex flex-col gap-4 px-4 pb-6">{filterControls}</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}

function catalogFilterKey(filters: FolioFilters): string {
	return [
		filters.search ?? "",
		filters.owned,
		filters.want,
		filters.le,
		filters.signed,
		filters.thisYear,
		filters.coming,
		filters.bundles,
	].join("|");
}

function folioFiltersActive(filters: FolioFilters): boolean {
	return Boolean(
		filters.search?.trim() ||
			filters.owned ||
			filters.want ||
			filters.le ||
			filters.signed ||
			filters.thisYear ||
			filters.coming ||
			filters.bundles,
	);
}

function emptyCopy(filters: FolioFilters): string {
	if (filters.owned && filters.want) {
		return "Nothing on your shelf.";
	}
	if (filters.owned) {
		return "Nothing owned yet.";
	}
	if (filters.want) {
		return "Nothing wanted yet.";
	}
	if (filters.coming) {
		return "Nothing coming.";
	}
	if (filters.thisYear) {
		return "Nothing this year.";
	}
	if (filters.le && !filters.signed) {
		return "No limited editions.";
	}
	if (filters.signed && !filters.le) {
		return "No signed editions.";
	}
	if (filters.bundles && !folioFiltersActive({ ...filters, bundles: false })) {
		return "No collections.";
	}
	if (folioFiltersActive(filters)) {
		return "No books match.";
	}
	return "Nothing here yet.";
}

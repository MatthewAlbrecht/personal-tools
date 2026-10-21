"use client";

import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ExternalLink,
	ListFilter,
	Tag,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import { cn } from "~/lib/utils";
import {
	type ListingFilters,
	type ListingsView,
	activeFilterCount,
	listingFiltersFromParams,
	withListingFilters,
} from "~/lib/yugioh/listing-filters";
import {
	MARKETPLACE_LABELS,
	formatMoney,
	listingSeller,
	listingTypeLabel,
} from "~/lib/yugioh/listing-format";
import {
	type ListingSort,
	type SortKey,
	defaultListingSort,
	listingSortFromParams,
	sortPhrase,
	toggledSort,
	withListingSort,
} from "~/lib/yugioh/listing-sort";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ListingView } from "../_utils/types";
import { DealGradeSummary } from "./deal-grade";
import { ListingDrawer } from "./listing-drawer";
import { ListingsToolbar } from "./listing-filters";
import { MatchSummary, TitleFlagBadges } from "./listing-match";
import { ListingSortSelect } from "./listing-sort-select";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The Deck's Listings in one view, Available (the default) or Sold: matched,
 * unsure and not-a-match alike. The view, filters and sort live in the URL;
 * filters only narrow the view. Column headers sort; tapping a Listing opens
 * the Listing drawer (`?listing=`).
 */
export function ListingsPage({
	deckId,
}: {
	deckId: Id<"yugiohDecks">;
}): React.ReactElement {
	const now = useMinuteClock();
	const router = useRouter();
	const pathname = usePathname() ?? `/yugioh/decks/${deckId}/listings`;
	const searchParams = useSearchParams() ?? new URLSearchParams();
	const filters = listingFiltersFromParams(searchParams);
	const view: ListingsView = filters.view ?? "available";
	const sort = listingSortFromParams(searchParams, view);
	const page = useHeldWhileLoading(
		useQuery(api.yugioh.listings.listListings, {
			deckId,
			now,
			filters,
			sort,
		}),
		deckId,
	);

	function replaceParams(params: URLSearchParams): void {
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}

	function setFilters(next: ListingFilters): void {
		const nextView = next.view ?? "available";
		// Switching views keeps a sort I picked, but the default follows the view.
		const fallback = defaultListingSort(view);
		const isDefault =
			sort.key === fallback.key && sort.direction === fallback.direction;
		const nextSort =
			nextView !== view && isDefault ? defaultListingSort(nextView) : sort;
		replaceParams(
			withListingSort(
				withListingFilters(new URLSearchParams(searchParams.toString()), next),
				nextSort,
				nextView,
			),
		);
	}

	function setSort(next: ListingSort): void {
		replaceParams(
			withListingSort(new URLSearchParams(searchParams.toString()), next, view),
		);
	}

	function sortBy(key: SortKey): void {
		setSort(toggledSort(sort, key, view));
	}

	const toolbar = (
		<ListingsToolbar
			deckId={deckId}
			filters={filters}
			newCount={page?.newCount ?? null}
			matching={page?.matching ?? null}
			locations={page?.locations ?? []}
			onChange={setFilters}
		/>
	);

	if (page === undefined) {
		return (
			<section aria-label="Listings" className="flex flex-col gap-3">
				{toolbar}
				<ListingsPageSkeleton />
			</section>
		);
	}

	if (page.total === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Tag />
					</EmptyMedia>
					<EmptyTitle>No Listings yet</EmptyTitle>
					<EmptyDescription>
						They appear after the next capture. Open a Search on the Searches
						tab to capture now.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button variant="outline" asChild>
						<Link href={`/yugioh/decks/${deckId}/searches`}>
							Go to Searches
						</Link>
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	const listings = page.listings;
	const openListingId = searchParams.get("listing");
	const openListing =
		listings.find((listing) => listing._id === openListingId) ?? null;

	function listingHref(listingId: string): string {
		const params = new URLSearchParams(searchParams.toString());
		params.set("listing", listingId);
		return `${pathname}?${params.toString()}`;
	}

	function closeListing(): void {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("listing");
		replaceParams(params);
	}

	return (
		<section aria-label="Listings" className="flex flex-col gap-3">
			{toolbar}
			{page.matching === 0 ? (
				<NothingShown
					view={view}
					filters={filters}
					onClear={() => setFilters({ view: filters.view })}
				/>
			) : (
				<>
					<div className="flex items-center justify-between gap-3">
						<p
							className="text-muted-foreground text-sm tabular-nums"
							aria-live="polite"
						>
							{countLine(listings.length, page.matching, sort, view)}
						</p>
						<ListingSortSelect
							key={`${sort.key}-${sort.direction}-${view}`}
							sort={sort}
							view={view}
							onChange={setSort}
							className="md:hidden"
						/>
					</div>
					<ul className="-mx-4 flex flex-col divide-y border-y md:hidden">
						{listings.map((listing) => (
							<li key={listing._id}>
								<ListingRow
									listing={listing}
									href={listingHref(listing._id)}
									now={now}
								/>
							</li>
						))}
					</ul>
					<div className="hidden md:block">
						<ListingsTable
							listings={listings}
							href={listingHref}
							now={now}
							view={view}
							sort={sort}
							onSort={sortBy}
						/>
					</div>
				</>
			)}
			<ListingDrawer
				deckId={deckId}
				listing={openListing}
				now={now}
				onClose={closeListing}
			/>
		</section>
	);
}

/**
 * Nothing in the view: "Nothing matches these filters." with a way out, or,
 * with no filters set, that the view itself is empty.
 */
function NothingShown({
	view,
	filters,
	onClear,
}: {
	view: ListingsView;
	filters: ListingFilters;
	onClear: () => void;
}): React.ReactElement {
	const filtered = filters.new || activeFilterCount(filters) > 0;
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ListFilter />
				</EmptyMedia>
				<EmptyTitle>
					{filtered
						? "Nothing matches these filters."
						: view === "sold"
							? "No sales yet."
							: "Nothing for sale right now."}
				</EmptyTitle>
			</EmptyHeader>
			{filtered && (
				<EmptyContent>
					<Button variant="outline" onClick={onClear}>
						Clear filters
					</Button>
				</EmptyContent>
			)}
		</Empty>
	);
}

/**
 * "17 Listings, newest first"; past the cap, "The first 200 of 812 Listings,
 * cheapest first".
 */
function countLine(
	shown: number,
	matching: number,
	sort: ListingSort,
	view: ListingsView,
): string {
	const noun = matching === 1 ? "Listing" : "Listings";
	const order = sortPhrase(sort, view);
	return shown < matching
		? `The first ${shown} of ${matching} ${noun}, ${order}`
		: `${matching} ${noun}, ${order}`;
}

function ListingRow({
	listing,
	href,
	now,
}: {
	listing: ListingView;
	href: string;
	now: number;
}): React.ReactElement {
	const notMatch = listing.match.status === "notMatch";
	return (
		<Link
			href={href}
			replace
			scroll={false}
			className={cn(
				"flex min-h-14 flex-col gap-1 px-4 py-3 outline-none focus-visible:bg-muted active:bg-muted",
				notMatch && "opacity-60",
			)}
		>
			<span className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2">
					{listing.isNew && <NewMark />}
					<PerCopy listing={listing} />
					<DealGradeSummary deal={listing.deal} />
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{MARKETPLACE_LABELS[listing.marketplace]} ·{" "}
					{listingTypeLabel(listing, now)}
				</span>
			</span>
			<div className="flex items-center justify-between gap-3 text-sm">
				<MatchSummary match={listing.match} className="max-w-[70%] shrink-0" />
				<span className="min-w-0 truncate text-right text-muted-foreground text-xs">
					{whereAndWhen(listing)}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
					{listing.title}
				</span>
				<TitleFlagBadges
					titleRead={listing.titleRead}
					belowCondition={listing.deal.belowCondition}
				/>
			</div>
		</Link>
	);
}

export function ListingsTable({
	listings,
	href,
	now,
	view,
	sort,
	onSort,
}: {
	listings: ListingView[];
	href: (listingId: string) => string;
	now: number;
	view: ListingsView;
	sort: ListingSort;
	onSort: (key: SortKey) => void;
}): React.ReactElement {
	const head = { sort, onSort };
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<SortableHead {...head} column="price" align="end">
						Per-copy
					</SortableHead>
					<SortableHead {...head} column="grade">
						Grade
					</SortableHead>
					<SortableHead {...head} column="card">
						Card / Printing
					</SortableHead>
					<TableHead className="w-full">Title</TableHead>
					<SortableHead {...head} column="date">
						{view === "sold" ? "Sold" : "Type / Ends"}
					</SortableHead>
					<SortableHead {...head} column="seller">
						Seller
					</SortableHead>
					<SortableHead {...head} column="seen">
						Seen
					</SortableHead>
					<TableHead>
						<span className="sr-only">Open on the marketplace</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{listings.map((listing) => (
					<TableRow
						key={listing._id}
						className={cn(
							"relative",
							listing.match.status === "notMatch" && "opacity-60",
						)}
					>
						<TableCell className="text-right align-top">
							<span className="inline-flex items-center gap-2">
								{listing.isNew && <NewMark />}
								<PerCopy listing={listing} />
							</span>
						</TableCell>
						<TableCell className="align-top">
							<DealGradeSummary deal={listing.deal} stacked />
						</TableCell>
						<TableCell className="align-top">
							{/* The whole row opens the Listing drawer through this link.
							    A set width: a table cell grows to fit its text otherwise. */}
							<Link
								href={href(listing._id)}
								replace
								scroll={false}
								className="flex w-52 outline-none after:absolute after:inset-0 focus-visible:underline lg:w-60"
							>
								<MatchSummary match={listing.match} stacked />
							</Link>
						</TableCell>
						<TableCell className="max-w-0 align-top">
							{/* Flags sit under the title, so a narrow column can't push them into Type. */}
							<div className="flex flex-col items-start gap-1">
								<p className="w-full truncate" title={listing.title}>
									{listing.title}
								</p>
								<TitleFlagBadges
									titleRead={listing.titleRead}
									belowCondition={listing.deal.belowCondition}
								/>
							</div>
						</TableCell>
						<TableCell className="align-top tabular-nums">
							<div className="flex flex-col">
								<span>{listingTypeLabel(listing, now)}</span>
								<span className="text-muted-foreground text-xs">
									{MARKETPLACE_LABELS[listing.marketplace]}
								</span>
							</div>
						</TableCell>
						<TableCell className="max-w-40 align-top text-muted-foreground">
							<p
								className="truncate"
								title={listingSeller(listing) ?? undefined}
							>
								{listingSeller(listing)}
							</p>
						</TableCell>
						<TableCell className="align-top text-muted-foreground">
							{freshness(listing)}
						</TableCell>
						<TableCell className="relative z-10 align-top">
							<Button variant="ghost" size="icon" asChild>
								<a
									href={listing.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Open on ${MARKETPLACE_LABELS[listing.marketplace]}: ${listing.title} (opens in a new tab)`}
								>
									<ExternalLink />
								</a>
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/**
 * A column header that sorts: picking it sorts by that column, picking it
 * again flips the order. The sorted column shows an arrow and `aria-sort`.
 */
function SortableHead({
	column,
	sort,
	onSort,
	align = "start",
	children,
}: {
	column: SortKey;
	sort: ListingSort;
	onSort: (key: SortKey) => void;
	align?: "start" | "end";
	children: React.ReactNode;
}): React.ReactElement {
	const active = sort.key === column;
	const Arrow = !active
		? ArrowUpDown
		: sort.direction === "asc"
			? ArrowUp
			: ArrowDown;
	return (
		<TableHead
			aria-sort={
				active
					? sort.direction === "asc"
						? "ascending"
						: "descending"
					: "none"
			}
			className={cn(align === "end" && "text-right")}
		>
			<Button
				variant="ghost"
				size="sm"
				className={cn(
					"-mx-2 h-8 gap-1 px-2 font-medium",
					align === "end" && "flex-row-reverse",
					!active && "text-foreground",
				)}
				onClick={() => onSort(column)}
			>
				{children}
				<Arrow
					aria-hidden
					className={cn(!active && "text-muted-foreground/50")}
				/>
			</Button>
		</TableHead>
	);
}

/** First seen since my last visit: a dot, read out as "New". */
function NewMark(): React.ReactElement {
	return (
		<>
			<span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
			<span className="sr-only">New</span>
		</>
	);
}

/**
 * The Per-copy price: "$42.15 /copy". Without one, why not: "No price", or
 * "No rate yet" for a currency without an exchange rate (the drawer shows
 * the original amount).
 */
function PerCopy({ listing }: { listing: ListingView }): React.ReactElement {
	if (listing.perCopyPrice !== null) {
		return (
			<span className="whitespace-nowrap tabular-nums">
				<span className="font-medium text-[0.9375rem]">
					{formatMoney(listing.perCopyPrice.perCopy, "USD")}
				</span>
				<span className="text-muted-foreground text-xs"> /copy</span>
			</span>
		);
	}
	if (listing.price === null) {
		return (
			<span className="font-medium text-[0.9375rem] text-muted-foreground">
				No price
			</span>
		);
	}
	return (
		<span className="whitespace-nowrap">
			<span className="font-medium text-[0.9375rem] text-muted-foreground">
				No rate yet
			</span>
			<span className="text-muted-foreground text-xs"> {listing.currency}</span>
		</span>
	);
}

/**
 * "United Kingdom · listed 3h ago" (eBay) or "Card Castle · 3 Copies ·
 * seen 2h ago" (TCGplayer), leaving out a seller the page didn't show.
 */
function whereAndWhen(listing: ListingView): string {
	return [listingSeller(listing), freshness(listing)]
		.filter((part) => part !== null)
		.join(" · ");
}

/** "listed 3h ago" when eBay showed the date listed, else when first captured. */
function freshness(listing: ListingView): string {
	return listing.listedAt === null
		? `seen ${formatDistanceToNowStrict(listing.firstSeenAt, { addSuffix: true })}`
		: `listed ${formatDistanceToNowStrict(listing.listedAt, { addSuffix: true })}`;
}

export function ListingsPageSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-5 w-40" />
			<div className="flex flex-col divide-y border-y">
				{SKELETON_ROWS.map((row) => (
					<div key={row} className="flex min-h-14 flex-col gap-2 py-3">
						<div className="flex justify-between gap-3">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-4 w-28" />
						</div>
						<Skeleton className="h-3 w-full max-w-lg" />
					</div>
				))}
			</div>
		</div>
	);
}

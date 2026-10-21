"use client";

import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, ListFilter, Tag } from "lucide-react";
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
	listingFiltersFromParams,
	withListingFilters,
} from "~/lib/yugioh/listing-filters";
import {
	MARKETPLACE_LABELS,
	formatMoney,
	listingSeller,
	listingTypeLabel,
} from "~/lib/yugioh/listing-format";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ListingView } from "../_utils/types";
import { DealGradeSummary } from "./deal-grade";
import { ListingDrawer } from "./listing-drawer";
import { ListingsToolbar } from "./listing-filters";
import { MatchSummary, TitleFlagBadges } from "./listing-match";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The Deck's Listings, newest first: matched, unsure and not-a-match alike.
 * Filters live in the URL and only narrow; with none set, nothing is hidden.
 * Tapping a Listing opens the Listing drawer (`?listing=`).
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
	const page = useHeldWhileLoading(
		useQuery(api.yugioh.listings.listListings, { deckId, now, filters }),
		deckId,
	);

	function replaceParams(params: URLSearchParams): void {
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}

	function setFilters(next: ListingFilters): void {
		replaceParams(
			withListingFilters(new URLSearchParams(searchParams.toString()), next),
		);
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

	const filtered = Object.keys(filters).length > 0;
	if (page.matching === 0 && !filtered) {
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
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ListFilter />
						</EmptyMedia>
						<EmptyTitle>Nothing matches these filters.</EmptyTitle>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="outline" onClick={() => setFilters({})}>
							Clear filters
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<>
					<p
						className="text-muted-foreground text-sm tabular-nums"
						aria-live="polite"
					>
						{countLine(listings.length, page.matching, filters)}
					</p>
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
						<ListingsTable listings={listings} href={listingHref} now={now} />
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
 * "17 Listings, newest first"; "The newest 200 of 812 Listings" past the cap;
 * "3 running auctions, ending soonest first" for Ending soon.
 */
function countLine(
	shown: number,
	matching: number,
	filters: ListingFilters,
): string {
	if (filters.ending) {
		const noun = matching === 1 ? "running auction" : "running auctions";
		return shown < matching
			? `The first ${shown} of ${matching} ${noun}, ending soonest first`
			: `${matching} ${noun}, ending soonest first`;
	}
	const noun = matching === 1 ? "Listing" : "Listings";
	return shown < matching
		? `The newest ${shown} of ${matching} ${noun}`
		: `${matching} ${noun}, newest first`;
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

function ListingsTable({
	listings,
	href,
	now,
}: {
	listings: ListingView[];
	href: (listingId: string) => string;
	now: number;
}): React.ReactElement {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="text-right">Per-copy</TableHead>
					<TableHead>Grade</TableHead>
					<TableHead>Card / Printing</TableHead>
					<TableHead className="w-full">Title</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Seller</TableHead>
					<TableHead>Seen</TableHead>
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
						<TableCell className="max-w-72 align-top">
							{/* The whole row opens the Listing drawer through this link. */}
							<Link
								href={href(listing._id)}
								replace
								scroll={false}
								className="flex min-w-0 outline-none after:absolute after:inset-0 focus-visible:underline"
							>
								<MatchSummary match={listing.match} />
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

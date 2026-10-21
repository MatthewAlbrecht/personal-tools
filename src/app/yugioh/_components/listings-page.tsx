"use client";

import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, Tag } from "lucide-react";
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
import { cn } from "~/lib/utils";
import { formatMoney, listingTypeLabel } from "~/lib/yugioh/listing-format";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MAX_LISTINGS_SHOWN } from "../../../../convex/model/yugioh/listings";
import type { ListingView } from "../_utils/types";
import { ListingDrawer } from "./listing-drawer";
import { MatchSummary, TitleFlagBadges } from "./listing-match";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The Deck's Listings, newest first: matched, unsure and not-a-match alike.
 * Tapping one opens the Listing drawer (`?listing=`).
 */
export function ListingsPage({
	deckId,
}: {
	deckId: Id<"yugiohDecks">;
}): React.ReactElement {
	const listings = useQuery(api.yugioh.listings.listListings, { deckId });
	const router = useRouter();
	const pathname = usePathname() ?? `/yugioh/decks/${deckId}/listings`;
	const searchParams = useSearchParams() ?? new URLSearchParams();

	if (listings === undefined) return <ListingsPageSkeleton />;

	if (listings.length === 0) {
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

	const now = Date.now();
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
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}

	return (
		<section aria-label="Listings" className="flex flex-col gap-3">
			<p className="text-muted-foreground text-sm tabular-nums">
				{countLine(listings.length)}
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
			<ListingDrawer
				deckId={deckId}
				listing={openListing}
				now={now}
				onClose={closeListing}
			/>
		</section>
	);
}

/** "17 Listings, newest first", or "The newest 200 Listings" at the cap. */
function countLine(count: number): string {
	if (count >= MAX_LISTINGS_SHOWN) return `The newest ${count} Listings`;
	return `${count} ${count === 1 ? "Listing" : "Listings"}, newest first`;
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
			<span className="flex items-baseline justify-between gap-3">
				<span className="flex items-baseline gap-1.5">
					<Price listing={listing} />
					<Shipping listing={listing} className="text-xs" />
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					eBay · {listingTypeLabel(listing, now)}
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
				<TitleFlagBadges titleRead={listing.titleRead} />
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
					<TableHead className="text-right">Price</TableHead>
					<TableHead>Card / Printing</TableHead>
					<TableHead className="w-full">Title</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Location</TableHead>
					<TableHead>Seen</TableHead>
					<TableHead>
						<span className="sr-only">Open on eBay</span>
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
							<div className="flex flex-col items-end">
								<Price listing={listing} />
								<Shipping listing={listing} className="text-xs" />
							</div>
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
							<div className="flex items-center gap-2">
								<p className="min-w-0 flex-1 truncate" title={listing.title}>
									{listing.title}
								</p>
								<TitleFlagBadges titleRead={listing.titleRead} />
							</div>
						</TableCell>
						<TableCell className="align-top tabular-nums">
							{listingTypeLabel(listing, now)}
						</TableCell>
						<TableCell className="align-top text-muted-foreground">
							{listing.sellerLocation}
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
									aria-label={`Open on eBay: ${listing.title} (opens in a new tab)`}
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

function Price({ listing }: { listing: ListingView }): React.ReactElement {
	return (
		<span className="font-medium text-[0.9375rem] tabular-nums">
			{listing.price === null
				? "No price"
				: formatMoney(listing.price, listing.currency ?? "USD")}
		</span>
	);
}

function Shipping({
	listing,
	className,
}: {
	listing: ListingView;
	className?: string;
}): React.ReactElement | null {
	if (listing.shipping === null) return null;
	return (
		<span className={cn("text-muted-foreground tabular-nums", className)}>
			{listing.shipping === 0
				? "Free shipping"
				: `+${formatMoney(listing.shipping, listing.currency ?? "USD")} shipping`}
		</span>
	);
}

/** "United Kingdom · listed 3h ago", leaving out a location eBay didn't show. */
function whereAndWhen(listing: ListingView): string {
	return [listing.sellerLocation, freshness(listing)]
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

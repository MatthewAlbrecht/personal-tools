"use client";

import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronDown,
	ListFilter,
	PencilLine,
	Tag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import type * as React from "react";
import { toast } from "sonner";
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
import { largeTcgplayerImage } from "~/lib/yugioh/card-grid";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import {
	type ConditionChoice,
	isConditionSetByYou,
	listingCondition,
} from "~/lib/yugioh/listing-edits";
import {
	type ListingFilters,
	type ListingsView,
	defaultListingFilters,
	extraFilters,
	isDefaultListingFilters,
	listingFiltersFromParams,
	withCardHidden,
	withCardShown,
	withListingFilters,
} from "~/lib/yugioh/listing-filters";
import {
	MARKETPLACE_LABELS,
	conditionCell,
	formatMoney,
	listingSeller,
	listingTypeLabel,
	titleFlags,
} from "~/lib/yugioh/listing-format";
import {
	REJECTION_REASON_LABELS,
	type RejectionReason,
} from "~/lib/yugioh/listing-rejection";
import {
	type ListingSort,
	type SortKey,
	defaultListingSort,
	listingSortFromParams,
	sortPhrase,
	toggledSort,
	withListingSort,
} from "~/lib/yugioh/listing-sort";
import { keyboardMenuPoint, rowClickOpensMenu } from "~/lib/yugioh/row-menu";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ListingView } from "../_utils/types";
import { DealGradeBadge, DealGradeSummary } from "./deal-grade";
import { ListingDrawer } from "./listing-drawer";
import { ConditionMenu, RarityMenu, useListingEdits } from "./listing-edits";
import { ListingsToolbar } from "./listing-filters";
import { ListingRowMenu, type RowMenuAt } from "./listing-row-menu";
import { ListingSortSelect } from "./listing-sort-select";
import { useListingRejection } from "./mark-wrong";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The Deck's Listings in one view, Available (the default) or Sold: those
 * matched to a Printing the Deck still needs, Rejected ones only under
 * Marked wrong. The view, filters and sort live in the URL; filters only
 * narrow the view. Column headers sort; tapping a Listing opens
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
	const rejection = useListingRejection();
	const edits = useListingEdits(rejection);
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
			rejectedCount={page?.rejectedCount ?? null}
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
						Listings for the Cards you still need appear after the next capture.
						Open a Search on the Searches tab to capture now.
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

	/**
	 * Hides the Listing's Card (the Card searching its Printing) from
	 * Listings, with Undo. Undo reads the URL as it is then, so filters
	 * changed in between stay.
	 */
	function hideCard(listing: ListingView): void {
		const printingId = listing.match.printing?._id;
		const card = page?.cards.find((c) =>
			c.printingIds.some((id) => id === printingId),
		);
		if (!card) return;
		setFilters(withCardHidden(filters, card._id));
		toast(`Hiding ${card.cardName}`, {
			description: "Its Listings are filtered out until you remove its chip.",
			action: {
				label: "Undo",
				onClick: () => {
					const current = new URLSearchParams(window.location.search);
					replaceParams(
						withListingFilters(
							current,
							withCardShown(listingFiltersFromParams(current), card._id),
						),
					);
				},
			},
		});
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
				<NothingShown view={view} filters={filters} onChange={setFilters} />
			) : (
				<>
					<div className="flex items-center justify-between gap-3">
						<p
							className="text-muted-foreground text-sm tabular-nums"
							aria-live="polite"
						>
							{countLine(
								listings.length,
								page.matching,
								sort,
								view,
								filters.rejected ?? false,
							)}
						</p>
						<ListingSortSelect
							key={`${sort.key}-${sort.direction}-${view}`}
							sort={sort}
							view={view}
							onChange={setSort}
							className="lg:hidden"
						/>
					</div>
					<ul className="-mx-4 flex flex-col divide-y border-y lg:hidden">
						{listings.map((listing) => (
							<li key={listing._id}>
								<ListingRow
									listing={listing}
									href={listingHref(listing._id)}
									now={now}
									leaving={rejection.leaving.has(listing._id)}
								/>
							</li>
						))}
					</ul>
					<div className="hidden lg:block">
						<ListingsTable
							listings={listings}
							now={now}
							onDetails={(listing) =>
								router.replace(listingHref(listing._id), { scroll: false })
							}
							onHideCard={hideCard}
							view={view}
							rejectedView={filters.rejected ?? false}
							sort={sort}
							onSort={sortBy}
							leaving={rejection.leaving}
							onMarkWrong={rejection.markWrong}
							onUnmark={rejection.unmark}
							onSetCondition={edits.setCondition}
							onSetRarity={edits.setRarity}
						/>
					</div>
				</>
			)}
			<ListingDrawer
				deckId={deckId}
				listing={openListing}
				now={now}
				onClose={closeListing}
				onMarkWrong={(listing, reason) => {
					closeListing();
					rejection.markWrong(listing, reason);
				}}
				onUnmark={(listing) => {
					closeListing();
					rejection.unmark(listing);
				}}
				onSetCondition={edits.setCondition}
				onSetRarity={(listing, choice) => {
					// A rarity that takes it out of Listings closes the drawer first.
					if (choice.printingId === null || !choice.needed) closeListing();
					edits.setRarity(listing, choice);
				}}
			/>
		</section>
	);
}

/**
 * Nothing in the view: "Nothing matches these filters." with a way out (back
 * to the defaults, or past them when only they are set), or, with no filters
 * set, that the view itself is empty.
 */
function NothingShown({
	view,
	filters,
	onChange,
}: {
	view: ListingsView;
	filters: ListingFilters;
	onChange: (filters: ListingFilters) => void;
}): React.ReactElement {
	const onlyDefaults =
		!filters.new && !filters.rejected && isDefaultListingFilters(filters);
	const filtered =
		onlyDefaults || filters.new || extraFilters(filters).length > 0;
	if (filters.rejected && !filtered) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ListFilter />
					</EmptyMedia>
					<EmptyTitle>Nothing marked wrong.</EmptyTitle>
					<EmptyDescription>
						Listings you mark wrong show here, so you can restore them.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
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
					{onlyDefaults ? (
						<Button
							variant="outline"
							onClick={() => onChange({ view: filters.view })}
						>
							Show every language, graded or not
						</Button>
					) : (
						<Button
							variant="outline"
							onClick={() =>
								onChange(defaultListingFilters({ view: filters.view }))
							}
						>
							Reset filters
						</Button>
					)}
				</EmptyContent>
			)}
		</Empty>
	);
}

/**
 * "17 Listings for Cards you still need, newest first"; past the cap, "The
 * first 200 of 812 Listings…"; under Marked wrong, "3 Listings marked wrong".
 */
function countLine(
	shown: number,
	matching: number,
	sort: ListingSort,
	view: ListingsView,
	rejected: boolean,
): string {
	const noun = `${matching === 1 ? "Listing" : "Listings"} ${
		rejected ? "marked wrong" : "for Cards you still need"
	}`;
	const order = sortPhrase(sort, view);
	return shown < matching
		? `The first ${shown} of ${matching} ${noun}, ${order}`
		: `${matching} ${noun}, ${order}`;
}

function ListingRow({
	listing,
	href,
	now,
	leaving,
}: {
	listing: ListingView;
	href: string;
	now: number;
	leaving: boolean;
}): React.ReactElement {
	const printing = listing.match.printing;
	return (
		<Folds leaving={leaving}>
			<Link
				href={href}
				replace
				scroll={false}
				className={cn(
					"flex min-h-14 gap-3 px-4 py-3 outline-none focus-visible:bg-muted active:bg-muted",
					listing.deal.belowCondition && "opacity-55",
				)}
			>
				<CardThumb printing={printing} />
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex items-baseline justify-between gap-3">
						<CardName listing={listing} />
						<PerCopy listing={listing} />
					</span>
					<span className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
						<span className="min-w-0 truncate">
							{[
								printingLine(printing),
								conditionShort(listing),
								`${MARKETPLACE_LABELS[listing.marketplace]} ${listingTypeLabel(listing, now)}`,
							]
								.filter((part) => part !== null)
								.join(" · ")}
						</span>
						{listing.rejection ? (
							<span className="shrink-0">
								{REJECTION_REASON_LABELS[listing.rejection.reason]}
							</span>
						) : (
							<DealGradeSummary deal={listing.deal} />
						)}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{whereAndWhen(listing)}
					</span>
				</span>
			</Link>
		</Folds>
	);
}

/**
 * The Listings table: one Listing a row, every row the same two lines (a
 * primary line and a muted one), every column a set width whose text is cut
 * short with the whole of it on hover. Clicking a row (or Enter on it)
 * opens the row menu where I clicked: Details (the Listing drawer), Open on
 * the marketplace, Change rarity and condition, Hide the Card, and Remove
 * (mark wrong) or Restore.
 */
export function ListingsTable({
	listings,
	now,
	view,
	rejectedView = false,
	sort,
	onSort,
	leaving = new Set(),
	onMarkWrong = () => {},
	onUnmark = () => {},
	onSetCondition,
	onSetRarity,
	onDetails,
	onHideCard,
}: {
	listings: ListingView[];
	now: number;
	/** Opens the Listing drawer. */
	onDetails?: (listing: ListingView) => void;
	/** Hides the Listing's Card from Listings (a filter). */
	onHideCard?: (listing: ListingView) => void;
	view: ListingsView;
	/** Marked wrong: the Grade column says why instead. */
	rejectedView?: boolean;
	sort: ListingSort;
	onSort: (key: SortKey) => void;
	/** Rows folding away while a mark saves. */
	leaving?: ReadonlySet<string>;
	onMarkWrong?: (listing: ListingView, reason: RejectionReason) => void;
	onUnmark?: (listing: ListingView) => void;
	/** Sets the condition from the Condition cell; without it, the cell is plain. */
	onSetCondition?: (
		listing: ListingView,
		condition: ConditionChoice | null,
	) => void;
	/** Sets the rarity from the Card cell; without it, the rarity is plain. */
	onSetRarity?: (
		listing: ListingView,
		choice: ListingView["rarityChoices"][number],
	) => void;
}): React.ReactElement {
	const head = { sort, onSort };
	// Marked wrong: restore a Listing before changing it.
	const editable = !rejectedView;
	const [menu, setMenu] = useState<RowMenuAt | null>(null);
	// The row the menu came from, for focus to go back to.
	const menuRow = useRef<HTMLElement | null>(null);

	function openMenu(
		listing: ListingView,
		row: HTMLElement,
		x: number,
		y: number,
	) {
		menuRow.current = row;
		setMenu({ listing, x, y });
	}

	return (
		<>
			<Table className="table-fixed">
				<colgroup>
					<col />
					<col className="w-30" />
					<col className={rejectedView ? "w-40" : "w-28"} />
					<col className="w-28" />
					<col className="w-32" />
					<col className="w-32" />
					<col className="w-28" />
				</colgroup>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<SortableHead {...head} column="card">
							Card
						</SortableHead>
						<SortableHead {...head} column="price">
							Per-copy
						</SortableHead>
						{rejectedView ? (
							<TableHead className="px-3">Marked wrong</TableHead>
						) : (
							<SortableHead {...head} column="grade">
								Grade
							</SortableHead>
						)}
						<SortableHead {...head} column="condition">
							Condition
						</SortableHead>
						<SortableHead {...head} column="date">
							{view === "sold" ? "Sold" : "Type"}
						</SortableHead>
						<SortableHead {...head} column="seller">
							Seller
						</SortableHead>
						<SortableHead {...head} column="seen">
							Seen
						</SortableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{listings.map((listing) => {
						const isLeaving = leaving.has(listing._id);
						const type = listingTypeLabel(listing, now);
						const seller =
							listing.marketplace === "ebay"
								? listing.sellerLocation
								: (listing.tcgplayer?.seller ?? null);
						const copies = listing.tcgplayer?.quantity ?? null;
						// Below the Card's Lowest acceptable condition: it doesn't
						// count, so it steps back.
						const dim = listing.deal.belowCondition;
						return (
							<TableRow
								key={listing._id}
								data-leaving={isLeaving || undefined}
								data-menu-open={menu?.listing._id === listing._id || undefined}
								tabIndex={isLeaving ? -1 : 0}
								aria-haspopup="menu"
								aria-expanded={menu?.listing._id === listing._id}
								aria-label={`${listing.match.printing?.cardName ?? listing.title}, ${MARKETPLACE_LABELS[listing.marketplace]}. Open actions`}
								className="group/row relative cursor-default outline-none focus-visible:bg-muted active:bg-muted data-[leaving]:border-transparent data-[menu-open]:bg-muted"
								onClick={(event) => {
									const row = event.currentTarget;
									if (
										isLeaving ||
										!rowClickOpensMenu({
											button: event.button,
											metaKey: event.metaKey,
											ctrlKey: event.ctrlKey,
											shiftKey: event.shiftKey,
											altKey: event.altKey,
											target: event.target as Element,
											row,
											selection: window.getSelection(),
										})
									) {
										return;
									}
									openMenu(listing, row, event.clientX, event.clientY);
								}}
								onKeyDown={(event) => {
									if (event.target !== event.currentTarget) return;
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									const row = event.currentTarget;
									const { x, y } = keyboardMenuPoint(
										row.getBoundingClientRect(),
										MENU_INSET,
									);
									openMenu(listing, row, x, y);
								}}
							>
								<RowCell dim={dim}>
									<div className="flex min-w-0 items-start gap-3">
										<CardThumb printing={listing.match.printing} />
										<div className="flex min-w-0 flex-col">
											<CardName listing={listing} />
											<PrintingCell
												listing={listing}
												onPick={
													editable && onSetRarity
														? (choice) => onSetRarity(listing, choice)
														: undefined
												}
											/>
										</div>
									</div>
								</RowCell>
								<RowCell dim={dim}>
									<PerCopy listing={listing} />
								</RowCell>
								<RowCell dim={dim}>
									{listing.rejection ? (
										<RejectionCell rejection={listing.rejection} />
									) : (
										<GradeCell deal={listing.deal} />
									)}
								</RowCell>
								<RowCell dim={dim}>
									<ConditionCell
										listing={listing}
										onPick={
											editable && onSetCondition
												? (condition) => onSetCondition(listing, condition)
												: undefined
										}
									/>
								</RowCell>
								<RowCell dim={dim}>
									<Primary title={type}>{type}</Primary>
									<Secondary>
										{MARKETPLACE_LABELS[listing.marketplace]}
									</Secondary>
								</RowCell>
								<RowCell dim={dim}>
									<Primary title={seller ?? undefined}>
										{seller ?? <span className="text-muted-foreground">—</span>}
									</Primary>
									<Secondary>
										{copies !== null && copies > 1
											? `${copies} Copies`
											: "\u00a0"}
									</Secondary>
								</RowCell>
								<RowCell dim={dim}>
									<Primary>{ago(listing)}</Primary>
									<Secondary>
										{listing.listedAt === null ? "\u00a0" : "listed"}
									</Secondary>
								</RowCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
			<ListingRowMenu
				at={menu}
				onClose={() => setMenu(null)}
				onCloseAutoFocus={(event) => {
					// Back to the row, unless it left (marked wrong, hidden).
					event.preventDefault();
					const row = menuRow.current;
					if (row?.isConnected) row.focus({ preventScroll: true });
				}}
				rejectedView={rejectedView}
				onDetails={onDetails}
				onHideCard={onHideCard}
				onMarkWrong={onMarkWrong}
				onUnmark={onUnmark}
				onSetCondition={onSetCondition}
				onSetRarity={onSetRarity}
			/>
		</>
	);
}

/**
 * From the keyboard, the row menu opens under the row, in line with the Card
 * name: the cell's padding, the art and the gap (12 + 28 + 12).
 */
const MENU_INSET = 52;

/**
 * A table cell that folds away with its row: the row's height collapses
 * and its content fades (`ROW_EXIT_MS`, ease-out). Instant with reduced
 * motion.
 */
function RowCell({
	className,
	dim = false,
	children,
}: {
	className?: string;
	/** Faded, for a Listing that doesn't count. */
	dim?: boolean;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<TableCell
			className={cn(
				"px-3 py-2.5 align-top transition-[padding] duration-200 ease-out group-data-[leaving]/row:py-0 motion-reduce:transition-none",
				dim && "opacity-55",
				className,
			)}
		>
			<Folds leaving={false} inRow>
				{children}
			</Folds>
		</TableCell>
	);
}

/**
 * Content that folds to nothing while `leaving` (or while its table row is):
 * height to zero and opacity out over `ROW_EXIT_MS`.
 */
function Folds({
	leaving,
	inRow = false,
	children,
}: {
	leaving: boolean;
	inRow?: boolean;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div
			data-leaving={leaving || undefined}
			className={cn(
				"grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
				"data-[leaving]:grid-rows-[0fr] data-[leaving]:opacity-0",
				inRow &&
					"group-data-[leaving]/row:grid-rows-[0fr] group-data-[leaving]/row:opacity-0",
			)}
		>
			<div
				className={cn(
					"min-h-0 min-w-0",
					leaving && "overflow-hidden",
					inRow && "group-data-[leaving]/row:overflow-hidden",
				)}
			>
				{children}
			</div>
		</div>
	);
}

/** A cell's first line: body text, cut short with the whole on hover. */
function Primary({
	title,
	children,
}: {
	title?: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<p className="truncate text-sm leading-5" title={title}>
			{children}
		</p>
	);
}

/** A cell's second line: muted meta, cut short with the whole on hover. */
function Secondary({
	title,
	children,
}: {
	title?: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<p
			className="truncate text-muted-foreground text-xs leading-5"
			title={title}
		>
			{children}
		</p>
	);
}

/**
 * The matched Printing's TCGplayer art, card-shaped at 28×40; a quiet
 * card-coloured tile until the Printing has a product page.
 */
function CardThumb({
	printing,
}: {
	printing: ListingView["match"]["printing"];
}): React.ReactElement {
	return (
		<span className="relative h-10 w-7 shrink-0 overflow-hidden rounded-[3px] bg-muted ring-1 ring-border">
			{printing?.imageUrl ? (
				<Image
					src={largeTcgplayerImage(printing.imageUrl)}
					alt=""
					fill
					sizes="28px"
					className="object-cover"
				/>
			) : null}
		</span>
	);
}

/** The Card name, with a quiet "New" after it when first seen since my last visit. */
function CardName({ listing }: { listing: ListingView }): React.ReactElement {
	const name = listing.match.printing?.cardName ?? "Not matched";
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
			<span className="truncate font-medium" title={name}>
				{name}
			</span>
			{listing.isNew ? (
				<span className="shrink-0 rounded-sm bg-primary/10 px-1 font-semibold text-[0.625rem] text-primary uppercase leading-4 tracking-wide">
					New
				</span>
			) : null}
		</span>
	);
}

/** "TU04-EN000 · UtR": the set code and the rarity's abbreviation. */
function printingLine(
	printing: ListingView["match"]["printing"],
): string | null {
	if (!printing) return null;
	return `${printing.setCode} · ${rarityAbbreviation(printing.rarity)}`;
}

function printingTitle(listing: ListingView): string {
	const printing = listing.match.printing;
	return printing
		? `${printing.cardName} · ${printing.setCode} ${printing.rarity}`
		: listing.title;
}

/**
 * The grade as a pill (Great solid, Good tinted, Fair outlined, Poor muted)
 * over "128% of ref"; a dash when there's no grade.
 */
function GradeCell({
	deal,
}: { deal: ListingView["deal"] }): React.ReactElement {
	if (deal.grade === null || deal.percentOfReference === null) {
		return (
			<>
				<p className="text-muted-foreground text-sm leading-5">
					<span aria-hidden>—</span>
					<span className="sr-only">No grade</span>
				</p>
				<Secondary>
					{deal.reference?.price === null ? "Too few sales" : " "}
				</Secondary>
			</>
		);
	}
	return (
		<>
			<div className="flex h-5 items-center">
				<DealGradeBadge deal={deal} />
			</div>
			<p className="text-muted-foreground text-xs tabular-nums leading-5">
				{deal.percentOfReference}% of ref
			</p>
		</>
	);
}

/** Why I marked it wrong, and when. */
function RejectionCell({
	rejection,
}: {
	rejection: NonNullable<ListingView["rejection"]>;
}): React.ReactElement {
	const reason = REJECTION_REASON_LABELS[rejection.reason];
	return (
		<>
			<Primary title={reason}>{reason}</Primary>
			<Secondary>
				{formatDistanceToNowStrict(rejection.at, { addSuffix: true })}
			</Secondary>
		</>
	);
}

/**
 * The Listing's condition (mine, else the title's) as an acronym ("LP")
 * with its full name on hover, over what else sets the Listing apart:
 * "Below minimum", "PSA 10", "KR", "×3 copies". A muted dash when unknown.
 * With `onPick`, the acronym opens the condition picker; a condition I set
 * carries a quiet pencil ("Set by you").
 */
function ConditionCell({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick?: (condition: ConditionChoice | null) => void;
}): React.ReactElement {
	const setByYou = isConditionSetByYou(listing);
	const cell = conditionCell(
		listingCondition(listing),
		listing.deal.belowCondition,
	);
	const notes = [
		...(cell?.below ? ["Below minimum"] : []),
		...titleFlags(listing.titleRead).map((flag) => flag.label),
	].join(" · ");
	const why = setByYou
		? "Not stated"
		: listing.titleRead?.graded
			? "Graded, so no condition"
			: "Condition not stated. Check the photos.";
	const name = cell?.name ?? why;
	const value = (
		<>
			<span aria-hidden>{cell?.short ?? "—"}</span>
			<span className="sr-only">{name}</span>
		</>
	);
	const tone =
		cell === null || cell.below ? "text-muted-foreground" : "font-medium";
	return (
		<>
			{onPick ? (
				<div className="flex h-5 items-center">
					<ConditionMenu listing={listing} onPick={onPick}>
						<CellTrigger
							className={cn("text-sm", tone)}
							title={name}
							aria-label={`Condition: ${name}${setByYou ? ", set by you" : ""}. Change`}
						>
							{value}
							{setByYou ? <SetByYou /> : null}
						</CellTrigger>
					</ConditionMenu>
				</div>
			) : (
				<p className={cn("text-sm leading-5", tone)} title={name}>
					{value}
				</p>
			)}
			<Secondary title={notes || undefined}>{notes || " "}</Secondary>
		</>
	);
}

/**
 * The Card cell's second line, "PTDN-EN084 · UtR". With `onPick`, the
 * rarity opens the rarity picker; a match I set carries the pencil.
 */
function PrintingCell({
	listing,
	onPick,
}: {
	listing: ListingView;
	onPick?: (choice: ListingView["rarityChoices"][number]) => void;
}): React.ReactElement {
	const printing = listing.match.printing;
	if (!printing || !onPick) {
		return (
			<Secondary title={printingTitle(listing)}>
				{printingLine(printing) ?? listing.title}
			</Secondary>
		);
	}
	const setByYou = listing.match.overridden;
	return (
		<div className="flex h-5 min-w-0 items-center text-muted-foreground text-xs">
			<span className="truncate" title={printingTitle(listing)}>
				{printing.setCode}
			</span>
			<span aria-hidden className="shrink-0 whitespace-pre">
				{" · "}
			</span>
			<RarityMenu listing={listing} onPick={onPick}>
				<CellTrigger
					className="shrink-0"
					title={printing.rarity}
					aria-label={`Rarity: ${printing.rarity}${setByYou ? ", set by you" : ""}. Change`}
				>
					{rarityAbbreviation(printing.rarity)}
					{setByYou ? <SetByYou /> : null}
				</CellTrigger>
			</RarityMenu>
		</div>
	);
}

/**
 * A cell value that opens a picker: reads as the plain text it replaces,
 * lifted above the row; its clicks don't open the row menu. A chevron
 * shows on row hover and focus; hover, focus and open get a quiet fill.
 */
function CellTrigger({
	className,
	children,
	...props
}: React.ComponentProps<"button">): React.ReactElement {
	return (
		<button
			type="button"
			className={cn(
				"group/trigger -mx-1 relative z-10 inline-flex h-5 max-w-[calc(100%+0.5rem)] items-center gap-0.5 rounded-sm px-1 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground motion-reduce:transition-none",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronDown
				aria-hidden
				className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/trigger:opacity-100 group-data-[state=open]/trigger:opacity-100 motion-reduce:transition-none"
			/>
		</button>
	);
}

/** The quiet pencil after a value I set myself. */
function SetByYou(): React.ReactElement {
	return (
		<span title="Set by you" className="inline-flex text-muted-foreground">
			<PencilLine aria-hidden className="size-3" />
		</span>
	);
}

/** "NM", or null when the title doesn't say: for the phone row's meta line. */
function conditionShort(listing: ListingView): string | null {
	return conditionCell(listingCondition(listing), false)?.short ?? null;
}

/**
 * A column header that sorts: picking it sorts by that column, picking it
 * again flips the order. The sorted column shows an arrow and `aria-sort`.
 */
function SortableHead({
	column,
	sort,
	onSort,
	children,
}: {
	column: SortKey;
	sort: ListingSort;
	onSort: (key: SortKey) => void;
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
			className="px-3"
			aria-sort={
				active
					? sort.direction === "asc"
						? "ascending"
						: "descending"
					: "none"
			}
		>
			<Button
				variant="ghost"
				size="sm"
				className={cn(
					"-mx-2 h-8 max-w-[calc(100%+1rem)] gap-1 px-2 font-medium",
					!active && "text-foreground",
				)}
				onClick={() => onSort(column)}
			>
				<span className="truncate">{children}</span>
				<Arrow
					aria-hidden
					className={cn(!active && "text-muted-foreground/50")}
				/>
			</Button>
		</TableHead>
	);
}

/**
 * The Per-copy price: "$42.15 /copy", left-aligned so prices line up on
 * their dollar sign. Without one, why not: "No price", or "No rate yet" for
 * a currency without an exchange rate (the drawer shows the original amount).
 */
function PerCopy({ listing }: { listing: ListingView }): React.ReactElement {
	if (listing.perCopyPrice !== null) {
		return (
			<span className="whitespace-nowrap text-sm tabular-nums leading-5">
				<span className="font-medium">
					{formatMoney(listing.perCopyPrice.perCopy, "USD")}
				</span>
				<span className="text-muted-foreground text-xs"> /copy</span>
			</span>
		);
	}
	return (
		<span className="whitespace-nowrap text-muted-foreground text-sm leading-5">
			{listing.price === null
				? "No price"
				: `No rate yet (${listing.currency})`}
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
	return `${listing.listedAt === null ? "seen" : "listed"} ${ago(listing)}`;
}

/** How long ago it was listed (eBay's date) or first captured: "3 hours ago". */
function ago(listing: ListingView): string {
	return formatDistanceToNowStrict(listing.listedAt ?? listing.firstSeenAt, {
		addSuffix: true,
	});
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

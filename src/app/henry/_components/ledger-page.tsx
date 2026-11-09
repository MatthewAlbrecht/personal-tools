"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format, formatDistanceStrict } from "date-fns";
import { ArrowDown, ArrowDownUp, ArrowUp, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Empty,
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
import {
	DEFAULT_SORT,
	type Sort,
	type SortKey,
	nextSort,
	sortUnits,
} from "~/lib/henry/sort";
import { bedLabel, formatMoney, moveInLabel } from "~/lib/henry/units";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { PriceChange } from "./price-change";
import { UnitBadges } from "./unit-badges";
import { UnitDrawer } from "./unit-drawer";

type Ledger = FunctionReturnType<typeof api.henry.ledger.getLedger>;
type LedgerUnit = Ledger["units"][number];

const DAY = 24 * 60 * 60 * 1000;
/** The longest change window (3/7/14 days): until then, history is still short. */
const HISTORY_FILLS_IN = 14 * DAY;
/** The URL param that opens a unit's drawer, e.g. `/henry?unit=608` (push taps land here). */
const UNIT_PARAM = "unit";

export function LedgerPage(): React.ReactElement {
	const now = useMinuteClock();
	const ledger = useHeldWhileLoading(
		useQuery(api.henry.ledger.getLedger, { now }),
		"henry",
	);
	const router = useRouter();
	const pathname = usePathname() ?? "/henry";
	const searchParams = useSearchParams() ?? new URLSearchParams();
	const openUnit = searchParams.get(UNIT_PARAM);

	function unitHref(number: string | null): string {
		const params = new URLSearchParams(searchParams.toString());
		if (number === null) params.delete(UNIT_PARAM);
		else params.set(UNIT_PARAM, number);
		const query = params.toString();
		return query ? `${pathname}?${query}` : pathname;
	}

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h1 className="font-display font-semibold text-2xl md:text-3xl">
					The Henry
				</h1>
				{ledger === undefined ? (
					<Skeleton className="h-5 w-72 max-w-full" />
				) : ledger.trackingBeganAt !== null ? (
					<p className="text-muted-foreground text-sm">
						{summaryLine(ledger, now)}
					</p>
				) : null}
			</header>

			{ledger === undefined ? (
				<LedgerPageSkeleton />
			) : ledger.trackingBeganAt === null ? (
				<NoCheckYet ledger={ledger} />
			) : (
				<>
					{now - ledger.trackingBeganAt < HISTORY_FILLS_IN ? (
						<p className="text-muted-foreground text-sm">
							Tracking began {format(ledger.trackingBeganAt, "MMM d")}, so
							there's no price history before then.
						</p>
					) : null}
					<LedgerTable
						units={ledger.units}
						today={format(now, "yyyy-MM-dd")}
						unitHref={unitHref}
						onOpen={(number) =>
							router.replace(unitHref(number), { scroll: false })
						}
					/>
				</>
			)}

			<UnitDrawer
				number={openUnit}
				now={now}
				onClose={() => router.replace(unitHref(null), { scroll: false })}
			/>
		</div>
	);
}

function summaryLine(ledger: Ledger, now: number): string {
	const parts = [
		`${ledger.onMarketCount} on the market`,
		`${ledger.newThisWeekCount} new this week`,
	];
	if (ledger.lastCheckedAt !== null) {
		parts.push(`checked ${checkedAgo(ledger.lastCheckedAt, now)}`);
	}
	return parts.join(" · ");
}

function checkedAgo(at: number, now: number): string {
	if (now - at < 60_000) return "just now";
	return `${formatDistanceStrict(at, now, { roundingMethod: "floor" })
		.replace(" minutes", " min")
		.replace(" minute", " min")} ago`;
}

function NoCheckYet({ ledger }: { ledger: Ledger }): React.ReactElement {
	const failed = ledger.lastCheck?.outcome === "failure";
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Building2 />
				</EmptyMedia>
				<EmptyTitle>
					{failed ? "The first check failed" : "No check yet"}
				</EmptyTitle>
				<EmptyDescription>
					{failed
						? `${ledger.lastCheck?.reason}. The next one runs within the hour.`
						: "The Henry is checked every hour. Units on the market show up here after the first check."}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function LedgerTable({
	units,
	today,
	unitHref,
	onOpen,
}: {
	units: LedgerUnit[];
	today: string;
	unitHref: (number: string) => string;
	onOpen: (number: string) => void;
}): React.ReactElement {
	const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
	const rows = sortUnits(units, sort);

	function sortBy(key: SortKey): void {
		setSort((current) => nextSort(current, key));
	}

	return (
		<div className="overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Unit</TableHead>
						<TableHead>Layout</TableHead>
						<SortHead
							label="Sq ft"
							sortKey="sqft"
							sort={sort}
							onSort={sortBy}
						/>
						<SortHead
							label="Floor"
							sortKey="floor"
							sort={sort}
							onSort={sortBy}
						/>
						<SortHead
							label="Price"
							sortKey="price"
							sort={sort}
							onSort={sortBy}
						/>
						<SortHead label="3d" sortKey="d3" sort={sort} onSort={sortBy} />
						<SortHead label="7d" sortKey="d7" sort={sort} onSort={sortBy} />
						<SortHead label="14d" sortKey="d14" sort={sort} onSort={sortBy} />
						<TableHead>Move in</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((unit) => (
						<TableRow
							key={unit._id}
							onClick={() => onOpen(unit.number)}
							className="cursor-pointer"
						>
							<TableCell>
								<div className="flex items-center gap-2">
									<Link
										href={unitHref(unit.number)}
										replace
										scroll={false}
										onClick={(event) => event.stopPropagation()}
										className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										<span className="sr-only">Apt </span>
										{unit.number}
									</Link>
									<UnitBadges unit={unit} />
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground">
								{unit.floorPlan} · {bedLabel(unit.beds)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{unit.sqft.toLocaleString()}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{unit.floor}
							</TableCell>
							<TableCell className="text-right font-medium tabular-nums">
								{formatMoney(unit.price)}
							</TableCell>
							<TableCell className="text-right">
								<PriceChange value={unit.changes.d3} />
							</TableCell>
							<TableCell className="text-right">
								<PriceChange value={unit.changes.d7} />
							</TableCell>
							<TableCell className="text-right">
								<PriceChange value={unit.changes.d14} />
							</TableCell>
							<TableCell className="text-muted-foreground">
								{moveInLabel(unit.availableOn, today)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SortHead({
	label,
	sortKey,
	sort,
	onSort,
}: {
	label: string;
	sortKey: SortKey;
	sort: Sort;
	onSort: (key: SortKey) => void;
}): React.ReactElement {
	const active = sort.key === sortKey;
	const Icon = !active
		? ArrowDownUp
		: sort.direction === "asc"
			? ArrowUp
			: ArrowDown;
	return (
		<TableHead
			className="text-right"
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
				size="xs"
				onClick={() => onSort(sortKey)}
				className={cn("-mr-2", !active && "text-muted-foreground")}
			>
				{label}
				<Icon data-icon="inline-end" className={cn(!active && "opacity-40")} />
			</Button>
		</TableHead>
	);
}

export function LedgerPageSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-3 rounded-lg border p-4">
			{[0, 1, 2, 3, 4, 5].map((key) => (
				<Skeleton key={key} className="h-6 w-full" />
			))}
		</div>
	);
}

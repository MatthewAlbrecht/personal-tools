"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format, formatDistanceStrict } from "date-fns";
import {
	ArrowDown,
	ArrowDownUp,
	ArrowUp,
	Building2,
	ChevronDown,
	Star,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type * as React from "react";
import { PushSettings } from "~/components/push-settings";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
	DEFAULT_SORT,
	type Sort,
	type SortKey,
	nextSort,
	sortUnits,
} from "~/lib/henry/sort";
import {
	type LedgerFilter,
	type PlanSummary,
	filterCounts,
	filterUnits,
	isStarred,
	pinStarred,
	planSummaries,
} from "~/lib/henry/stars";
import { bedLabel, formatMoney, moveInLabel } from "~/lib/henry/units";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { useStarToggles } from "../_utils/use-star-toggles";
import { PriceChange } from "./price-change";
import { StarButton } from "./star-button";
import { UnitBadges } from "./unit-badges";
import { UnitDrawer } from "./unit-drawer";

type Ledger = FunctionReturnType<typeof api.henry.ledger.getLedger>;
type LedgerUnit = Ledger["units"][number];
type GoneUnit = Ledger["goneThisWeek"][number];

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

	function openUnitDrawer(number: string): void {
		router.replace(unitHref(number), { scroll: false });
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
					<SummaryLine ledger={ledger} now={now} />
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
						starredPlans={ledger.starredPlans}
						today={format(now, "yyyy-MM-dd")}
						unitHref={unitHref}
						onOpen={openUnitDrawer}
					/>
					{ledger.goneThisWeek.length > 0 ? (
						<GoneThisWeek
							units={ledger.goneThisWeek}
							unitHref={unitHref}
							onOpen={openUnitDrawer}
						/>
					) : null}
				</>
			)}

			<PushSettings
				description="A push when a unit lists or comes back, unless it faces I-25, is a 1 bed of 800 sq ft or less, or is a studio on floors 2-6. Starred units and floor plans always push."
				label="New unit alerts on this device"
				hint="Units found between 11pm and 8am arrive at 8am."
			/>

			<UnitDrawer
				number={openUnit}
				now={now}
				onClose={() => router.replace(unitHref(null), { scroll: false })}
			/>
		</div>
	);
}

/** "33 on the market · 5 new this week · 3 gone this week · checked 12 min ago", or a warning in place of "checked" when checks are failing. */
function SummaryLine({
	ledger,
	now,
}: {
	ledger: Ledger;
	now: number;
}): React.ReactElement {
	const counts = [
		`${ledger.onMarketCount} on the market`,
		`${ledger.newThisWeekCount} new this week`,
		`${ledger.goneThisWeekCount} gone this week`,
	].join(" · ");
	return (
		<p className="text-muted-foreground text-sm">
			{counts}
			{ledger.checksFailing ? (
				<>
					{" · "}
					<span className="font-medium text-destructive">
						checks failing
						{ledger.lastCheckedAt !== null
							? ` · last success ${checkedAgo(ledger.lastCheckedAt, now)}`
							: null}
					</span>
				</>
			) : ledger.lastCheckedAt !== null ? (
				` · checked ${checkedAgo(ledger.lastCheckedAt, now)}`
			) : null}
		</p>
	);
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

const FILTER_LABELS: Record<LedgerFilter, string> = {
	all: "All",
	starred: "Starred",
	new: "New",
};

/** The filter and floor plan stars above the table, then the units: starred pinned to the top within the current sort. */
function LedgerTable({
	units,
	starredPlans,
	today,
	unitHref,
	onOpen,
}: {
	units: LedgerUnit[];
	starredPlans: string[];
	today: string;
	unitHref: (number: string) => string;
	onOpen: (number: string) => void;
}): React.ReactElement {
	const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
	const [filter, setFilter] = useState<LedgerFilter>("all");
	const stars = useStarToggles();
	const counts = filterCounts(units);
	const rows = pinStarred(filterUnits(sortUnits(units, sort), filter));

	function sortBy(key: SortKey): void {
		setSort((current) => nextSort(current, key));
	}

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<ToggleGroup
					aria-label="Show"
					variant="outline"
					spacing={0}
					value={[filter]}
					onValueChange={(next) => {
						const [picked] = next as LedgerFilter[];
						// Pressing the active option again would clear the group; keep it.
						if (picked) setFilter(picked);
					}}
				>
					{(["all", "starred", "new"] as const).map((option) => (
						<ToggleGroupItem
							key={option}
							value={option}
							className="h-11 px-3 md:h-9"
						>
							{FILTER_LABELS[option]}
							<span className="text-muted-foreground tabular-nums">
								{counts[option]}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<FloorPlanStars
					plans={planSummaries(units, starredPlans)}
					onToggle={stars.togglePlan}
				/>
			</div>

			{rows.length === 0 ? (
				<NoUnitsInFilter filter={filter} />
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">
									<span className="sr-only">Star</span>
								</TableHead>
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
								<SortHead
									label="14d"
									sortKey="d14"
									sort={sort}
									onSort={sortBy}
								/>
								<TableHead>Move in</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((unit) => (
								<TableRow
									key={unit._id}
									onClick={() => onOpen(unit.number)}
									className={cn(
										"cursor-pointer",
										isStarred(unit) && "bg-muted/40 font-semibold",
									)}
								>
									<TableCell className="py-1">
										<StarButton
											active={unit.unitStarred}
											viaPlan={unit.planStarred}
											label={`apt ${unit.number}`}
											onToggle={() => stars.toggleUnit(unit._id)}
										/>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Link
												href={unitHref(unit.number)}
												replace
												scroll={false}
												onClick={(event) => event.stopPropagation()}
												className="rounded-sm tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
									<TableCell
										className={cn(
											"text-right tabular-nums",
											!isStarred(unit) && "font-medium",
										)}
									>
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
			)}
		</section>
	);
}

/** Stars a whole floor plan: every unit on it counts as starred, now and when more list. */
function FloorPlanStars({
	plans,
	onToggle,
}: {
	plans: PlanSummary[];
	onToggle: (floorPlan: string) => void;
}): React.ReactElement {
	const starredCount = plans.filter((plan) => plan.starred).length;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" className="h-11 md:h-9">
					<Star
						data-icon="inline-start"
						className={cn(starredCount > 0 && "fill-foreground")}
					/>
					Floor plans
					{starredCount > 0 ? (
						<span className="text-muted-foreground tabular-nums">
							{starredCount}
						</span>
					) : null}
					<ChevronDown data-icon="inline-end" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel>Star a floor plan</DropdownMenuLabel>
				<p className="px-2 pb-1.5 text-muted-foreground text-xs">
					Every unit on it counts as starred, including ones that list later.
				</p>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					{plans.map((plan) => (
						<DropdownMenuCheckboxItem
							key={plan.floorPlan}
							checked={plan.starred}
							onCheckedChange={() => onToggle(plan.floorPlan)}
							// Keep the menu open to star several.
							onSelect={(event) => event.preventDefault()}
						>
							<span className="font-medium">{plan.floorPlan}</span>
							{plan.beds !== null ? (
								<span className="text-muted-foreground">
									{bedLabel(plan.beds)}
								</span>
							) : null}
							<span className="ml-auto text-muted-foreground text-xs tabular-nums">
								{plan.onMarket === 0 ? "none listed" : plan.onMarket}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NoUnitsInFilter({
	filter,
}: {
	filter: LedgerFilter;
}): React.ReactElement {
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					{filter === "starred" ? <Star /> : <Building2 />}
				</EmptyMedia>
				<EmptyTitle>
					{filter === "starred"
						? "No starred units on the market"
						: "No new units this week"}
				</EmptyTitle>
				<EmptyDescription>
					{filter === "starred"
						? "Star a unit, or a whole floor plan, to pin it to the top."
						: "Units that come on the market show up here for 7 days."}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

/** Units off the market in the last 7 days, newest first, last price struck through. */
function GoneThisWeek({
	units,
	unitHref,
	onOpen,
}: {
	units: GoneUnit[];
	unitHref: (number: string) => string;
	onOpen: (number: string) => void;
}): React.ReactElement {
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-medium text-muted-foreground text-sm">
				Gone this week
			</h2>
			<div className="overflow-x-auto rounded-lg border">
				<Table>
					<TableBody>
						{units.map((unit) => (
							<TableRow
								key={unit._id}
								onClick={() => onOpen(unit.number)}
								className="cursor-pointer text-muted-foreground"
							>
								<TableCell>
									<Link
										href={unitHref(unit.number)}
										replace
										scroll={false}
										onClick={(event) => event.stopPropagation()}
										className="rounded-sm tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										<span className="sr-only">Apt </span>
										{unit.number}
									</Link>
								</TableCell>
								<TableCell>
									{unit.floorPlan} · {bedLabel(unit.beds)} ·{" "}
									{unit.sqft.toLocaleString()} sq ft
								</TableCell>
								<TableCell className="tabular-nums">
									Gone {format(unit.offMarketAt, "MMM d")}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									<span className="sr-only">Last price </span>
									<span className="line-through">
										{formatMoney(unit.price)}
									</span>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</section>
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

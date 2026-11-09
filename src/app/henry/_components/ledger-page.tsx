"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format, formatDistanceStrict } from "date-fns";
import { Building2 } from "lucide-react";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
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
import { bedLabel, formatMoney, moveInLabel } from "~/lib/henry/units";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useMinuteClock } from "~/lib/hooks/use-minute-clock";
import { api } from "../../../../convex/_generated/api";

type Ledger = FunctionReturnType<typeof api.henry.ledger.getLedger>;
type LedgerUnit = Ledger["units"][number];

const DAY = 24 * 60 * 60 * 1000;
/** The longest change window (3/7/14 days): until then, history is still short. */
const HISTORY_FILLS_IN = 14 * DAY;

export function LedgerPage(): React.ReactElement {
	const now = useMinuteClock();
	const ledger = useHeldWhileLoading(
		useQuery(api.henry.ledger.getLedger, { now }),
		"henry",
	);

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
					<LedgerTable units={ledger.units} today={format(now, "yyyy-MM-dd")} />
				</>
			)}
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
}: {
	units: LedgerUnit[];
	today: string;
}): React.ReactElement {
	return (
		<div className="overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Unit</TableHead>
						<TableHead>Layout</TableHead>
						<TableHead className="text-right">Sq ft</TableHead>
						<TableHead className="text-right">Floor</TableHead>
						<TableHead className="text-right">Price</TableHead>
						<TableHead>Move in</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{units.map((unit) => (
						<TableRow key={unit._id}>
							<TableCell>
								<div className="flex items-center gap-2">
									<span className="tabular-nums">{unit.number}</span>
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

function UnitBadges({ unit }: { unit: LedgerUnit }): React.ReactElement | null {
	if (unit.newDays === null && !unit.facesI25) return null;
	return (
		<span className="inline-flex flex-wrap items-center gap-1">
			{unit.newDays !== null ? (
				<Badge className="h-5 px-1.5 py-0 font-medium">
					{unit.newDays === 0 ? "New today" : `New · ${unit.newDays}d`}
				</Badge>
			) : null}
			{unit.facesI25 ? (
				<Badge
					variant="outline"
					className="h-5 px-1.5 py-0 font-normal text-muted-foreground"
				>
					I-25 side
				</Badge>
			) : null}
		</span>
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

"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format, parseISO } from "date-fns";
import { ExternalLink, SearchX } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { LONGEST_CHANGE_WINDOW } from "~/lib/henry/changes";
import { newUnitPushLabel } from "~/lib/henry/pushes";
import { bedLabel, formatMoney } from "~/lib/henry/units";
import { useHeldWhileLoading } from "~/lib/hooks/use-held-while-loading";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { useStarToggles } from "../_utils/use-star-toggles";
import { PriceChange, PriceChangeTrio } from "./price-change";
import { PriceStepChart } from "./price-step-chart";
import { StarButton } from "./star-button";
import { UnitBadges } from "./unit-badges";

type UnitDetails = NonNullable<
	FunctionReturnType<typeof api.henry.units.getUnit>
>;
type TimelineEntry = UnitDetails["timeline"][number];
type EventKind = Exclude<TimelineEntry["kind"], "priceChange">;

/** Where to go apply. */
const HENRY_SITE = "https://www.thehenrydenver.com/Floor-plans.aspx";

/** How each timeline event reads, with the price then. */
const EVENT_LABELS: Record<EventKind, (price: string) => string> = {
	trackingBegan: (price) => `Tracking began at ${price}`,
	listed: (price) => `Listed at ${price}`,
	offMarket: (price) => `Off the market at ${price}`,
	relisted: (price) => `Relisted at ${price}`,
};

/**
 * One unit's details, opened with `?unit=<number>`: a right panel at `md:`
 * and up, a bottom sheet on phones (the Yu-Gi-Oh drawer style). Keeps
 * showing the last unit while it closes.
 */
export function UnitDrawer({
	number,
	now,
	onClose,
}: {
	/** The unit number from the URL; null when closed. */
	number: string | null;
	now: number;
	onClose: () => void;
}): React.ReactElement {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	// The unit stays rendered through the close animation after the URL clears.
	const [shown, setShown] = useState(number);
	if (number !== null && number !== shown) setShown(number);

	const details = useHeldWhileLoading(
		useQuery(
			api.henry.units.getUnit,
			shown === null ? "skip" : { number: shown, now },
		),
		shown ?? "",
	);

	return (
		<Drawer
			open={number !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			direction={isDesktop ? "right" : "bottom"}
		>
			<DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:max-w-md">
				{details === undefined ? (
					<UnitDrawerSkeleton number={shown} />
				) : details === null ? (
					<UnknownUnit number={shown} />
				) : (
					<UnitDetailsView unit={details} now={now} />
				)}
			</DrawerContent>
		</Drawer>
	);
}

function UnitDetailsView({
	unit,
	now,
}: {
	unit: UnitDetails;
	now: number;
}): React.ReactElement {
	const today = format(now, "yyyy-MM-dd");
	const gone = unit.status === "offMarket";
	const stars = useStarToggles();
	return (
		<>
			<DrawerHeader className="gap-1 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
				<div className="flex items-center gap-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<DrawerTitle className="font-display text-2xl tabular-nums">
							Apt {unit.number}
						</DrawerTitle>
						{/* A gone unit isn't New, however recently it listed. */}
						<UnitBadges unit={gone ? { ...unit, newDays: null } : unit} />
					</div>
					<StarButton
						active={unit.unitStarred}
						viaPlan={unit.planStarred}
						label={`apt ${unit.number}`}
						onToggle={() => stars.toggleUnit(unit._id)}
						className="ml-auto shrink-0"
					/>
				</div>
				<DrawerDescription>
					{unit.floorPlan} · {bedLabel(unit.beds)} ·{" "}
					{unit.sqft.toLocaleString()} sq ft · Floor {unit.floor}
				</DrawerDescription>
			</DrawerHeader>

			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
				<div className="flex flex-col gap-1">
					<p
						className={cn(
							"font-display font-semibold text-4xl tabular-nums",
							gone && "text-muted-foreground line-through",
						)}
					>
						{gone ? <span className="sr-only">Last price </span> : null}
						{formatMoney(unit.price)}
						<span className="ml-1 font-normal font-sans text-base text-muted-foreground">
							/mo
						</span>
					</p>
					<p className="text-muted-foreground text-sm">{terms(unit, today)}</p>
				</div>

				{gone ? null : <PriceChangeTrio changes={unit.changes} />}

				<section className="flex flex-col gap-3">
					<div className="flex items-baseline justify-between gap-3">
						<h3 className="font-medium text-sm">Last 14 days</h3>
						<span className="inline-flex items-baseline gap-1.5 text-muted-foreground text-xs">
							{sinceLabel(unit)}
							<PriceChange value={unit.sinceStart} />
						</span>
					</div>
					<PriceStepChart
						history={unit.history}
						from={now - LONGEST_CHANGE_WINDOW}
						to={now}
					/>
				</section>

				<Separator />

				<section className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">Timeline</h3>
					<ol className="flex flex-col gap-3 text-sm">
						{unit.timeline.map((entry) => (
							<TimelineRow key={`${entry.kind}-${entry.at}`} entry={entry} />
						))}
					</ol>
				</section>

				<Separator />

				<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
					<div className="flex flex-col gap-0.5">
						<dt className="text-muted-foreground text-xs">Floor plan</dt>
						<dd className="-my-2 -ml-1 flex items-center gap-0.5">
							<StarButton
								active={unit.planStarred}
								label={`floor plan ${unit.floorPlan}`}
								onToggle={() => stars.togglePlan(unit.floorPlan)}
							/>
							{unit.floorPlan}
							{unit.planStarred ? (
								<span className="text-muted-foreground text-xs">· starred</span>
							) : null}
						</dd>
					</div>
					<Fact
						label="Layout"
						value={`${bedLabel(unit.beds)} · ${unit.baths} bath`}
					/>
					<Fact label="Size" value={`${unit.sqft.toLocaleString()} sq ft`} />
					<Fact label="Floor" value={String(unit.floor)} />
					<Fact
						label="Faces"
						value={unit.facesI25 ? "I-25" : "Away from I-25"}
					/>
					<Fact
						label="New-unit push"
						value={newUnitPushLabel(unit, unit.unitStarred || unit.planStarred)}
					/>
					{unit.specials !== null ? (
						<Fact label="Special" value={unit.specials} />
					) : null}
				</dl>
			</div>

			<DrawerFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
				<Button asChild variant="outline" className="h-11 md:h-9">
					<a href={HENRY_SITE} target="_blank" rel="noopener noreferrer">
						Floor plans on The Henry's site
						<ExternalLink data-icon="inline-end" />
					</a>
				</Button>
			</DrawerFooter>
		</>
	);
}

/**
 * What `sinceStart` measures from: its very first price point, which is
 * where tracking began or where it first listed (a relisting keeps it).
 */
function sinceLabel(unit: UnitDetails): string {
	if (unit.listedAt === unit.firstSeenAt) return "Since listing";
	return unit.timeline.at(-1)?.kind === "listed"
		? "Since first listed"
		: "Since tracking began";
}

/** "Available now · 16-month lease · $2,662 with fees", or "Off the market Nov 12 · …" once it's gone. */
function terms(unit: UnitDetails, today: string): string {
	const parts = [
		unit.status === "offMarket" && unit.offMarketAt !== null
			? `Off the market ${format(unit.offMarketAt, "MMM d")}`
			: unit.availableOn <= today
				? "Available now"
				: `Available ${format(parseISO(unit.availableOn), "MMM d")}`,
	];
	if (unit.leaseTermMonths !== null) {
		parts.push(`${unit.leaseTermMonths}-month lease`);
	}
	parts.push(`${formatMoney(unit.totalPrice)} with fees`);
	return parts.join(" · ");
}

function TimelineRow({ entry }: { entry: TimelineEntry }): React.ReactElement {
	return (
		<li className="flex items-baseline gap-3">
			<span className="w-14 shrink-0 text-muted-foreground tabular-nums">
				{format(entry.at, "MMM d")}
			</span>
			{entry.kind === "priceChange" ? (
				<>
					<span className="flex-1 tabular-nums">
						{formatMoney(entry.from)} → {formatMoney(entry.to)}
					</span>
					<PriceChange value={entry.to - entry.from} />
				</>
			) : (
				<span className="flex-1 tabular-nums">
					{EVENT_LABELS[entry.kind](formatMoney(entry.price))}
				</span>
			)}
		</li>
	);
}

function Fact({
	label,
	value,
}: {
	label: string;
	value: string;
}): React.ReactElement {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd>{value}</dd>
		</div>
	);
}

function UnknownUnit({
	number,
}: { number: string | null }): React.ReactElement {
	return (
		<>
			<DrawerHeader className="sr-only">
				<DrawerTitle>Apt {number}</DrawerTitle>
			</DrawerHeader>
			<Empty className="flex-1">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<SearchX />
					</EmptyMedia>
					<EmptyTitle>No apt {number}</EmptyTitle>
					<EmptyDescription>
						The Henry hasn't listed a unit with that number since tracking
						began.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</>
	);
}

function UnitDrawerSkeleton({
	number,
}: {
	number: string | null;
}): React.ReactElement {
	return (
		<>
			<DrawerHeader className="gap-2 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
				<DrawerTitle className="font-display text-2xl tabular-nums">
					{number === null ? "Unit" : `Apt ${number}`}
				</DrawerTitle>
				<Skeleton className="h-4 w-56" />
			</DrawerHeader>
			<div className="flex flex-col gap-6 px-4">
				<Skeleton className="h-10 w-40" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</>
	);
}

import { ArrowDown } from "lucide-react";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import {
	DEAL_GRADE_LABELS,
	MIN_REFERENCE_SALES,
	REFERENCE_WINDOW_DAYS,
	type Reference,
} from "~/lib/yugioh/deals";
import type { Marketplace } from "~/lib/yugioh/listing-filters";
import { MARKETPLACE_LABELS, formatMoney } from "~/lib/yugioh/listing-format";
import type { ListingView } from "../_utils/types";

/**
 * A Listing's Deal grade as text, with hue and fill reinforcing it: Great is
 * solid with a down arrow, Good tinted, Fair outlined, Poor plain muted text
 * (overpriced isn't an error). Nothing without a grade.
 */
export function DealGradeBadge({
	deal,
	className,
}: {
	deal: ListingView["deal"];
	className?: string;
}): React.ReactElement | null {
	if (deal.grade === null) return null;
	const label = DEAL_GRADE_LABELS[deal.grade];
	if (deal.grade === "poor") {
		return (
			<span className={cn("text-muted-foreground text-xs", className)}>
				{label}
			</span>
		);
	}
	return (
		<Badge
			variant="outline"
			className={cn(
				"gap-1 font-medium [&>svg]:size-3",
				deal.grade === "great" &&
					"border-transparent bg-deal-great text-deal-great-foreground",
				deal.grade === "good" &&
					"border-transparent bg-deal-good/12 text-deal-good",
				className,
			)}
		>
			{deal.grade === "great" ? <ArrowDown aria-hidden /> : null}
			{label}
		</Badge>
	);
}

/**
 * The grade and "78% of ref" beside it, for Listing rows. `stacked` puts the
 * percent under the grade, for a narrow table column.
 */
export function DealGradeSummary({
	deal,
	stacked = false,
}: {
	deal: ListingView["deal"];
	stacked?: boolean;
}): React.ReactElement | null {
	if (deal.grade === null || deal.percentOfReference === null) return null;
	return (
		<span
			className={cn(
				"flex shrink-0 gap-1.5",
				stacked ? "flex-col items-start gap-1" : "items-center",
			)}
		>
			<DealGradeBadge deal={deal} />
			<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
				{deal.percentOfReference}% of ref
			</span>
		</span>
	);
}

/**
 * One marketplace's Reference price with its evidence: "$54.00 eBay ref ·
 * 11 sales", or "Not enough TCGplayer sales (2 of 3)" when there's too little
 * to go on.
 */
export function ReferenceLine({
	reference,
	marketplace,
	className,
}: {
	reference: Reference;
	marketplace: Marketplace;
	className?: string;
}): React.ReactElement {
	const label = MARKETPLACE_LABELS[marketplace];
	if (reference.price === null) {
		return (
			<span className={cn("text-muted-foreground tabular-nums", className)}>
				Not enough {label} sales ({reference.sales} of {MIN_REFERENCE_SALES})
			</span>
		);
	}
	return (
		<span
			className={cn("tabular-nums", className)}
			title={`Median Per-copy price of Qualifying ${label} sales in the last ${REFERENCE_WINDOW_DAYS} days`}
		>
			{formatMoney(reference.price, "USD")} {label} ref
			<span className="text-muted-foreground">
				{" "}
				· {reference.sales} {reference.sales === 1 ? "sale" : "sales"}
			</span>
		</span>
	);
}

import { CircleHelp, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { rarityAbbreviation } from "~/lib/yugioh/deck";
import { titleFlags } from "~/lib/yugioh/listing-format";
import type { ListingView } from "../_utils/types";

/**
 * Which of my Printings a Listing is for: "Ash Blossom · RA01-EN008 QCSR",
 * "Not a match", an "Unsure" badge, or "Reading title…" while the AI reads it.
 * `stacked` puts the Printing on a second line (the table's narrow column).
 * Either way the Card name keeps its room: a long rarity is cut short first.
 */
export function MatchSummary({
	match,
	stacked = false,
	className,
}: {
	match: ListingView["match"];
	stacked?: boolean;
	className?: string;
}): React.ReactElement {
	if (match.status === "match" && match.printing) {
		const { cardName, setCode, rarity } = match.printing;
		const printing = (
			<>
				<span className="font-mono text-[0.8125rem] tracking-tight">
					{setCode}
				</span>{" "}
				{rarityAbbreviation(rarity)}
			</>
		);
		if (stacked) {
			return (
				<span
					className={cn("flex min-w-0 flex-col", className)}
					title={`${cardName} · ${setCode} ${rarity}`}
				>
					<span className="truncate">{cardName}</span>
					<span className="truncate text-muted-foreground text-xs">
						{printing}
					</span>
				</span>
			);
		}
		return (
			<span
				className={cn("flex min-w-0 items-baseline gap-1", className)}
				title={`${cardName} · ${setCode} ${rarity}`}
			>
				<span className="max-w-full shrink-0 truncate">{cardName}</span>
				<span className="min-w-0 truncate">· {printing}</span>
			</span>
		);
	}
	if (match.status === "unsure") {
		return (
			<Badge
				variant="outline"
				className={cn("gap-1 font-medium [&>svg]:size-3", className)}
			>
				<CircleHelp aria-hidden />
				Unsure
			</Badge>
		);
	}
	return (
		<span className={cn("text-muted-foreground", className)}>
			{match.status === "reading" ? "Reading title…" : "Not a match"}
		</span>
	);
}

/** Flags for what the title says: "PSA 10", "Condition?", "KR", "×3 copies". */
export function TitleFlagBadges({
	titleRead,
	belowCondition,
}: {
	titleRead: ListingView["titleRead"];
	/** Its condition is below the Card's Lowest acceptable condition. */
	belowCondition: boolean;
}): React.ReactElement | null {
	const flags = titleFlags(titleRead, { belowCondition });
	if (flags.length === 0) return null;
	return (
		<div className="flex shrink-0 flex-wrap gap-1">
			{flags.map((flag) => (
				<Badge
					key={flag.kind}
					variant="outline"
					className={cn(
						"gap-1 font-medium tabular-nums [&>svg]:size-3",
						flag.kind === "unknownCondition" && "border-dashed",
						flag.kind === "belowCondition" && "text-muted-foreground",
					)}
					title={FLAG_EXPLANATIONS[flag.kind]}
				>
					{flag.kind === "graded" ? <ShieldCheck aria-hidden /> : null}
					{flag.kind === "unknownCondition" ? <CircleHelp aria-hidden /> : null}
					{flag.label}
				</Badge>
			))}
		</div>
	);
}

const FLAG_EXPLANATIONS: Record<
	ReturnType<typeof titleFlags>[number]["kind"],
	string
> = {
	graded: "Graded copies don't count toward cost to finish",
	unknownCondition: "Title didn't say. Check the photos.",
	belowCondition:
		"Below this Card's Lowest acceptable condition, so it doesn't count",
	language: "Not English, so it doesn't count toward prices",
	lot: "Several Copies in one Listing",
};

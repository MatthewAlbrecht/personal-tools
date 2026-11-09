import { ArrowDown, ArrowUp } from "lucide-react";
import type * as React from "react";
import { CHANGE_WINDOWS, type PriceChanges } from "~/lib/henry/changes";
import { formatMoney } from "~/lib/henry/units";
import { cn } from "~/lib/utils";

/** A price change: drops in the good-deal color with a down arrow, rises muted with an up arrow, none "–". */
export function PriceChange({
	value,
	className,
}: {
	value: number;
	className?: string;
}): React.ReactElement {
	if (value === 0) {
		return (
			<span className={cn("text-muted-foreground tabular-nums", className)}>
				<span aria-hidden>–</span>
				<span className="sr-only">No change</span>
			</span>
		);
	}
	const down = value < 0;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 font-medium tabular-nums",
				down ? "text-deal-good" : "text-muted-foreground",
				className,
			)}
		>
			{down ? (
				<ArrowDown aria-hidden className="size-3.5" />
			) : (
				<ArrowUp aria-hidden className="size-3.5" />
			)}
			<span className="sr-only">{down ? "Down" : "Up"}</span>
			{formatMoney(Math.abs(value))}
		</span>
	);
}

/** The drawer's 3 / 7 / 14 day changes. */
export function PriceChangeTrio({
	changes,
}: {
	changes: PriceChanges;
}): React.ReactElement {
	return (
		<dl className="grid grid-cols-3 gap-2 text-sm">
			{CHANGE_WINDOWS.map((days) => (
				<div key={days} className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">{days} days</dt>
					<dd>
						<PriceChange value={changes[`d${days}`]} />
					</dd>
				</div>
			))}
		</dl>
	);
}

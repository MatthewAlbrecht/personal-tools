import { format } from "date-fns";
import type * as React from "react";
import type { PriceAt } from "~/lib/henry/changes";
import { formatMoney } from "~/lib/henry/units";

const WIDTH = 100;
const HEIGHT = 40;
/** Room above and below the line so its stroke and end dot aren't clipped. */
const INSET = 3;

/**
 * Base rent as a step line from `from` to `to`: flat between changes, a
 * vertical step at each one. When the first price point is later than `from`
 * (tracking or listing began inside the window), the axis starts there
 * instead of leaving the time before it blank.
 */
export function PriceStepChart({
	history,
	from,
	to,
}: {
	/** Oldest first. */
	history: readonly PriceAt[];
	from: number;
	to: number;
}): React.ReactElement | null {
	const steps = stepsBetween(history, from, to);
	const first = steps[0];
	const last = steps.at(-1);
	if (!first || !last) return null;

	const prices = steps.map((step) => step.price);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	const span = Math.max(to - first.at, 1);
	const x = (at: number): number => ((at - first.at) / span) * WIDTH;
	const y = (price: number): number =>
		max === min
			? HEIGHT / 2
			: INSET + (1 - (price - min) / (max - min)) * (HEIGHT - 2 * INSET);
	const path = steps
		.map(
			(step, i) =>
				`${i === 0 ? "M" : "L"}${x(step.at).toFixed(2)},${y(step.price).toFixed(2)}`,
		)
		.join(" ");

	return (
		<figure className="flex flex-col gap-1.5">
			<div className="relative h-24 w-full">
				<svg
					viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					preserveAspectRatio="none"
					className="absolute inset-0 size-full overflow-visible text-foreground"
					role="img"
					aria-label={`From ${formatMoney(first.price)} on ${format(first.at, "MMM d")} to ${formatMoney(last.price)} now; low ${formatMoney(min)}, high ${formatMoney(max)}`}
				>
					<line
						x1={0}
						x2={WIDTH}
						y1={HEIGHT}
						y2={HEIGHT}
						className="stroke-border"
						vectorEffect="non-scaling-stroke"
					/>
					<path
						d={path}
						fill="none"
						stroke="currentColor"
						strokeWidth={1.75}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{/* The end dot as HTML so the stretched viewBox doesn't squash it. */}
				<span
					aria-hidden
					className="-translate-x-1/2 -translate-y-1/2 absolute size-2 rounded-full bg-foreground"
					style={{
						left: `${(x(last.at) / WIDTH) * 100}%`,
						top: `${(y(last.price) / HEIGHT) * 100}%`,
					}}
				/>
			</div>
			<figcaption className="flex justify-between text-muted-foreground text-xs tabular-nums">
				<span>{format(first.at, "MMM d")}</span>
				{max !== min ? (
					<span>
						{formatMoney(min)}–{formatMoney(max)}
					</span>
				) : null}
				<span>Today</span>
			</figcaption>
		</figure>
	);
}

/** The step line's corners: the price in force at the start, then a riser and tread per change. */
function stepsBetween(
	history: readonly PriceAt[],
	from: number,
	to: number,
): PriceAt[] {
	const firstPoint = history[0];
	if (!firstPoint) return [];
	const start = Math.max(from, firstPoint.at);
	let price = firstPoint.price;
	for (const point of history) {
		if (point.at <= start) price = point.price;
	}
	const steps: PriceAt[] = [{ at: start, price }];
	for (const point of history) {
		if (point.at <= start || point.at > to) continue;
		steps.push({ at: point.at, price });
		steps.push(point);
		price = point.price;
	}
	steps.push({ at: to, price });
	return steps;
}

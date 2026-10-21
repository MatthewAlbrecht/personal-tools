import type * as React from "react";
import { Progress } from "~/components/ui/progress";

/** Copies owned / needed as a bar with "23 / 40 Copies" right-aligned. */
export function DeckProgress({
	copiesOwned,
	copiesNeeded,
}: {
	copiesOwned: number;
	copiesNeeded: number;
}): React.ReactElement {
	const label = `${copiesOwned} / ${copiesNeeded} ${copiesNeeded === 1 ? "Copy" : "Copies"}`;
	return (
		<Progress
			value={copiesOwned}
			max={Math.max(copiesNeeded, 1)}
			aria-label="Copies owned"
			getAriaValueText={() => `${label} owned`}
		>
			<span className="ml-auto text-muted-foreground text-sm tabular-nums">
				{label}
			</span>
		</Progress>
	);
}

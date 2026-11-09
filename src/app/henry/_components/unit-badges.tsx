import type * as React from "react";
import { Badge } from "~/components/ui/badge";

/** "New · Nd" while it's new this week, and "I-25 side" for highway-facing units. */
export function UnitBadges({
	unit,
}: {
	unit: { newDays: number | null; facesI25: boolean };
}): React.ReactElement | null {
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

"use client";

import { DollarSign, ThumbsUp, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
	buildGoogleSearchUrl,
	formatConcertStatusLabel,
	formatEventDate,
} from "../_utils/formatters";
import type { ConcertEventRow, ConcertUserStatus } from "../_utils/types";

export function UpcomingShowsList({
	includeInterested,
	isLoading,
	onIncludeInterestedChange,
	onStatusChange,
	rows,
}: {
	includeInterested: boolean;
	isLoading: boolean;
	onIncludeInterestedChange: (includeInterested: boolean) => void;
	onStatusChange: (row: ConcertEventRow, userStatus: ConcertUserStatus) => void;
	rows: ConcertEventRow[];
}) {
	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading shows...</p>;
	}

	return (
		<div className="flex flex-col gap-4">
			<label className="flex items-center gap-2 text-sm">
				<input
					checked={includeInterested}
					onChange={(event) =>
						onIncludeInterestedChange(event.currentTarget.checked)
					}
					type="checkbox"
				/>
				Show interested
			</label>

			{rows.length === 0 ? (
				<Card>
					<CardContent className="text-muted-foreground text-sm">
						{includeInterested
							? "No upcoming owned or interested shows."
							: "No upcoming ticketed shows."}
					</CardContent>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{rows.map((row) => (
						<UpcomingShowRow
							key={row._id}
							onStatusChange={(userStatus) => onStatusChange(row, userStatus)}
							row={row}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function UpcomingShowRow({
	onStatusChange,
	row,
}: {
	onStatusChange: (userStatus: ConcertUserStatus) => void;
	row: ConcertEventRow;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-medium">{row.event.name}</p>
						<Badge variant={row.userStatus === "owned" ? "default" : "outline"}>
							{formatConcertStatusLabel(row.userStatus)}
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">
						{formatEventDate(row.event)} | {row.venue.name}
					</p>
					{row.event.attractionNames.length > 0 ? (
						<p className="text-muted-foreground text-sm">
							{row.event.attractionNames.join(", ")}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						aria-label="Mark as owned"
						onClick={() => onStatusChange("owned")}
						size="icon"
						title="Owned"
						type="button"
						variant={row.userStatus === "owned" ? "default" : "outline"}
					>
						<DollarSign className="size-4" />
					</Button>
					<Button
						aria-label="Mark as interested"
						onClick={() => onStatusChange("interested")}
						size="icon"
						title="Interested"
						type="button"
						variant={row.userStatus === "interested" ? "default" : "outline"}
					>
						<ThumbsUp className="size-4" />
					</Button>
					<Button
						aria-label="Ignore event"
						onClick={() => onStatusChange("ignored")}
						size="icon"
						title="Ignore"
						type="button"
						variant={row.userStatus === "ignored" ? "destructive" : "outline"}
					>
						<X className="size-4" />
					</Button>
					<Button asChild size="sm" variant="outline">
						<a
							href={buildGoogleSearchUrl(`${row.event.name} ${row.venue.name}`)}
							rel="noreferrer"
							target="_blank"
						>
							Search
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

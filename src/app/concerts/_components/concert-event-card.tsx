"use client";

import { DollarSign, ThumbsUp, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { buildGoogleSearchUrl, formatEventDate } from "../_utils/formatters";
import type { ConcertEventRow, ConcertUserStatus } from "../_utils/types";

export function ConcertEventCard({
	row,
	collapsedCount,
	dateLabel,
	onStatusChange,
	title,
	venueName,
}: {
	row: ConcertEventRow;
	collapsedCount?: number;
	dateLabel?: string;
	onStatusChange: (userStatus: ConcertUserStatus) => void;
	title?: string;
	venueName?: string;
}) {
	const eventTitle = title ?? row.event.name;
	const displayVenueName = venueName ?? row.venue.name;

	return (
		<Card className="flex h-full flex-col overflow-hidden">
			{row.event.imageUrl ? (
				<img
					alt=""
					className="h-40 w-full object-cover"
					src={row.event.imageUrl}
				/>
			) : null}
			<CardHeader>
				<CardTitle className="leading-snug">{eventTitle}</CardTitle>
				<CardDescription>
					{dateLabel ?? formatEventDate(row.event)} | {displayVenueName}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-3 text-sm">
				{row.event.attractionNames.length > 0 ? (
					<p className="text-muted-foreground">
						Artists: {row.event.attractionNames.join(", ")}
					</p>
				) : null}
				{collapsedCount && collapsedCount > 1 ? (
					<p className="text-muted-foreground">
						{collapsedCount} Ticketmaster variants collapsed
					</p>
				) : null}
				<div className="mt-auto flex items-center justify-between gap-3">
					<div className="flex items-center gap-1">
						<Button
							aria-label="Mark as owned"
							onClick={() => onStatusChange("owned")}
							size="icon"
							title="Owned"
							type="button"
							variant={row.userStatus === "owned" ? "default" : "outline"}
						>
							<DollarSign />
						</Button>
						<Button
							aria-label="Mark as interested"
							onClick={() => onStatusChange("interested")}
							size="icon"
							title="Interested"
							type="button"
							variant={row.userStatus === "interested" ? "default" : "outline"}
						>
							<ThumbsUp />
						</Button>
						<Button
							aria-label="Ignore event"
							onClick={() => onStatusChange("ignored")}
							size="icon"
							title="Ignore"
							type="button"
							variant={row.userStatus === "ignored" ? "destructive" : "outline"}
						>
							<X />
						</Button>
					</div>
					<Button asChild size="sm" variant="outline">
						<a
							href={buildGoogleSearchUrl(`${eventTitle} ${displayVenueName}`)}
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

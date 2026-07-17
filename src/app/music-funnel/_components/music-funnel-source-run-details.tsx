"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { sortSourceRunEncounterDetails } from "~/lib/music-funnel-source-run-details";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function MusicFunnelSourceRunDetails({
	userId,
	sourceRunId,
}: {
	userId: string;
	sourceRunId: Id<"musicFunnelSourceRuns">;
}) {
	const details = useQuery(api.musicFunnel.listSourceRunEncounters, {
		userId,
		sourceRunId,
	});

	if (details === undefined) {
		return <p className="text-muted-foreground text-sm">Loading tracks…</p>;
	}

	const repeatWriteTrackIds = new Set(details.repeatWriteTrackIds);
	const encounters = sortSourceRunEncounterDetails(
		details.encounters,
		repeatWriteTrackIds,
	);

	if (encounters.length === 0) {
		return <p className="text-muted-foreground text-sm">No new tracks.</p>;
	}

	return (
		<ul className="space-y-2">
			{encounters.map((encounter) => {
				const isRepeat = repeatWriteTrackIds.has(encounter.spotifyTrackId);
				return (
					<li key={encounter._id} className="flex items-center gap-2.5">
						{encounter.albumImageUrl ? (
							<Image
								src={encounter.albumImageUrl}
								alt={encounter.albumName}
								width={28}
								height={28}
								className="size-7 shrink-0 rounded border border-border/60 bg-background object-cover"
							/>
						) : (
							<div className="size-7 shrink-0 rounded border border-border/60 bg-muted" />
						)}
						<div className="min-w-0 flex-1">
							<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
								<span className="truncate font-medium">
									{encounter.trackName}
								</span>
								{isRepeat ? (
									<span className="inline-flex shrink-0 items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-1.5 py-px font-medium text-[10px] leading-none text-violet-700 dark:text-violet-300">
										Repeat
									</span>
								) : null}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{encounter.primaryArtistName}
							</p>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

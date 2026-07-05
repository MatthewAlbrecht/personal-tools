"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

export function MusicFunnelTimeline({
	userId,
	sources,
}: {
	userId: string;
	sources: Doc<"musicFunnelSources">[] | undefined;
}) {
	const sourceRuns = useQuery(api.musicFunnel.listRecentSourceRuns, {
		userId,
		limit: 50,
	});

	const sourceById = new Map(
		(sources ?? []).map((source) => [source._id, source]),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Timeline</CardTitle>
				<CardDescription>
					Playlist sync history — tracks scanned from each source.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{sourceRuns === undefined ? (
					<p className="text-muted-foreground text-sm">Loading timeline...</p>
				) : sourceRuns.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No syncs yet. Configure sources and run a sync.
					</p>
				) : (
					<ol className="relative space-y-0 border-muted border-l pl-6">
						{sourceRuns.map((sourceRun) => {
							const source = sourceById.get(sourceRun.sourceId);
							return (
								<li key={sourceRun._id} className="pb-6">
									<span className="-left-[5px] absolute mt-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
									<div className="flex items-start gap-3">
										{source?.imageUrl ? (
											<Image
												src={source.imageUrl}
												alt={sourceRun.sourceDisplayName}
												width={48}
												height={48}
												className="size-12 shrink-0 rounded object-cover"
											/>
										) : (
											<div className="size-12 shrink-0 rounded bg-muted" />
										)}
										<div className="min-w-0 flex-1">
											<p className="font-medium">
												{sourceRun.sourceDisplayName}
											</p>
											<p className="text-muted-foreground text-sm">
												{formatSourceRunSummary(sourceRun)}
											</p>
											<p className="mt-1 text-muted-foreground text-xs">
												{formatTimelineDate(sourceRun.startedAt)}
												{sourceRun.status === "failed" && (
													<span className="text-destructive">
														{" · "}
														Sync failed
													</span>
												)}
											</p>
										</div>
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}

function formatSourceRunSummary(
	sourceRun: Doc<"musicFunnelSourceRuns">,
): string {
	const trackLabel =
		sourceRun.tracksFetched === 1 ? "track" : "tracks";
	let summary = `${sourceRun.tracksFetched} ${trackLabel} synced`;

	if (sourceRun.alreadySeenFromSource > 0) {
		const dupLabel =
			sourceRun.alreadySeenFromSource === 1 ? "duplicate" : "duplicates";
		summary += ` (${sourceRun.alreadySeenFromSource} ${dupLabel})`;
	}

	if (sourceRun.newEncounters > 0) {
		const newLabel = sourceRun.newEncounters === 1 ? "new track" : "new tracks";
		summary += ` · ${sourceRun.newEncounters} ${newLabel}`;
	}

	return summary;
}

function formatTimelineDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

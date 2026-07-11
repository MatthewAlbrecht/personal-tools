"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { sourceRunHasActivity } from "~/lib/music-funnel-visit";
import { formatRelativeTime } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	MusicFunnelNewBadge,
	MusicFunnelNewChrome,
} from "./music-funnel-new-chrome";

export function MusicFunnelTimeline({
	userId,
	sources,
	visitSince,
}: {
	userId: string;
	sources: Doc<"musicFunnelSources">[] | undefined;
	visitSince: number | null;
}) {
	const sourceRuns = useQuery(api.musicFunnel.listRecentSourceRuns, {
		userId,
		limit: 50,
	});

	const sourceById = new Map(
		(sources ?? []).map((source) => [source._id, source]),
	);

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-semibold text-lg">Timeline</h2>
				<p className="text-muted-foreground text-sm">
					Playlist sync history — tracks scanned from each source.
				</p>
			</div>
			{sourceRuns === undefined ? (
				<p className="text-muted-foreground text-sm">Loading timeline...</p>
			) : sourceRuns.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No syncs yet. Configure sources and run a sync.
				</p>
			) : (
				<ol className="relative space-y-0 border-muted border-l pl-5">
					{sourceRuns.map((sourceRun) => {
						const source = sourceById.get(sourceRun.sourceId);
						const isNew =
							visitSince !== null &&
							sourceRun.startedAt > visitSince &&
							sourceRunHasActivity(sourceRun);
						return (
							<li key={sourceRun._id} className="pb-4">
								<span className="-left-[4px] absolute mt-1.5 size-2 rounded-full bg-foreground" />
								<MusicFunnelNewChrome isNew={isNew}>
									<div className="flex items-start gap-3">
										{source?.imageUrl ? (
											<Image
												src={source.imageUrl}
												alt={sourceRun.sourceDisplayName}
												width={40}
												height={40}
												className="size-10 shrink-0 rounded object-cover"
											/>
										) : (
											<div className="size-10 shrink-0 rounded bg-muted" />
										)}
										<div className="min-w-0 flex-1">
											<p className="flex flex-wrap items-baseline gap-x-2 font-medium">
												{sourceRun.sourceDisplayName}
												{isNew ? <MusicFunnelNewBadge /> : null}
											</p>
											<p className="text-muted-foreground text-sm">
												{formatSourceRunSummary(sourceRun)}
											</p>
											<p className="text-muted-foreground text-xs">
												{formatRelativeTime(sourceRun.startedAt)}
												{sourceRun.status === "failed" && (
													<span className="text-destructive">
														{" · "}
														Sync failed
													</span>
												)}
											</p>
										</div>
									</div>
								</MusicFunnelNewChrome>
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}

function formatSourceRunSummary(
	sourceRun: Doc<"musicFunnelSourceRuns">,
): string {
	const trackLabel = sourceRun.tracksFetched === 1 ? "track" : "tracks";
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

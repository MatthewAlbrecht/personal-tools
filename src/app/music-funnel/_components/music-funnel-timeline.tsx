"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { sourceRunHasActivity } from "~/lib/music-funnel-visit";
import { cn, formatRelativeTime } from "~/lib/utils";
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
							<li key={sourceRun._id}>
								<span
									className={cn(
										"-left-[4px] absolute mt-4 size-2 rounded-full",
										isNew ? "bg-amber-500" : "bg-foreground",
									)}
								/>
								<MusicFunnelNewChrome
									isNew={isNew}
									accent="none"
									className="-ml-2 pl-2"
								>
									<div className="flex items-start gap-3">
										{source?.imageUrl ? (
											<Image
												src={source.imageUrl}
												alt={sourceRun.sourceDisplayName}
												width={40}
												height={40}
												className="size-10 shrink-0 rounded border border-border/60 bg-background object-cover"
											/>
										) : (
											<div className="size-10 shrink-0 rounded border border-border/60 bg-muted" />
										)}
										<div className="min-w-0 flex-1">
											<p className="flex flex-wrap items-baseline gap-x-2 font-medium">
												{sourceRun.sourceDisplayName}
												{isNew ? <MusicFunnelNewBadge /> : null}
											</p>
											<p className="text-muted-foreground text-sm">
												{formatSourceRunSummary(sourceRun)}
												{" · "}
												{formatRelativeTime(sourceRun.startedAt)}
												{sourceRun.status === "failed" ? (
													<span className="text-destructive">
														{" · "}
														Sync failed
													</span>
												) : null}
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
	const count = sourceRun.newEncounters;
	if (count === 1) return "1 new track";
	return `${count} new tracks`;
}

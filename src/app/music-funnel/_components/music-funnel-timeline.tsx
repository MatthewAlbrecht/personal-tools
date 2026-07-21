"use client";

import { useQuery } from "convex/react";
import { Disc3 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { sourceRunHasActivity } from "~/lib/music-funnel-visit";
import { cn, formatRelativeTime } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	MusicFunnelNewBadge,
	MusicFunnelNewChrome,
} from "./music-funnel-new-chrome";
import { MusicFunnelSourceRunDetails } from "./music-funnel-source-run-details";

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
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

	const sourceById = new Map(
		(sources ?? []).map((source) => [source._id, source]),
	);

	const visibleRuns =
		sourceRuns === undefined
			? undefined
			: sourceRuns.filter((run) => run.newEncounters > 0);

	function toggleExpanded(sourceRunId: string) {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(sourceRunId)) {
				next.delete(sourceRunId);
			} else {
				next.add(sourceRunId);
			}
			return next;
		});
	}

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
			) : visibleRuns !== undefined && visibleRuns.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No syncs with new tracks yet.
				</p>
			) : (
				<ol className="relative space-y-0 border-muted border-l pl-5">
					{(visibleRuns ?? []).map((sourceRun) => {
						const source = sourceById.get(sourceRun.sourceId);
						const isExpanded = expandedIds.has(sourceRun._id);
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
									<button
										type="button"
										onClick={() => toggleExpanded(sourceRun._id)}
										className="flex w-full items-start gap-3 text-left"
									>
										{source?.imageUrl ? (
											<Image
												src={source.imageUrl}
												alt={sourceRun.sourceDisplayName}
												width={40}
												height={40}
												className="size-10 shrink-0 rounded border border-border/60 bg-background object-cover"
											/>
										) : (
											<div className="flex size-10 shrink-0 items-center justify-center rounded border border-border/60 bg-muted text-muted-foreground">
												<Disc3 aria-hidden="true" className="size-5" />
											</div>
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
									</button>
									{isExpanded ? (
										<div className="mt-3">
											<MusicFunnelSourceRunDetails
												userId={userId}
												sourceRunId={sourceRun._id}
											/>
										</div>
									) : null}
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

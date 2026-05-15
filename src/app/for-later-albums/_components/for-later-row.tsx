"use client";

import { Disc3, ExternalLink } from "lucide-react";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { ForLaterAlbumRowData } from "../_utils/types";

export function ForLaterRow({ row }: { row: ForLaterAlbumRowData }) {
	return (
		<article className="rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
			<div className="flex gap-3">
				<div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
					{row.imageUrl ? (
						<Image
							src={row.imageUrl}
							alt={row.name}
							fill
							className="object-cover"
							sizes="64px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="h-7 w-7 text-muted-foreground/60" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div className="min-w-0">
							<h2 className="truncate font-semibold text-base">{row.name}</h2>
							<p className="truncate text-muted-foreground text-sm">
								{row.artistName}
								{row.releaseYear ? ` · ${row.releaseYear}` : ""}
							</p>
							<p className="text-muted-foreground text-xs">
								Added {formatDate(row.playlistAddedAt ?? row.firstSeenAt)} ·
								Seen {formatDate(row.lastSeenAt)}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2 md:justify-end">
							<Badge variant={row.isActive ? "default" : "secondary"}>
								{row.isActive ? "Active" : "Removed"}
							</Badge>
							<ListenBadge row={row} />
							<RymStatusBadge row={row} />
							{row.rymMatchMethod ? (
								<Badge variant="outline">{row.rymMatchMethod}</Badge>
							) : null}
							{row.rymUrl ? (
								<Button asChild size="sm" variant="outline" className="gap-1">
									<a href={row.rymUrl} target="_blank" rel="noreferrer">
										<ExternalLink className="h-3.5 w-3.5" />
										RYM
									</a>
								</Button>
							) : null}
						</div>
					</div>
					<TagGroups row={row} />
					{row.rymDiscoveryReason ? (
						<p className="line-clamp-2 text-muted-foreground text-xs">
							{row.rymDiscoveryReason}
						</p>
					) : null}
				</div>
			</div>
		</article>
	);
}

function ListenBadge({ row }: { row: ForLaterAlbumRowData }) {
	if (!row.hasListened) {
		return <Badge variant="outline">Not listened</Badge>;
	}

	return (
		<Badge variant="secondary">
			Listened {row.listenCount}x
			{row.lastListenedAt ? ` · ${formatDate(row.lastListenedAt)}` : ""}
		</Badge>
	);
}

function RymStatusBadge({ row }: { row: ForLaterAlbumRowData }) {
	const className = cn(
		row.rymStatus === "matched" && "border-emerald-500/40 text-emerald-600",
		row.rymStatus === "candidate" && "border-blue-500/40 text-blue-600",
		row.rymStatus === "failed" && "border-destructive/40 text-destructive",
	);

	return (
		<Badge variant="outline" className={className}>
			{formatRymStatus(row.rymStatus)}
			{row.rymCandidateConfidence ? ` · ${row.rymCandidateConfidence}` : ""}
		</Badge>
	);
}

function TagGroups({ row }: { row: ForLaterAlbumRowData }) {
	return (
		<div className="space-y-1">
			<TagLine label="Primary" tags={row.primaryGenres} />
			<TagLine label="Secondary" tags={row.secondaryGenres} />
			<TagLine label="Descriptors" tags={row.descriptors} />
		</div>
	);
}

function TagLine({
	label,
	tags,
}: {
	label: string;
	tags: Array<{ key: string; label: string }>;
}) {
	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5 text-xs">
			<span className="mr-1 text-muted-foreground">{label}</span>
			{tags.map((tag) => (
				<Badge key={tag.key} variant="secondary" className="font-normal">
					{tag.label}
				</Badge>
			))}
		</div>
	);
}

function formatRymStatus(status: ForLaterAlbumRowData["rymStatus"]): string {
	const labels: Record<ForLaterAlbumRowData["rymStatus"], string> = {
		matched: "RYM matched",
		candidate: "Candidate found",
		searching: "Searching",
		not_found: "Not found",
		failed: "Failed",
		not_started: "Not started",
	};
	return labels[status];
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

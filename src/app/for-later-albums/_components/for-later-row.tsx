"use client";

import { Disc3, ExternalLink } from "lucide-react";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { buildGoogleRateYourMusicSearchUrl } from "../../../../convex/_utils/google_rym_lucky_search";
import type { ForLaterAlbumRowData } from "../_utils/types";

function googleRymSearchUrl(row: ForLaterAlbumRowData): string {
	return buildGoogleRateYourMusicSearchUrl({
		artistName: row.artistName,
		albumName: row.name,
	});
}

export function ForLaterRow({
	row,
	onAddGenreKey,
	onAddDescriptorKey,
}: {
	row: ForLaterAlbumRowData;
	onAddGenreKey?: (key: string) => void;
	onAddDescriptorKey?: (key: string) => void;
}) {
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
							<ListenBadge row={row} />
							{row.rymStatus !== "matched" ? (
								<RymStatusBadge row={row} />
							) : null}
							{!row.rymUrl?.trim() ? (
								<Button asChild size="sm" variant="secondary" className="gap-1">
									<a
										href={googleRymSearchUrl(row)}
										target="_blank"
										rel="noreferrer"
									>
										<ExternalLink className="h-3.5 w-3.5" />
										Google RYM
									</a>
								</Button>
							) : null}
							{row.rymUrl ? (
								<Button asChild size="sm" variant="outline" className="gap-1">
									<a
										href={row.rymUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										<ExternalLink className="h-3.5 w-3.5" />
										RYM
									</a>
								</Button>
							) : null}
						</div>
					</div>
					<TagGroups
						row={row}
						onAddGenreKey={onAddGenreKey}
						onAddDescriptorKey={onAddDescriptorKey}
					/>
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

function TagGroups({
	row,
	onAddGenreKey,
	onAddDescriptorKey,
}: {
	row: ForLaterAlbumRowData;
	onAddGenreKey?: (key: string) => void;
	onAddDescriptorKey?: (key: string) => void;
}) {
	return (
		<div className="space-y-1">
			<TagLine
				label="Primary"
				tags={row.primaryGenres}
				variant="primary"
				onPickTag={onAddGenreKey}
			/>
			<TagLine
				label="Secondary"
				tags={row.secondaryGenres}
				variant="secondary"
				onPickTag={onAddGenreKey}
			/>
			<TagLine
				label="Descriptors"
				tags={row.descriptors}
				variant="descriptors"
				onPickTag={onAddDescriptorKey}
			/>
		</div>
	);
}

function TagLine({
	label,
	tags,
	variant,
	onPickTag,
}: {
	label: string;
	tags: Array<{ key: string; label: string }>;
	variant: "primary" | "secondary" | "descriptors";
	onPickTag?: (key: string) => void;
}) {
	if (tags.length === 0) {
		return null;
	}

	const body = tags.map((tag, index) => (
		<span key={tag.key}>
			{index > 0 ? ", " : null}
			{onPickTag ? (
				<button
					type="button"
					className={cn(
						"cursor-pointer rounded-xs text-left underline-offset-2 hover:underline",
						variant === "descriptors" && "text-muted-foreground",
					)}
					onClick={() => onPickTag(tag.key)}
				>
					{tag.label}
				</button>
			) : (
				tag.label
			)}
		</span>
	));

	if (variant === "descriptors") {
		return (
			<p className="text-muted-foreground text-xs">
				<span className="text-muted-foreground">{label}: </span>
				{body}
			</p>
		);
	}

	return (
		<p
			className={cn(
				variant === "primary" && "text-sm",
				variant === "secondary" && "text-xs",
			)}
		>
			<span className="text-muted-foreground">{label}: </span>
			{body}
		</p>
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

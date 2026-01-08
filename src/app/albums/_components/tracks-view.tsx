"use client";

import { ChevronDown, ChevronUp, Disc3 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatRelativeTime } from "../_utils/formatters";
import { type TrackGroup, groupTracksByAlbum } from "../_utils/group-tracks";
import type { TrackItem } from "../_utils/types";

type TracksViewProps = {
	tracks: TrackItem[];
	isLoading: boolean;
	onAddListen: (track: TrackItem) => void;
};

export function TracksView({
	tracks,
	isLoading,
	onAddListen,
}: TracksViewProps) {
	const groups = useMemo(() => groupTracksByAlbum(tracks), [tracks]);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading tracks...</p>
			</div>
		);
	}

	if (tracks.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">
						No recently played tracks
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Click "Sync Albums" to start tracking your listening history
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-1">
			{groups.map((group) => {
				const firstTrack = group.tracks[0];
				if (!firstTrack) return null;

				return (
					<TrackGroupCard
						key={group.id}
						group={group}
						onAddListen={() => onAddListen(firstTrack)}
					/>
				);
			})}
		</div>
	);
}

function TrackGroupCard({
	group,
	onAddListen,
}: {
	group: TrackGroup;
	onAddListen: () => void;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const timeAgo = formatRelativeTime(group.startTime);
	const trackCount = group.tracks.length;
	const isMultiple = trackCount > 1;
	const firstTrack = group.tracks[0];

	return (
		<div className="rounded-lg transition-colors hover:bg-muted/50">
			{/* Main Row */}
			<div className="flex w-full items-center gap-3 p-2">
				{/* Album Cover - stacked effect for multiple tracks */}
				<StackedAlbumArt
					imageUrl={group.albumImageUrl}
					alt={group.albumName ?? "Album"}
					isStacked={isMultiple}
				/>

				{/* Track/Album Info */}
				<div className="min-w-0 flex-1">
					{isMultiple ? (
						<>
							<p className="truncate font-medium text-sm">
								{group.albumName ?? "Unknown Album"}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{group.artistName} · {trackCount} tracks
							</p>
						</>
					) : (
						<>
							<p className="truncate font-medium text-sm">
								{firstTrack?.trackName}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{group.artistName}
								{group.albumName && (
									<span className="text-muted-foreground/60">
										{" "}
										· {group.albumName}
									</span>
								)}
							</p>
						</>
					)}
				</div>

				{/* Add Listen Button */}
				{group.spotifyAlbumId && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onAddListen();
						}}
						className="inline-flex items-center rounded-full border border-muted-foreground/20 border-dashed px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
						title="Add album listen"
					>
						+ Listen
					</button>
				)}

				{/* Expand/Collapse for multiple tracks */}
				{isMultiple && (
					<button
						type="button"
						onClick={() => setIsExpanded(!isExpanded)}
						className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground"
					>
						{isExpanded ? (
							<ChevronUp className="h-4 w-4" />
						) : (
							<ChevronDown className="h-4 w-4" />
						)}
					</button>
				)}

				{/* Timestamp */}
				<span className="flex-shrink-0 text-muted-foreground text-xs">
					{timeAgo}
				</span>
			</div>

			{/* Expanded Track List */}
			{isExpanded && isMultiple && (
				<div className="border-muted-foreground/10 border-t pr-2 pb-2 pl-16">
					{group.tracks.map((track) => (
						<div key={track._id} className="py-1 text-muted-foreground text-xs">
							{track.trackName}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function StackedAlbumArt({
	imageUrl,
	alt,
	isStacked,
}: {
	imageUrl?: string;
	alt: string;
	isStacked: boolean;
}) {
	if (!isStacked) {
		// Single track - just show the album art
		return (
			<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
				{imageUrl ? (
					<img
						src={imageUrl}
						alt={alt}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>
		);
	}

	// Multiple tracks - stacked effect with more visual pop
	return (
		<div className="relative h-11 w-14 flex-shrink-0">
			{/* Back layer - more offset and slight rotation */}
			<div
				className="absolute top-0 left-4 h-9 w-9 overflow-hidden rounded bg-muted shadow-sm"
				style={{ transform: "rotate(6deg)" }}
			>
				{imageUrl ? (
					<img src={imageUrl} alt="" className="h-full w-full object-cover" />
				) : (
					<div className="h-full w-full bg-muted" />
				)}
			</div>
			{/* Middle layer */}
			<div
				className="absolute top-0.5 left-2 h-9 w-9 overflow-hidden rounded bg-muted shadow-sm"
				style={{ transform: "rotate(3deg)" }}
			>
				{imageUrl ? (
					<img src={imageUrl} alt="" className="h-full w-full object-cover" />
				) : (
					<div className="h-full w-full bg-muted" />
				)}
			</div>
			{/* Front layer */}
			<div className="absolute top-1 left-0 h-9 w-9 overflow-hidden rounded bg-muted shadow-md">
				{imageUrl ? (
					<img
						src={imageUrl}
						alt={alt}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>
		</div>
	);
}

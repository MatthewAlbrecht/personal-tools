"use client";

import { Disc3 } from "lucide-react";
import { formatRelativeTime } from "../_utils/formatters";
import type { TrackItem } from "../_utils/types";

type TracksViewProps = {
	tracks: TrackItem[];
	isLoading: boolean;
	onAddListen: (track: TrackItem) => void;
};

export function TracksView({ tracks, isLoading, onAddListen }: TracksViewProps) {
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
			{tracks.map((track) => (
				<TrackCard
					key={track._id}
					track={track}
					onAddListen={() => onAddListen(track)}
				/>
			))}
		</div>
	);
}

function TrackCard({
	track,
	onAddListen,
}: {
	track: TrackItem;
	onAddListen: () => void;
}) {
	const timeAgo = track.lastPlayedAt
		? formatRelativeTime(track.lastPlayedAt)
		: null;

	return (
		<div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
			{/* Album Cover */}
			<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
				{track.albumImageUrl ? (
					<img
						src={track.albumImageUrl}
						alt={track.albumName ?? track.trackName}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>

			{/* Track Info */}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm">{track.trackName}</p>
				<p className="truncate text-muted-foreground text-xs">
					{track.artistName}
					{track.albumName && (
						<span className="text-muted-foreground/60">
							{" "}
							· {track.albumName}
						</span>
					)}
				</p>
			</div>

			{/* Add Listen Button */}
			{track.spotifyAlbumId && (
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

			{/* Timestamp */}
			{timeAgo && (
				<span className="flex-shrink-0 text-muted-foreground text-xs">
					{timeAgo}
				</span>
			)}
		</div>
	);
}


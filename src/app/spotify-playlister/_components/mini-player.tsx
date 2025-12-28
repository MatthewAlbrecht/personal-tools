"use client";

import { Pause, Play, SkipForward } from "lucide-react";
import type { PlayerState, SpotifyTrack } from "../_utils/types";

export function MiniPlayer({
	playerState,
	currentTrack,
	onTogglePlayback,
	onSkip,
}: {
	playerState: PlayerState;
	currentTrack: SpotifyTrack | null;
	onTogglePlayback: (trackUri: string) => void;
	onSkip?: (seconds: number) => void;
}) {
	// Don't render if no track has been played yet
	if (!currentTrack) return null;

	const isPlaying =
		playerState.isPlaying && playerState.currentTrackId === currentTrack.id;
	const albumImage =
		currentTrack.album.images[currentTrack.album.images.length - 1]?.url;

	return (
		<div className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
			{/* Album art */}
			<div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded">
				{albumImage ? (
					<img
						src={albumImage}
						alt={currentTrack.album.name}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-muted">
						<Play className="h-4 w-4" />
					</div>
				)}
			</div>

			{/* Track info */}
			<div className="min-w-0 max-w-[160px]">
				<p
					className={`truncate font-medium text-sm ${isPlaying ? "text-green-500" : ""}`}
				>
					{currentTrack.name}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{currentTrack.artists.map((a) => a.name).join(", ")}
				</p>
			</div>

			{/* Skip 30 seconds button */}
			{onSkip && (
				<button
					type="button"
					onClick={() => onSkip(30)}
					disabled={!playerState.isReady}
					className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					title="Skip 30 seconds"
				>
					<SkipForward className="h-5 w-5" />
				</button>
			)}

			{/* Play/pause button */}
			<button
				type="button"
				onClick={() => onTogglePlayback(`spotify:track:${currentTrack.id}`)}
				disabled={!playerState.isReady}
				className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				title={isPlaying ? "Pause" : "Play"}
			>
				{isPlaying ? (
					<Pause className="h-5 w-5" />
				) : (
					<Play className="h-5 w-5 pl-0.5" />
				)}
			</button>
		</div>
	);
}

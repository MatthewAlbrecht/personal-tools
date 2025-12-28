"use client";

import { CheckCircle2, Clock, Heart, Loader2, Pause, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type {
	PlayerState,
	RecentlyPlayedItem,
	SavedTrackItem,
} from "../_utils/types";
import { TrackRow } from "./track-row";

type CategorizedTrack = {
	_id: string;
	trackId: string;
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	trackData?: string;
	userInput: string;
	finalSelections: string[];
	createdAt: number;
};

type TracksPanelProps = {
	recentTracks: RecentlyPlayedItem[] | undefined;
	likedTracks: SavedTrackItem[] | undefined;
	categorizedTracks: CategorizedTrack[] | undefined;
	isLoadingRecent: boolean;
	isLoadingLiked: boolean;
	isLoadingCategorized: boolean;
	selectedTrackId: string | null;
	nowPlayingTrackId: string | null;
	categorizedTrackIds: Set<string>;
	playerState: PlayerState;
	onTogglePlayback: (trackUri: string) => void;
	onSelectRecentTrack: (track: RecentlyPlayedItem) => void;
	onSelectLikedTrack: (track: SavedTrackItem) => void;
	onRefresh: () => void;
	onRefreshLiked: () => void;
	onSelectCategorizedTrack?: (track: CategorizedTrack) => void;
};

export function TracksPanel({
	recentTracks,
	likedTracks,
	categorizedTracks,
	isLoadingRecent,
	isLoadingLiked,
	isLoadingCategorized,
	selectedTrackId,
	nowPlayingTrackId,
	categorizedTrackIds,
	playerState,
	onTogglePlayback,
	onSelectRecentTrack,
	onSelectLikedTrack,
	onRefresh,
	onRefreshLiked,
	onSelectCategorizedTrack,
}: TracksPanelProps) {
	const [activeTab, setActiveTab] = useState<"recent" | "liked" | "done">(
		"recent",
	);

	// Filter out categorized and duplicate tracks from recent
	const filteredRecentTracks = (() => {
		if (!recentTracks) return undefined;
		const seen = new Set<string>();
		return recentTracks.filter((item) => {
			if (seen.has(item.track.id)) return false;
			if (categorizedTrackIds.has(item.track.id)) return false;
			seen.add(item.track.id);
			return true;
		});
	})();

	// Filter out categorized and duplicate tracks from liked
	const filteredLikedTracks = (() => {
		if (!likedTracks) return undefined;
		const seen = new Set<string>();
		return likedTracks.filter((item) => {
			if (seen.has(item.track.id)) return false;
			if (categorizedTrackIds.has(item.track.id)) return false;
			seen.add(item.track.id);
			return true;
		});
	})();

	const recentCount = filteredRecentTracks?.length ?? 0;
	const likedCount = filteredLikedTracks?.length ?? 0;
	const doneCount = categorizedTracks?.length ?? 0;

	const icons = {
		recent: <Clock className="h-5 w-5" />,
		liked: <Heart className="h-5 w-5" />,
		done: <CheckCircle2 className="h-5 w-5" />,
	};

	const titles = {
		recent: "Recently Played",
		liked: "Liked Songs",
		done: "Categorized",
	};

	// Find current playing track info from all sources
	const currentPlayingTrack = (() => {
		if (!playerState.currentTrackId) return null;
		const fromRecent = recentTracks?.find(
			(t) => t.track.id === playerState.currentTrackId,
		);
		if (fromRecent)
			return {
				name: fromRecent.track.name,
				artist: fromRecent.track.artists[0]?.name,
			};
		const fromLiked = likedTracks?.find(
			(t) => t.track.id === playerState.currentTrackId,
		);
		if (fromLiked)
			return {
				name: fromLiked.track.name,
				artist: fromLiked.track.artists[0]?.name,
			};
		return null;
	})();

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{icons[activeTab]}
							{titles[activeTab]}
						</CardTitle>
						{playerState.error ? (
							<p className="mt-1 text-destructive text-xs">
								{playerState.error}
							</p>
						) : !playerState.isReady ? (
							<p className="mt-1 text-muted-foreground text-xs">
								Connecting to Spotify...
							</p>
						) : playerState.isPlaying && currentPlayingTrack ? (
							<p className="mt-1 flex items-center gap-1 text-green-500 text-xs">
								<span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
								{currentPlayingTrack.name} — {currentPlayingTrack.artist}
							</p>
						) : null}
					</div>
					{activeTab === "recent" && (
						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							disabled={isLoadingRecent}
						>
							Refresh
						</Button>
					)}
					{activeTab === "liked" && (
						<Button
							variant="outline"
							size="sm"
							onClick={onRefreshLiked}
							disabled={isLoadingLiked}
						>
							Refresh
						</Button>
					)}
				</div>
				{/* Tabs */}
				<div className="mt-3 flex gap-1 rounded-lg bg-muted p-1">
					<button
						type="button"
						onClick={() => setActiveTab("recent")}
						className={`flex-1 rounded-md px-2 py-1.5 font-medium text-xs transition-colors ${
							activeTab === "recent"
								? "bg-background shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Recent ({recentCount})
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("liked")}
						className={`flex-1 rounded-md px-2 py-1.5 font-medium text-xs transition-colors ${
							activeTab === "liked"
								? "bg-background shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Liked ({likedCount})
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("done")}
						className={`flex-1 rounded-md px-2 py-1.5 font-medium text-xs transition-colors ${
							activeTab === "done"
								? "bg-background shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Done ({doneCount})
					</button>
				</div>
			</CardHeader>
			<CardContent>
				{activeTab === "recent" && (
					<RecentTracksList
						tracks={filteredRecentTracks}
						isLoading={isLoadingRecent}
						selectedTrackId={selectedTrackId}
						nowPlayingTrackId={nowPlayingTrackId}
						playerState={playerState}
						onTogglePlayback={onTogglePlayback}
						onSelectTrack={onSelectRecentTrack}
					/>
				)}
				{activeTab === "liked" && (
					<LikedTracksList
						tracks={filteredLikedTracks}
						isLoading={isLoadingLiked}
						selectedTrackId={selectedTrackId}
						playerState={playerState}
						onTogglePlayback={onTogglePlayback}
						onSelectTrack={onSelectLikedTrack}
					/>
				)}
				{activeTab === "done" && (
					<CategorizedTracksList
						tracks={categorizedTracks}
						isLoading={isLoadingCategorized}
						selectedTrackId={selectedTrackId}
						playerState={playerState}
						onTogglePlayback={onTogglePlayback}
						onSelectTrack={onSelectCategorizedTrack}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function RecentTracksList({
	tracks,
	isLoading,
	selectedTrackId,
	nowPlayingTrackId,
	playerState,
	onTogglePlayback,
	onSelectTrack,
}: {
	tracks: RecentlyPlayedItem[] | undefined;
	isLoading: boolean;
	selectedTrackId: string | null;
	nowPlayingTrackId: string | null;
	playerState: PlayerState;
	onTogglePlayback: (trackUri: string) => void;
	onSelectTrack: (track: RecentlyPlayedItem) => void;
}) {
	if (isLoading) {
		return <TracksSkeleton />;
	}

	if (!tracks?.length) {
		return (
			<p className="py-8 text-center text-muted-foreground">
				No recent tracks to categorize
			</p>
		);
	}

	return (
		<div className="-mx-1 max-h-[500px] space-y-1 overflow-y-auto px-1 pt-1">
			{tracks.map((item, index) => (
				<TrackRow
					key={`${item.track.id}-${index}`}
					track={item.track}
					isSelected={selectedTrackId === item.track.id}
					isNowPlaying={item.track.id === nowPlayingTrackId}
					playerState={playerState}
					onSelect={() => onSelectTrack(item)}
					onTogglePlayback={onTogglePlayback}
				/>
			))}
		</div>
	);
}

function LikedTracksList({
	tracks,
	isLoading,
	selectedTrackId,
	playerState,
	onTogglePlayback,
	onSelectTrack,
}: {
	tracks: SavedTrackItem[] | undefined;
	isLoading: boolean;
	selectedTrackId: string | null;
	playerState: PlayerState;
	onTogglePlayback: (trackUri: string) => void;
	onSelectTrack: (track: SavedTrackItem) => void;
}) {
	if (isLoading) {
		return <TracksSkeleton />;
	}

	if (!tracks?.length) {
		return (
			<p className="py-8 text-center text-muted-foreground">
				No liked songs to categorize
			</p>
		);
	}

	return (
		<div className="-mx-1 max-h-[500px] space-y-1 overflow-y-auto px-1 pt-1">
			{tracks.map((item) => (
				<TrackRow
					key={item.track.id}
					track={item.track}
					isSelected={selectedTrackId === item.track.id}
					playerState={playerState}
					onSelect={() => onSelectTrack(item)}
					onTogglePlayback={onTogglePlayback}
				/>
			))}
		</div>
	);
}

function CategorizedTracksList({
	tracks,
	isLoading,
	selectedTrackId,
	playerState,
	onTogglePlayback,
	onSelectTrack,
}: {
	tracks: CategorizedTrack[] | undefined;
	isLoading: boolean;
	selectedTrackId: string | null;
	playerState: PlayerState;
	onTogglePlayback: (trackUri: string) => void;
	onSelectTrack?: (track: CategorizedTrack) => void;
}) {
	if (isLoading) {
		return <TracksSkeleton />;
	}

	if (!tracks?.length) {
		return (
			<p className="py-8 text-center text-muted-foreground">
				No categorized tracks yet
			</p>
		);
	}

	return (
		<div className="-mx-1 max-h-[500px] space-y-1 overflow-y-auto px-1 pt-1">
			{tracks.map((track) => {
				const isSelected = selectedTrackId === track.trackId;
				const isPlaying =
					playerState.currentTrackId === track.trackId && playerState.isPlaying;
				const isCurrentTrack = playerState.currentTrackId === track.trackId;
				const isPending =
					playerState.isPending && playerState.pendingTrackId === track.trackId;

				return (
					<div
						key={track._id}
						className={`group flex w-full items-center gap-3 overflow-hidden rounded-lg p-2 transition-colors hover:bg-muted/50 ${
							isSelected ? "bg-primary/10 ring-1 ring-primary" : ""
						}`}
					>
						{/* Album art with play button overlay */}
						<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
							{track.albumImageUrl ? (
								<img
									src={track.albumImageUrl}
									alt={track.albumName ?? track.trackName}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center bg-muted">
									<Play className="h-4 w-4" />
								</div>
							)}
							{/* Play button overlay */}
							<button
								type="button"
								onClick={() => {
									onTogglePlayback(`spotify:track:${track.trackId}`);
									onSelectTrack?.(track);
								}}
								disabled={!playerState.isReady || isPending}
								className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
									isCurrentTrack || isPending
										? "opacity-100"
										: "opacity-0 group-hover:opacity-100"
								} ${!playerState.isReady ? "cursor-not-allowed" : ""}`}
								title={
									playerState.isReady
										? isPlaying
											? "Pause"
											: "Play"
										: "Player loading..."
								}
							>
								{isPending ? (
									<Loader2 className="h-5 w-5 animate-spin text-white" />
								) : isPlaying ? (
									<Pause className="h-5 w-5 text-white" />
								) : isCurrentTrack ? (
									<Play className="h-5 w-5 text-white" />
								) : (
									<Play className="h-4 w-4 text-white" />
								)}
							</button>
							{/* Categorized checkmark badge */}
							{!isCurrentTrack && !isPending && (
								<div className="absolute right-0 bottom-0 rounded-tl bg-green-500/90 p-0.5">
									<CheckCircle2 className="h-3 w-3 text-white" />
								</div>
							)}
						</div>
						{/* Track info - clickable to select */}
						<button
							type="button"
							onClick={() => onSelectTrack?.(track)}
							className="min-w-0 flex-1 text-left"
						>
							<p
								className={`truncate font-medium text-sm ${isCurrentTrack ? "text-green-500" : ""}`}
							>
								{track.trackName}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{track.artistName}
							</p>
							<p className="truncate text-muted-foreground/60 text-xs italic">
								&quot;{track.userInput}&quot;
							</p>
						</button>
					</div>
				);
			})}
		</div>
	);
}

function TracksSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 p-2">
					<Skeleton className="h-10 w-10 rounded" />
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-1/2" />
					</div>
				</div>
			))}
		</div>
	);
}

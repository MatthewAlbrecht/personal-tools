"use client";

import { Music } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

type Track = {
	_id: Id<"rooTracksAdded">;
	spotifyTrackId: string;
	spotifyArtistId: string;
	trackName: string;
	albumName: string;
	releaseDate: string;
	addedAt: number;
};

export function RecentTracks({ tracks }: { tracks: Track[] }) {
	return (
		<div className="space-y-2">
			{tracks.map((track) => (
				<div
					key={track._id}
					className="flex items-center gap-3 rounded-lg border bg-card p-3"
				>
					<div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
						<Music className="h-5 w-5 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-sm">{track.trackName}</p>
						<p className="truncate text-muted-foreground text-xs">
							{track.albumName} · {track.releaseDate}
						</p>
					</div>
					<div className="text-muted-foreground text-xs">
						{new Date(track.addedAt).toLocaleDateString()}
					</div>
				</div>
			))}
		</div>
	);
}

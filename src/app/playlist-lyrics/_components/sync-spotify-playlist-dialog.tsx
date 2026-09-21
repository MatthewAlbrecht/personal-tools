"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { parseSpotifyPlaylistId } from "~/lib/parse-spotify-playlist-id";
import { getAlbumImageUrl, getAllPlaylistTracks } from "~/lib/spotify";
import { matchPlaylistItemsToSpotifyTracks } from "~/lib/zine/playlist-spotify-track-sync";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function SyncSpotifyPlaylistDialog({
	open,
	onOpenChange,
	playlistId,
	initialSpotifyPlaylistId,
	items,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	playlistId: Id<"playlistLyrics">;
	initialSpotifyPlaylistId?: string;
	items: Array<{ itemId: Id<"playlistLyricsItems">; title: string }>;
}) {
	const { getValidAccessToken, isConnected } = useSpotifyAuth();
	const applySpotifyPlaylistTrackMetadata = useMutation(
		api.playlistLyrics.applySpotifyPlaylistTrackMetadata,
	);

	const [playlistUrl, setPlaylistUrl] = useState(
		initialSpotifyPlaylistId ?? "",
	);
	const [isSyncing, setIsSyncing] = useState(false);

	async function handleSync(): Promise<void> {
		const spotifyPlaylistId = parseSpotifyPlaylistId(playlistUrl);
		if (!spotifyPlaylistId) {
			toast.error("Paste a Spotify playlist URL or ID.");
			return;
		}

		if (items.length === 0) {
			toast.error("Add tracks to this playlist before syncing.");
			return;
		}

		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify first, then try again.");
				return;
			}

			const spotifyTracks = await getAllPlaylistTracks(
				accessToken,
				spotifyPlaylistId,
			);
			const matchResult = matchPlaylistItemsToSpotifyTracks({
				items: items.map((item) => ({
					itemId: item.itemId,
					title: item.title,
				})),
				tracks: spotifyTracks.map((track) => ({
					name: track.name,
					durationMs: track.duration_ms,
					albumArtUrl: getAlbumImageUrl(track, "medium"),
				})),
			});

			if (matchResult.matches.length === 0) {
				toast.error("No tracks matched by title.");
				return;
			}

			const result = await applySpotifyPlaylistTrackMetadata({
				playlistId,
				spotifyPlaylistId,
				updates: matchResult.matches.map((match) => ({
					itemId: match.itemId as Id<"playlistLyricsItems">,
					durationSeconds: match.durationSeconds,
					albumArtUrl: match.albumArtUrl,
				})),
			});

			const parts = [
				`Updated ${result.updatedCount} track${result.updatedCount === 1 ? "" : "s"}`,
				matchResult.unmatchedItemCount > 0
					? `${matchResult.unmatchedItemCount} unmatched`
					: null,
			].filter(Boolean);

			toast.success(parts.join(" · "));
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to sync from Spotify playlist",
			);
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (isSyncing) return;
				onOpenChange(nextOpen);
				if (!nextOpen) {
					setPlaylistUrl(initialSpotifyPlaylistId ?? "");
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Sync from Spotify playlist</DialogTitle>
					<DialogDescription>
						Paste the Spotify playlist you use for this zine. Tracks are matched
						by title, then duration and album art are filled in.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="playlist-lyrics-spotify-url">
							Playlist URL or ID
						</Label>
						<Input
							id="playlist-lyrics-spotify-url"
							placeholder="https://open.spotify.com/playlist/..."
							value={playlistUrl}
							disabled={isSyncing}
							onChange={(event) => setPlaylistUrl(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void handleSync();
								}
							}}
						/>
					</div>
					{!isConnected ? (
						<p className="text-amber-800 text-sm">
							Spotify is not connected in this browser session.
						</p>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isSyncing}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={isSyncing || !playlistUrl.trim()}
						onClick={() => {
							void handleSync();
						}}
					>
						{isSyncing ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Syncing…
							</>
						) : (
							"Match & update"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

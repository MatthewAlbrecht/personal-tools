"use client";

import { ListMusic, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { SpotifyConnection } from "~/app/spotify-playlister/_components/spotify-connection";
import { LoginPrompt } from "~/components/login-prompt";
import { Button } from "~/components/ui/button";
import type { ForLaterSyncResult } from "~/lib/for-later-albums-sync";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";

export default function ForLaterAlbumsPage() {
	const { userId, isLoading, isConnected, connection, getValidAccessToken } =
		useSpotifyAuth();

	const [isSyncing, setIsSyncing] = useState(false);

	const runSync = useCallback(
		async (fullPlaylist: boolean) => {
			if (!userId || !isConnected) {
				return;
			}

			setIsSyncing(true);
			try {
				const accessToken = await getValidAccessToken();
				if (!accessToken) {
					throw new Error("No valid Spotify access token");
				}

				const res = await fetch("/api/for-later-albums/sync", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Access-Token": accessToken,
					},
					body: JSON.stringify({
						userId,
						source: "manual",
						fullPlaylist,
					}),
				});

				const data = (await res.json()) as
					| ForLaterSyncResult
					| { error?: string; details?: string };

				if (!res.ok || !("success" in data) || !data.success) {
					const msg =
						"details" in data && typeof data.details === "string"
							? `${data.error ?? "Sync failed"}: ${data.details}`
							: (data.error ?? "Sync failed");
					throw new Error(msg);
				}

				toast.success(
					<div className="whitespace-pre-wrap font-mono text-xs">
						{formatForLaterSyncToast(data).join("\n")}
					</div>,
					{ duration: 12_000 },
				);
			} catch (error) {
				console.error("For Later Albums sync error:", error);
				toast.error(
					error instanceof Error ? error.message : "Failed to sync playlist",
				);
			} finally {
				setIsSyncing(false);
			}
		},
		[userId, isConnected, getValidAccessToken],
	);

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-6xl p-6">
				<div className="flex h-[40vh] items-center justify-center text-muted-foreground">
					Loading…
				</div>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={ListMusic}
				message="Please log in to sync your For Later playlist."
				redirectPath="/for-later-albums"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 p-6">
			<div>
				<h1 className="font-bold text-3xl">For Later Albums</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
					Pulls albums from your configured Spotify backlog playlist into
					Convex. Requires{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
						FOR_LATER_SPOTIFY_PLAYLIST_ID
					</code>{" "}
					on the server. See{" "}
					<Link className="text-primary underline" href="/albums">
						Albums
					</Link>{" "}
					for Spotify connection if needed.
				</p>
			</div>

			<SpotifyConnection
				isConnected={isConnected}
				displayName={connection?.displayName}
				onDisconnect={() => {
					window.location.href = "/spotify-playlister";
				}}
			/>

			{isConnected ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<Button
							type="button"
							disabled={isSyncing}
							onClick={() => void runSync(false)}
							className="min-w-[200px]"
						>
							{isSyncing ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Syncing…
								</>
							) : (
								"Sync new additions"
							)}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={isSyncing}
							onClick={() => void runSync(true)}
							className="min-w-[200px]"
						>
							Full playlist scan
						</Button>
					</div>
					<p className="max-w-2xl text-muted-foreground text-sm">
						<strong>Sync new additions</strong> reads Spotify’s playlist{" "}
						<code className="rounded bg-muted px-1 font-mono text-xs">
							tracks.total
						</code>
						, then loads only the <strong>last</strong>{" "}
						<code className="rounded bg-muted px-1 font-mono text-xs">
							FOR_LATER_INCREMENTAL_TAIL_TRACKS
						</code>{" "}
						rows (default <strong>200</strong>; HTTP offset{" "}
						<code className="rounded bg-muted px-1 font-mono text-xs">
							total − tail
						</code>
						). Only tracks whose{" "}
						<code className="rounded bg-muted px-1 font-mono text-xs">
							added_at
						</code>{" "}
						is strictly newer than stored{" "}
						<code className="rounded bg-muted px-1 font-mono text-xs">
							playlistNewestAddedAtMs
						</code>{" "}
						touch the backlog. Tune the env tail if you bulk-add more tracks
						than the window. <strong>Full playlist scan</strong> starts at
						offset 0 and processes every row.
					</p>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					Connect Spotify above to enable syncing.
				</p>
			)}
		</div>
	);
}

function formatForLaterSyncToast(ok: ForLaterSyncResult): string[] {
	const snapShort =
		ok.spotifySnapshotId !== undefined && ok.spotifySnapshotId !== ""
			? `${ok.spotifySnapshotId.slice(0, 18)}…`
			: "—";

	const modeLine = ok.usedIncrementalPlaylistScan
		? "Mode: incremental (tail of playlist + added_at > watermark)"
		: "Mode: full playlist scan";

	const prefix: string[] = [];
	if (ok.usedIncrementalPlaylistScan && ok.tracksFromPlaylist === 0) {
		prefix.push(
			"! Incremental: no playlist rows had added_at newer than the watermark.",
			"  Normal if you did not add tracks since the last run.",
			"",
		);
	}

	const lines = [
		...prefix,
		`Completed in ${(ok.durationMs / 1000).toFixed(1)}s`,
		"",
		modeLine,
		"",
		"Playlist API:",
		`  • ${ok.playlistTrackPageRequests} playlist track page request(s) (≤100 rows each)`,
		`  • ${ok.playlistRowsTotalFetched} Spotify playlist rows fetched`,
		`  • ${ok.tracksFromPlaylist} playlist rows with tracks processed this run`,
		"",
		"Albums:",
		`  • ${ok.uniqueAlbumsFromPlaylist} unique album ids (GET /album only when missing canonical cache + Convex upsert)`,
		`  • ${ok.newAlbumsAdded} new backlog rows`,
		`  • ${ok.existingAlbumsSeen} backlog rows updated (already had this album)`,
		"",
		"Other:",
		`  • Snapshot id: ${snapShort}`,
		`  • RYM matches this run: ${ok.rymMatchesCreated}`,
		`  • Removals marked inactive: ${ok.albumsMarkedRemoved} (currently unused)`,
	];

	return lines;
}

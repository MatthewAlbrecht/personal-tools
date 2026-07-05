"use client";

import { useMutation, useQuery } from "convex/react";
import {
	CloudUpload,
	Link as LinkIcon,
	ListMusic,
	Loader2,
	Pencil,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

type Playlist = Doc<"playlistLyrics">;

type SyncResult = {
	playlistsSynced?: number;
	scrapesSynced?: number;
	failed?: number;
	total?: number;
	error?: string;
};

export function PlaylistLyricsList() {
	const router = useRouter();
	const [isCreating, setIsCreating] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	const playlists = useQuery(api.playlistLyrics.list, { limit: 100 });
	const createDraft = useMutation(api.playlistLyrics.createDraft);

	const playlistsLoading = playlists === undefined;

	async function handleCreatePlaylist() {
		setIsCreating(true);
		try {
			const result = await createDraft({});
			router.push(`/playlist-lyrics/${result.slug}/edit`);
		} catch (error) {
			console.error("Failed to create playlist:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to create playlist",
			);
		} finally {
			setIsCreating(false);
		}
	}

	async function handleSyncToProduction() {
		setIsSyncing(true);
		try {
			const response = await fetch("/api/migrate-playlist-lyrics", {
				method: "POST",
			});
			const result = (await response.json().catch(() => ({}))) as SyncResult;

			if (!response.ok) {
				throw new Error(result.error ?? "Sync failed");
			}

			toast.success(formatSyncToast(result));
		} catch (error) {
			console.error("Playlist lyrics sync failed:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to sync to production",
			);
		} finally {
			setIsSyncing(false);
		}
	}

	function handleCopyPublicLink(playlist: Playlist): void {
		const publicUrl = `${window.location.origin}/public/playlist-lyrics/${playlist.slug}`;
		navigator.clipboard.writeText(publicUrl);
		toast.success("Public link copied to clipboard!");
	}

	return (
		<Card>
				<CardHeader>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2 text-2xl">
								<ListMusic className="h-6 w-6" />
								Playlist Lyrics
							</CardTitle>
							<p className="mt-2 text-muted-foreground text-sm">
								Build printable lyric sheets from saved playlists.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={handleSyncToProduction}
								disabled={isSyncing}
							>
								{isSyncing ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Syncing...
									</>
								) : (
									<>
										<CloudUpload className="mr-2 h-4 w-4" />
										Sync to Production
									</>
								)}
							</Button>
							<Button onClick={handleCreatePlaylist} disabled={isCreating}>
								{isCreating ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Plus className="mr-2 h-4 w-4" />
										New Playlist
									</>
								)}
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{playlistsLoading ? (
						<PlaylistLyricsListSkeleton />
					) : playlists && playlists.length > 0 ? (
						<ul className="space-y-3">
							{playlists.map((playlist: Playlist) => {
								const isPublic = playlist.status === "ready";

								return (
									<li
										key={playlist._id}
										className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0 flex-1">
												<Button
													variant="ghost"
													className="h-auto justify-start px-0 py-0 text-left"
													asChild
												>
													<Link href={`/playlist-lyrics/${playlist.slug}`}>
														<span className="block truncate font-semibold text-lg">
															{playlist.title}
														</span>
													</Link>
												</Button>
												<div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
													<span>Updated {formatDate(playlist.updatedAt)}</span>
													<span>{isPublic ? "Public" : "Draft"}</span>
												</div>
												{playlist.description && (
													<p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
														{playlist.description}
													</p>
												)}
												{playlist.theme && (
													<p className="mt-1 text-muted-foreground text-xs">
														Theme: {playlist.theme}
													</p>
												)}
											</div>
											<div className="flex gap-2">
												<Button
													variant="outline"
													size="icon"
													onClick={() => handleCopyPublicLink(playlist)}
													aria-label={`Copy public link for ${playlist.title}`}
													title={`Copy public link for ${playlist.title}`}
												>
													<LinkIcon className="h-4 w-4" />
												</Button>
												<Button variant="outline" size="icon" asChild>
													<Link
														href={`/playlist-lyrics/${playlist.slug}/edit`}
														aria-label={`Edit ${playlist.title}`}
														title={`Edit ${playlist.title}`}
													>
														<Pencil className="h-4 w-4" />
													</Link>
												</Button>
											</div>
										</div>
									</li>
								);
							})}
						</ul>
					) : (
						<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
							<ListMusic className="mb-4 h-12 w-12 text-muted-foreground" />
							<h2 className="mb-2 font-medium text-lg">No playlists yet</h2>
							<p className="mb-4 max-w-sm text-muted-foreground text-sm">
								Create a playlist to start collecting songs for a printable
								lyric sheet.
							</p>
							<Button onClick={handleCreatePlaylist} disabled={isCreating}>
								{isCreating ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Plus className="mr-2 h-4 w-4" />
										New Playlist
									</>
								)}
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
	);
}

function PlaylistLyricsListSkeleton() {
	return (
		<ul className="space-y-3">
			{[
				"playlist-skeleton-1",
				"playlist-skeleton-2",
				"playlist-skeleton-3",
			].map((key) => (
				<PlaylistLyricsRowSkeleton key={key} />
			))}
		</ul>
	);
}

function PlaylistLyricsRowSkeleton() {
	return (
		<li className="rounded-lg border p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 space-y-3">
					<Skeleton className="h-6 w-2/3" />
					<div className="flex gap-2">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-32" />
					</div>
					<Skeleton className="h-4 w-full" />
				</div>
				<Skeleton className="h-9 w-9" />
			</div>
		</li>
	);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatSyncToast(result: SyncResult): string {
	const counts = [
		formatCount("playlists", result.playlistsSynced),
		formatCount("scrapes", result.scrapesSynced),
		formatCount("failed", result.failed),
		formatCount("total", result.total),
	].filter(Boolean);

	if (counts.length === 0) {
		return "Playlist lyrics synced to production";
	}

	return `Playlist lyrics synced: ${counts.join(", ")}`;
}

function formatCount(label: string, value: number | undefined): string | null {
	if (value === undefined) return null;

	return `${label} ${value}`;
}

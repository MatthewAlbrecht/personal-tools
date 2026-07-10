"use client";

import { useMutation } from "convex/react";
import {
	ExternalLink,
	Loader2,
	Pause,
	Pencil,
	Play,
	RefreshCw,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { formatRuleSummary } from "~/lib/smart-playlists/rule-summary";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

export function RecipeCard({
	recipe,
	userId,
	getValidAccessToken,
}: {
	recipe: Doc<"smartPlaylists">;
	userId: string;
	getValidAccessToken: () => Promise<string | null>;
}): React.ReactNode {
	const setPaused = useMutation(api.smartPlaylists.setPaused);
	const removeRecipe = useMutation(api.smartPlaylists.removeRecipe);

	const [isSyncing, setIsSyncing] = useState(false);
	const [isTogglingPause, setIsTogglingPause] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [unfollowSpotify, setUnfollowSpotify] = useState(false);

	const ruleSummary = formatRuleSummary({
		source: recipe.source,
		filters: recipe.filters,
	});

	const syncModeLabel = recipe.syncMode === "mirror" ? "Mirror" : "Add only";

	async function handleSync(): Promise<void> {
		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify before syncing");
				return;
			}

			const response = await fetch("/api/smart-playlists/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({
					userId,
					recipeId: recipe._id,
				}),
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					details?: string;
					error?: string;
				} | null;
				throw new Error(body?.details ?? body?.error ?? "Sync failed");
			}

			toast.success(`Synced “${recipe.name}”`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to sync recipe",
			);
		} finally {
			setIsSyncing(false);
		}
	}

	async function handleTogglePause(): Promise<void> {
		setIsTogglingPause(true);
		try {
			await setPaused({
				userId,
				recipeId: recipe._id,
				isPaused: !recipe.isPaused,
			});
			toast.success(
				recipe.isPaused
					? `Resumed “${recipe.name}”`
					: `Paused “${recipe.name}”`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update pause state",
			);
		} finally {
			setIsTogglingPause(false);
		}
	}

	async function handleDelete(): Promise<void> {
		setIsDeleting(true);
		try {
			if (unfollowSpotify) {
				const accessToken = await getValidAccessToken();
				if (!accessToken) {
					toast.error("Connect Spotify to unfollow the playlist");
					return;
				}

				const response = await fetch(
					`https://api.spotify.com/v1/playlists/${recipe.spotifyPlaylistId}/followers`,
					{
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					},
				);

				if (!response.ok) {
					throw new Error("Failed to unfollow Spotify playlist");
				}
			}

			await removeRecipe({
				userId,
				recipeId: recipe._id,
			});
			toast.success(`Deleted “${recipe.name}”`);
			setDeleteOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete recipe",
			);
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<>
			<Card className={recipe.isPaused ? "opacity-70" : undefined}>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="space-y-1.5">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>{recipe.name}</CardTitle>
								<Badge variant="secondary">{syncModeLabel}</Badge>
								{recipe.isPaused ? (
									<Badge variant="outline">Paused</Badge>
								) : null}
							</div>
							<CardDescription>{ruleSummary}</CardDescription>
						</div>
						<div className="text-muted-foreground text-sm">
							{recipe.matchAlbumCount} albums · {recipe.matchTrackCount} tracks
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-1 text-sm">
					<p>
						<span className="text-muted-foreground">Status: </span>
						{formatSyncStatus(recipe.syncStatus)}
						{recipe.lastSyncedAt
							? ` · Last synced ${new Date(recipe.lastSyncedAt).toLocaleString()}`
							: null}
					</p>
					{recipe.lastError ? (
						<p className="text-destructive">{recipe.lastError}</p>
					) : null}
				</CardContent>
				<CardFooter className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" asChild>
						<a
							href={`https://open.spotify.com/playlist/${recipe.spotifyPlaylistId}`}
							target="_blank"
							rel="noreferrer"
						>
							<ExternalLink className="size-4" />
							Open Spotify
						</a>
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={isSyncing}
						onClick={() => void handleSync()}
					>
						{isSyncing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<RefreshCw className="size-4" />
						)}
						Sync now
					</Button>
					<Button variant="outline" size="sm" asChild>
						<Link href={`/smart-playlists/${recipe._id}/edit`}>
							<Pencil className="size-4" />
							Edit
						</Link>
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={isTogglingPause}
						onClick={() => void handleTogglePause()}
					>
						{recipe.isPaused ? (
							<Play className="size-4" />
						) : (
							<Pause className="size-4" />
						)}
						{recipe.isPaused ? "Resume" : "Pause"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setUnfollowSpotify(false);
							setDeleteOpen(true);
						}}
					>
						<Trash2 className="size-4" />
						Delete
					</Button>
				</CardFooter>
			</Card>

			<AlertDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) setUnfollowSpotify(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete recipe?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes “{recipe.name}” from Smart Playlists. The Spotify
							playlist is kept unless you choose to unfollow it below.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex items-center gap-2 text-sm">
						<Checkbox
							id="unfollow-spotify-playlist"
							checked={unfollowSpotify}
							onCheckedChange={(checked) =>
								setUnfollowSpotify(checked === true)
							}
						/>
						<label htmlFor="unfollow-spotify-playlist">
							Also unfollow the Spotify playlist
						</label>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={isDeleting}
							onClick={(event) => {
								event.preventDefault();
								void handleDelete();
							}}
						>
							{isDeleting ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function formatSyncStatus(status: Doc<"smartPlaylists">["syncStatus"]): string {
	switch (status) {
		case "never":
			return "Never synced";
		case "ok":
			return "OK";
		case "error":
			return "Error";
	}
}

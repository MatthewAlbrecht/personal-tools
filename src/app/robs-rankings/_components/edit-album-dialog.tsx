"use client";

import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
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
import type { RankingAlbum } from "../_utils/types";

function AlbumArtPreview({
	imageUrl,
	albumTitle,
}: {
	imageUrl?: string;
	albumTitle: string;
}) {
	return (
		<div className="relative mx-auto h-32 w-32 overflow-hidden rounded-md bg-muted shadow-sm">
			{imageUrl ? (
				// Manual artwork URLs may come from any host
				// biome-ignore lint/performance/noImgElement: arbitrary user-provided URLs
				<img
					src={imageUrl}
					alt={albumTitle || "Album artwork preview"}
					className="h-full w-full object-cover"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center">
					<Disc3 className="h-10 w-10 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}

export function EditAlbumDialog({
	open,
	onOpenChange,
	album,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	album: RankingAlbum | null;
	onSave: (data: {
		artistName: string;
		albumTitle: string;
		imageUrl?: string;
	}) => Promise<void>;
}) {
	const [artistName, setArtistName] = useState("");
	const [albumTitle, setAlbumTitle] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!open || !album) return;

		setArtistName(album.album?.artistName ?? "");
		setAlbumTitle(album.album?.name ?? "");
		setImageUrl(album.album?.imageUrl ?? "");
	}, [open, album]);

	async function handleSave() {
		if (!albumTitle.trim()) {
			toast.error("Album title is required");
			return;
		}
		if (!artistName.trim()) {
			toast.error("Artist name is required");
			return;
		}

		setIsSaving(true);
		try {
			await onSave({
				artistName: artistName.trim(),
				albumTitle: albumTitle.trim(),
				imageUrl: imageUrl.trim() || undefined,
			});
			toast.success(
				album?.source === "manual"
					? "Manual entry updated"
					: "Converted to manual entry",
			);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save entry",
			);
		} finally {
			setIsSaving(false);
		}
	}

	function handleClose(nextOpen: boolean) {
		onOpenChange(nextOpen);
	}

	if (!album) return null;

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Edit #{album.position}
						{album.source === "manual" && (
							<Badge variant="secondary">Manual</Badge>
						)}
					</DialogTitle>
					<DialogDescription>
						{album.source === "manual"
							? "Update this manual album entry."
							: "Replace the Spotify link with a manual entry — useful when the album isn't on Spotify or the match is wrong."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<AlbumArtPreview
						imageUrl={imageUrl.trim() || undefined}
						albumTitle={albumTitle}
					/>

					<div className="space-y-2">
						<Label htmlFor="edit-artist">Artist</Label>
						<Input
							id="edit-artist"
							value={artistName}
							onChange={(e) => setArtistName(e.target.value)}
							placeholder="Artist name"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="edit-album-title">Album title</Label>
						<Input
							id="edit-album-title"
							value={albumTitle}
							onChange={(e) => setAlbumTitle(e.target.value)}
							placeholder="Album title"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="edit-artwork-url">Artwork URL</Label>
						<Input
							id="edit-artwork-url"
							type="url"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							placeholder="https://..."
						/>
						<p className="text-muted-foreground text-xs">
							Optional. Paste a direct link to cover art.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save manual entry"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

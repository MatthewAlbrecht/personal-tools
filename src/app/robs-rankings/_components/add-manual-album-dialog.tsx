"use client";

import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";
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

export function AddManualAlbumDialog({
	open,
	onOpenChange,
	entryCount,
	onAddManualAlbum,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entryCount: number;
	onAddManualAlbum: (data: {
		artistName: string;
		albumTitle: string;
		imageUrl?: string;
		position?: number;
	}) => Promise<void>;
}) {
	const [artistName, setArtistName] = useState("");
	const [albumTitle, setAlbumTitle] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [position, setPosition] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	const nextPosition = entryCount + 1;

	useEffect(() => {
		if (!open) return;
		setPosition(String(nextPosition));
	}, [open, nextPosition]);

	function resetForm() {
		setArtistName("");
		setAlbumTitle("");
		setImageUrl("");
		setPosition(String(nextPosition));
	}

	async function handleAdd() {
		if (!albumTitle.trim()) {
			toast.error("Album title is required");
			return;
		}
		if (!artistName.trim()) {
			toast.error("Artist name is required");
			return;
		}

		const parsedPosition = Number(position);
		if (!Number.isInteger(parsedPosition) || parsedPosition < 1) {
			toast.error("Enter a valid position (1–50)");
			return;
		}

		setIsSaving(true);
		try {
			await onAddManualAlbum({
				artistName: artistName.trim(),
				albumTitle: albumTitle.trim(),
				imageUrl: imageUrl.trim() || undefined,
				position: parsedPosition,
			});
			toast.success(`Added manual entry at #${parsedPosition}`);
			onOpenChange(false);
			resetForm();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to add manual entry",
			);
		} finally {
			setIsSaving(false);
		}
	}

	function handleClose(nextOpen: boolean) {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			resetForm();
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add manual album</DialogTitle>
					<DialogDescription>
						For albums not on Spotify. Inserts at the chosen rank and shifts
						lower entries down ({entryCount}/50).
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<AlbumArtPreview
						imageUrl={imageUrl.trim() || undefined}
						albumTitle={albumTitle}
					/>

					<div className="space-y-2">
						<Label htmlFor="manual-position">Position</Label>
						<Input
							id="manual-position"
							type="number"
							min={1}
							max={Math.min(50, nextPosition)}
							value={position}
							onChange={(e) => setPosition(e.target.value)}
						/>
						<p className="text-muted-foreground text-xs">
							Next available: #{nextPosition}. Inserting mid-list shifts ranks
							at and below this slot.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="manual-artist">Artist</Label>
						<Input
							id="manual-artist"
							value={artistName}
							onChange={(e) => setArtistName(e.target.value)}
							placeholder="Artist name"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="manual-album-title">Album title</Label>
						<Input
							id="manual-album-title"
							value={albumTitle}
							onChange={(e) => setAlbumTitle(e.target.value)}
							placeholder="Album title"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="manual-artwork-url">Artwork URL</Label>
						<Input
							id="manual-artwork-url"
							type="url"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							placeholder="https://..."
						/>
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
					<Button
						type="button"
						onClick={() => void handleAdd()}
						disabled={isSaving || entryCount >= 50}
					>
						{isSaving ? "Adding..." : "Add manual entry"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

"use client";

import { useMutation } from "convex/react";
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
import { parseSpotifyAlbumId } from "~/lib/parse-spotify-album-id";
import { api } from "../../../../convex/_generated/api";
import { useAlbums } from "../_context/albums-context";

export function AddAlbumToLibraryDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { userId, getValidAccessToken } = useAlbums();
	const addAlbumToLibrary = useMutation(api.spotify.addAlbumToLibrary);
	const [input, setInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!open) {
			setInput("");
			setIsSubmitting(false);
		}
	}, [open]);

	function normalizeInput(value: string): void {
		setInput(parseSpotifyAlbumId(value));
	}

	async function handleAdd(): Promise<void> {
		const spotifyAlbumId = parseSpotifyAlbumId(input);
		if (!spotifyAlbumId) {
			toast.error("Paste a Spotify album URL or ID.");
			return;
		}
		if (!userId) {
			toast.error("Sign in to add albums.");
			return;
		}

		setIsSubmitting(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Not connected to Spotify");
				return;
			}

			const albumResponse = await fetch(
				`/api/spotify/album/${spotifyAlbumId}`,
				{ headers: { "X-Access-Token": accessToken } },
			);
			if (!albumResponse.ok) {
				toast.error("Failed to fetch album from Spotify");
				return;
			}

			const albumData = (await albumResponse.json()) as {
				spotifyAlbumId: string;
				name: string;
				artistName: string;
				imageUrl?: string;
				releaseDate?: string;
				totalTracks: number;
				genres?: string[];
			};

			const result = await addAlbumToLibrary({
				userId,
				spotifyAlbumId: albumData.spotifyAlbumId,
				name: albumData.name,
				artistName: albumData.artistName,
				imageUrl: albumData.imageUrl,
				releaseDate: albumData.releaseDate,
				totalTracks: albumData.totalTracks,
				genres: albumData.genres,
			});

			if (result.alreadyInLibrary) {
				toast.info(
					`"${result.name}" by ${result.artistName} is already in your library`,
				);
			} else {
				toast.success(`Added "${result.name}" by ${result.artistName}`);
			}
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to add album to library:", error);
			toast.error("Failed to add album");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add album</DialogTitle>
					<DialogDescription>
						Paste a Spotify album link, URI, or ID to add it to your library.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="add-album-spotify-input">Spotify album</Label>
					<Input
						id="add-album-spotify-input"
						value={input}
						disabled={isSubmitting}
						placeholder="https://open.spotify.com/album/..."
						onChange={(event) => setInput(event.target.value)}
						onPaste={(event) => {
							event.preventDefault();
							normalizeInput(event.clipboardData.getData("text"));
						}}
						onBlur={(event) => normalizeInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void handleAdd();
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isSubmitting}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={isSubmitting}
						onClick={() => void handleAdd()}
					>
						{isSubmitting ? "Adding…" : "Add"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

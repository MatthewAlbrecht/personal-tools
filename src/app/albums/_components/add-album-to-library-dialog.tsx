"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
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

const SPOTIFY_ALBUM_ID_PATTERN = /^[a-zA-Z0-9]{22}$/;

function canAutoAddSpotifyAlbumInput(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = parseSpotifyAlbumId(trimmed);
	if (!parsed) {
		return null;
	}

	const fromLink =
		/album\/[a-zA-Z0-9]+/.test(trimmed) ||
		/spotify:album:[a-zA-Z0-9]+/.test(trimmed);
	if (fromLink || SPOTIFY_ALBUM_ID_PATTERN.test(parsed)) {
		return parsed;
	}

	return null;
}

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
	const autoSubmittedIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!open) {
			setInput("");
			setIsSubmitting(false);
			autoSubmittedIdRef.current = null;
		}
	}, [open]);

	async function handleAdd(rawInput?: string): Promise<void> {
		const spotifyAlbumId = parseSpotifyAlbumId(rawInput ?? input);
		if (!spotifyAlbumId) {
			toast.error("Paste a Spotify album URL or ID.");
			return;
		}
		if (!userId) {
			toast.error("Sign in to add albums.");
			return;
		}
		if (isSubmitting) {
			return;
		}

		setIsSubmitting(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Not connected to Spotify");
				autoSubmittedIdRef.current = null;
				return;
			}

			const albumResponse = await fetch(
				`/api/spotify/album/${spotifyAlbumId}`,
				{ headers: { "X-Access-Token": accessToken } },
			);
			if (!albumResponse.ok) {
				toast.error("Failed to fetch album from Spotify");
				autoSubmittedIdRef.current = null;
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
			autoSubmittedIdRef.current = null;
		} finally {
			setIsSubmitting(false);
		}
	}

	function tryAutoAdd(value: string): void {
		const spotifyAlbumId = canAutoAddSpotifyAlbumInput(value);
		if (!spotifyAlbumId) {
			return;
		}
		if (autoSubmittedIdRef.current === spotifyAlbumId) {
			return;
		}
		autoSubmittedIdRef.current = spotifyAlbumId;
		setInput(spotifyAlbumId);
		void handleAdd(spotifyAlbumId);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add album</DialogTitle>
					<DialogDescription>
						Paste a Spotify album link, URI, or ID — it adds automatically.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="add-album-spotify-input">Spotify album</Label>
					<Input
						id="add-album-spotify-input"
						value={input}
						disabled={isSubmitting}
						placeholder="https://open.spotify.com/album/..."
						autoFocus
						onChange={(event) => {
							const next = event.target.value;
							setInput(next);
							tryAutoAdd(next);
						}}
						onPaste={(event) => {
							event.preventDefault();
							const pasted = event.clipboardData.getData("text");
							const parsed = parseSpotifyAlbumId(pasted);
							setInput(parsed || pasted);
							tryAutoAdd(pasted);
						}}
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
						{isSubmitting ? "Adding…" : "Cancel"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

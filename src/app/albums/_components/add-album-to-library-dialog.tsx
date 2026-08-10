"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { parseSpotifyAlbumId } from "~/lib/parse-spotify-album-id";
import { api } from "../../../../convex/_generated/api";
import { useAlbums } from "../_context/albums-context";

const SPOTIFY_ALBUM_ID_PATTERN = /^[a-zA-Z0-9]{22}$/;
const HTTPS_URL_PATTERN = /^https?:\/\/.+/i;

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

function getTodayDateInputValue(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function dateInputValueToLocalNoonMs(value: string): number {
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
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
	const addManualAlbumToLibrary = useMutation(
		api.spotify.addManualAlbumToLibrary,
	);
	const [activeTab, setActiveTab] = useState<"spotify" | "manual">("spotify");
	const [input, setInput] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const autoSubmittedIdRef = useRef<string | null>(null);

	const [manualTitle, setManualTitle] = useState("");
	const [manualArtist, setManualArtist] = useState("");
	const [manualYear, setManualYear] = useState("");
	const [manualCoverUrl, setManualCoverUrl] = useState("");
	const [manualRecordListen, setManualRecordListen] = useState(false);
	const [manualListenDate, setManualListenDate] = useState(
		getTodayDateInputValue(),
	);

	useEffect(() => {
		if (!open) {
			setActiveTab("spotify");
			setInput("");
			setIsSubmitting(false);
			autoSubmittedIdRef.current = null;
			setManualTitle("");
			setManualArtist("");
			setManualYear("");
			setManualCoverUrl("");
			setManualRecordListen(false);
			setManualListenDate(getTodayDateInputValue());
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

	async function handleManualSubmit(): Promise<void> {
		const title = manualTitle.trim();
		const artistName = manualArtist.trim();

		if (!title) {
			toast.error("Enter an album title.");
			return;
		}
		if (!artistName) {
			toast.error("Enter an artist name.");
			return;
		}
		if (!/^\d{4}$/.test(manualYear)) {
			toast.error("Enter a 4-digit year.");
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
			const listenedAt = manualRecordListen
				? dateInputValueToLocalNoonMs(manualListenDate)
				: undefined;

			const result = await addManualAlbumToLibrary({
				userId,
				name: title,
				artistName,
				releaseYear: Number.parseInt(manualYear, 10),
				imageUrl: manualCoverUrl.trim() || undefined,
				recordListen: manualRecordListen,
				listenedAt,
			});

			let message = `Added "${result.name}" by ${result.artistName}`;
			if (result.alreadyExists) {
				message = result.alreadyInLibrary
					? `"${result.name}" by ${result.artistName} is already in your library`
					: `"${result.name}" by ${result.artistName} already exists — added to your library`;
			}
			if (result.listenRecorded) {
				message += " · Listen recorded";
			}
			if (result.alreadyExists) {
				toast.info(message);
			} else {
				toast.success(message);
			}
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to add manual album:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to add album",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	const trimmedManualCoverUrl = manualCoverUrl.trim();
	const showManualCoverPreview = HTTPS_URL_PATTERN.test(trimmedManualCoverUrl);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add album</DialogTitle>
					<DialogDescription>
						{activeTab === "spotify"
							? "Paste a Spotify album link, URI, or ID — it adds automatically."
							: "Add an album that isn't on Spotify."}
					</DialogDescription>
				</DialogHeader>
				<Tabs
					value={activeTab}
					onValueChange={(value) =>
						setActiveTab(value === "manual" ? "manual" : "spotify")
					}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="spotify">Spotify</TabsTrigger>
						<TabsTrigger value="manual">Manual</TabsTrigger>
					</TabsList>
					<TabsContent value="spotify" className="space-y-2">
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
					</TabsContent>
					<TabsContent value="manual" className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="add-album-manual-title">Title</Label>
							<Input
								id="add-album-manual-title"
								value={manualTitle}
								disabled={isSubmitting}
								placeholder="Album title"
								onChange={(event) => setManualTitle(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="add-album-manual-artist">Artist</Label>
							<Input
								id="add-album-manual-artist"
								value={manualArtist}
								disabled={isSubmitting}
								placeholder="Artist name"
								onChange={(event) => setManualArtist(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="add-album-manual-year">Year</Label>
							<Input
								id="add-album-manual-year"
								value={manualYear}
								disabled={isSubmitting}
								placeholder="2024"
								inputMode="numeric"
								maxLength={4}
								onChange={(event) => {
									const digitsOnly = event.target.value.replace(/\D/g, "");
									setManualYear(digitsOnly.slice(0, 4));
								}}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="add-album-manual-cover-url">
								Cover URL (optional)
							</Label>
							<Input
								id="add-album-manual-cover-url"
								value={manualCoverUrl}
								disabled={isSubmitting}
								placeholder="https://..."
								onChange={(event) => setManualCoverUrl(event.target.value)}
							/>
							{showManualCoverPreview && (
								<img
									src={trimmedManualCoverUrl}
									alt="Cover preview"
									className="h-20 w-20 rounded-md object-cover"
								/>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="add-album-manual-record-listen"
								checked={manualRecordListen}
								disabled={isSubmitting}
								onCheckedChange={(checked) =>
									setManualRecordListen(checked === true)
								}
							/>
							<Label
								htmlFor="add-album-manual-record-listen"
								className="font-normal"
							>
								Also record a listen
							</Label>
						</div>
						{manualRecordListen && (
							<div className="space-y-2">
								<Label htmlFor="add-album-manual-listen-date">
									Listen date
								</Label>
								<Input
									id="add-album-manual-listen-date"
									type="date"
									value={manualListenDate}
									disabled={isSubmitting}
									onChange={(event) => setManualListenDate(event.target.value)}
								/>
							</div>
						)}
					</TabsContent>
				</Tabs>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isSubmitting}
						onClick={() => onOpenChange(false)}
					>
						{isSubmitting && activeTab === "spotify" ? "Adding…" : "Cancel"}
					</Button>
					{activeTab === "manual" && (
						<Button
							type="button"
							disabled={isSubmitting}
							onClick={() => void handleManualSubmit()}
						>
							{isSubmitting ? "Adding…" : "Add album"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

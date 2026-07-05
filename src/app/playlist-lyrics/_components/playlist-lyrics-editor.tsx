"use client";

import { useMutation, useQuery } from "convex/react";
import { Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import type { ClipboardEvent, FormEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import {
	formatTrackDurationInput,
	parseTrackDurationInput,
} from "~/lib/zine/zine-song-header-content";
import { IntroContentEditor } from "~/components/zine/intro-content-editor";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getPlaylistDisplayTrackNumber } from "../_utils/song-display";

const TRACK_INTRO_HELPER_TEXT =
	"Use **bold**, *italic*, and blank lines for paragraphs.";

type PlaylistFields = {
	title: string;
	theme: string;
	description: string;
	notes: string;
};

type PlaylistFieldName = keyof PlaylistFields;
type PlaylistItemFieldName =
	| "songTitleOverride"
	| "artistNameOverride"
	| "albumTitleOverride"
	| "albumArtUrlOverride"
	| "userNote"
	| "introContent";
type PlaylistLyricsItem = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};
type ItemBusyAction = "delete" | "rescrape" | "save";

export function PlaylistLyricsEditor({ slug }: { slug: string }): ReactElement {
	const data = useQuery(api.playlistLyrics.getBySlug, { slug });
	const updatePlaylist = useMutation(api.playlistLyrics.updatePlaylist);
	const updateItem = useMutation(api.playlistLyrics.updateItem);
	const deleteItem = useMutation(api.playlistLyrics.deleteItem);
	const createManualItem = useMutation(api.playlistLyrics.createManualItem);

	const [playlistFields, setPlaylistFields] = useState<PlaylistFields>({
		title: "",
		theme: "",
		description: "",
		notes: "",
	});
	const [savingPlaylistField, setSavingPlaylistField] =
		useState<PlaylistFieldName | null>(null);
	const [songUrl, setSongUrl] = useState("");
	const [isAddingSong, setIsAddingSong] = useState(false);
	const [manualSongTitle, setManualSongTitle] = useState("");
	const [manualArtistName, setManualArtistName] = useState("");
	const [manualAlbumTitle, setManualAlbumTitle] = useState("");
	const [manualIntroContent, setManualIntroContent] = useState("");
	const [isAddingManualSong, setIsAddingManualSong] = useState(false);
	const [isRescrapingAll, setIsRescrapingAll] = useState(false);
	const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
	const [busyItems, setBusyItems] = useState<Record<string, ItemBusyAction>>(
		{},
	);

	useEffect(() => {
		if (!data) return;

		setPlaylistFields({
			title: data.playlist.title,
			theme: data.playlist.theme ?? "",
			description: data.playlist.description ?? "",
			notes: data.playlist.notes ?? "",
		});
	}, [data]);

	async function handlePlaylistFieldBlur(
		field: PlaylistFieldName,
	): Promise<void> {
		if (!data) return;

		const nextValue = playlistFields[field];
		const currentValue = getPlaylistFieldValue(data.playlist, field);

		if (nextValue === currentValue) return;

		setSavingPlaylistField(field);
		try {
			const result =
				field === "title"
					? await updatePlaylist({
							playlistId: data.playlist._id,
							title: nextValue,
						})
					: field === "theme"
						? await updatePlaylist({
								playlistId: data.playlist._id,
								theme: nextValue,
							})
						: field === "description"
							? await updatePlaylist({
									playlistId: data.playlist._id,
									description: nextValue,
								})
							: await updatePlaylist({
									playlistId: data.playlist._id,
									notes: nextValue,
								});

			toast.success("Playlist saved");
		} catch (error) {
			console.error("Failed to save playlist:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to save playlist",
			);
		} finally {
			setSavingPlaylistField(null);
		}
	}

	function handlePlaylistFieldChange(
		field: PlaylistFieldName,
		value: string,
	): void {
		setPlaylistFields((current) => ({
			...current,
			[field]: value,
		}));
	}

	async function handleTogglePublicStatus(): Promise<void> {
		if (!data) return;

		const nextStatus = data.playlist.status === "ready" ? "draft" : "ready";
		setIsUpdatingStatus(true);
		try {
			await updatePlaylist({
				playlistId: data.playlist._id,
				status: nextStatus,
			});
			toast.success(
				nextStatus === "ready" ? "Playlist is public" : "Playlist is draft",
			);
		} catch (error) {
			console.error("Failed to update playlist status:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update playlist status",
			);
		} finally {
			setIsUpdatingStatus(false);
		}
	}

	function handleCopyPublicLink(): void {
		if (!data) return;

		const publicUrl = `${window.location.origin}/public/playlist-lyrics/${data.playlist.slug}`;
		navigator.clipboard.writeText(publicUrl);
		toast.success("Public link copied to clipboard!");
	}

	function handleCopyPublicZineLink(): void {
		if (!data) return;

		const publicZineUrl = `${window.location.origin}/public/playlist-lyrics/${data.playlist.slug}/zine`;
		navigator.clipboard.writeText(publicZineUrl);
		toast.success("Public zine link copied to clipboard!");
	}

	async function handleAddSong(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		await addSongUrl(songUrl);
	}

	async function handleSongUrlPaste(
		event: ClipboardEvent<HTMLInputElement>,
	): Promise<void> {
		const pastedUrl = event.clipboardData.getData("text").trim();
		if (!pastedUrl.includes("genius.com")) return;

		event.preventDefault();
		setSongUrl(pastedUrl);
		await addSongUrl(pastedUrl);
	}

	async function addSongUrl(urlInput: string): Promise<void> {
		if (!data) return;

		const url = urlInput.trim();
		if (!url) {
			toast.error("Paste a Genius song URL first");
			return;
		}

		setIsAddingSong(true);
		try {
			await postPlaylistLyricsRoute("/api/playlist-lyrics/add-song", {
				playlistId: data.playlist._id,
				url,
			});
			toast.success("Song added");
		} catch (error) {
			console.error("Failed to add song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to add song",
			);
		} finally {
			setSongUrl("");
			setIsAddingSong(false);
		}
	}

	async function handleAddManualSong(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		if (!data) return;

		const songTitle = manualSongTitle.trim();
		if (!songTitle) {
			toast.error("Enter a track title");
			return;
		}

		setIsAddingManualSong(true);
		try {
			await createManualItem({
				playlistId: data.playlist._id,
				songTitle,
				artistName: manualArtistName.trim() || undefined,
				albumTitle: manualAlbumTitle.trim() || undefined,
				introContent: manualIntroContent.trim() || undefined,
			});
			setManualSongTitle("");
			setManualArtistName("");
			setManualAlbumTitle("");
			setManualIntroContent("");
			toast.success("Instrumental track added");
		} catch (error) {
			console.error("Failed to add manual song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to add track",
			);
		} finally {
			setIsAddingManualSong(false);
		}
	}

	async function handleItemFieldBlur(
		item: PlaylistLyricsItem,
		field: PlaylistItemFieldName,
		value: string,
	): Promise<void> {
		if (value === getItemFieldValue(item, field)) return;

		setItemBusy(item._id, "save");
		try {
			if (field === "songTitleOverride") {
				await updateItem({ itemId: item._id, songTitleOverride: value });
			} else if (field === "artistNameOverride") {
				await updateItem({ itemId: item._id, artistNameOverride: value });
			} else if (field === "albumTitleOverride") {
				await updateItem({ itemId: item._id, albumTitleOverride: value });
			} else if (field === "albumArtUrlOverride") {
				await updateItem({ itemId: item._id, albumArtUrlOverride: value });
			} else if (field === "introContent") {
				await updateItem({ itemId: item._id, introContent: value });
			} else {
				await updateItem({ itemId: item._id, userNote: value });
			}

			toast.success("Song saved");
		} catch (error) {
			console.error("Failed to save song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to save song",
			);
		} finally {
			clearItemBusy(item._id);
		}
	}

	async function handleDurationBlur(
		item: PlaylistLyricsItem,
		rawInput: string,
	): Promise<void> {
		const trimmedInput = rawInput.trim();
		const currentFormatted = formatTrackDurationInput(
			item.durationSecondsOverride,
		);

		if (trimmedInput === currentFormatted) {
			return;
		}

		let parsed: number | null;
		try {
			parsed = parseTrackDurationInput(rawInput);
		} catch (error) {
			console.error("Failed to parse duration:", error);
			toast.error(
				error instanceof Error ? error.message : "Invalid duration format",
			);
			return;
		}

		if (parsed === null && item.durationSecondsOverride === undefined) {
			return;
		}
		if (parsed !== null && parsed === item.durationSecondsOverride) {
			return;
		}

		setItemBusy(item._id, "save");
		try {
			await updateItem({
				itemId: item._id,
				durationSecondsOverride: parsed,
			});
			toast.success("Song saved");
		} catch (error) {
			console.error("Failed to save duration:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to save duration",
			);
		} finally {
			clearItemBusy(item._id);
		}
	}

	async function handleCreditVisibilityChange(
		item: PlaylistLyricsItem,
		label: string,
		visible: boolean,
	): Promise<void> {
		const hiddenLabels = new Set(item.hiddenCreditLabels ?? []);
		if (visible) {
			hiddenLabels.delete(label);
		} else {
			hiddenLabels.add(label);
		}

		setItemBusy(item._id, "save");
		try {
			await updateItem({
				itemId: item._id,
				hiddenCreditLabels: Array.from(hiddenLabels),
			});
			toast.success("Credits saved");
		} catch (error) {
			console.error("Failed to save credit visibility:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to save credits",
			);
		} finally {
			clearItemBusy(item._id);
		}
	}

	async function handleDeleteItem(
		itemId: Id<"playlistLyricsItems">,
	): Promise<void> {
		setItemBusy(itemId, "delete");
		try {
			await deleteItem({ itemId });
			toast.success("Song deleted");
		} catch (error) {
			console.error("Failed to delete song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to delete song",
			);
		} finally {
			clearItemBusy(itemId);
		}
	}

	async function handleRescrapeItem(
		itemId: Id<"playlistLyricsItems">,
	): Promise<void> {
		setItemBusy(itemId, "rescrape");
		try {
			await postPlaylistLyricsRoute("/api/playlist-lyrics/rescrape-song", {
				itemId,
			});
			toast.success("Song rescraped");
		} catch (error) {
			console.error("Failed to rescrape song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to rescrape song",
			);
		} finally {
			clearItemBusy(itemId);
		}
	}

	async function handleRescrapeAll(): Promise<void> {
		if (!data) return;

		const rescrapableItems = data.songs.filter(hasRescrapeSource);
		if (rescrapableItems.length === 0) {
			toast.error("No songs have a Genius URL to rescrape");
			return;
		}

		const nextBusyItems: Record<string, ItemBusyAction> = {};
		for (const item of rescrapableItems) {
			nextBusyItems[item._id] = "rescrape";
		}

		setIsRescrapingAll(true);
		setBusyItems((current) => ({
			...current,
			...nextBusyItems,
		}));

		let succeeded = 0;
		let failed = 0;

		for (const item of rescrapableItems) {
			try {
				await postPlaylistLyricsRoute("/api/playlist-lyrics/rescrape-song", {
					itemId: item._id,
				});
				succeeded++;
			} catch (error) {
				failed++;
				console.error(`Failed to rescrape ${getDisplayTitle(item)}:`, error);
			}
		}

		setBusyItems((current) => {
			const next = { ...current };
			for (const item of rescrapableItems) {
				delete next[item._id];
			}
			return next;
		});
		setIsRescrapingAll(false);

		if (failed > 0) {
			toast.error(`Rescraped ${succeeded} songs; ${failed} failed`);
			return;
		}

		toast.success(`Rescraped ${succeeded} songs`);
	}

	function setItemBusy(
		itemId: Id<"playlistLyricsItems">,
		action: ItemBusyAction,
	): void {
		setBusyItems((current) => ({
			...current,
			[itemId]: action,
		}));
	}

	function clearItemBusy(itemId: Id<"playlistLyricsItems">): void {
		setBusyItems((current) => {
			const next = { ...current };
			delete next[itemId];
			return next;
		});
	}

	if (data === undefined) {
		return <PlaylistLyricsEditorSkeleton />;
	}

	if (data === null) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<Card>
					<CardHeader>
						<CardTitle>Playlist not found</CardTitle>
						<CardDescription>
							The playlist you&apos;re looking for does not exist or was
							deleted.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="/lyrics/playlists">Back to playlist lyrics</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	const { playlist, songs } = data;
	const currentSlug = playlist.slug;
	const isPublic = playlist.status === "ready";
	const rescrapableSongCount = songs.filter(hasRescrapeSource).length;

	return (
		<main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="text-muted-foreground text-sm">Playlist Lyrics</p>
					<h1 className="font-bold text-3xl">Edit Playlist</h1>
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void handleTogglePublicStatus();
						}}
						disabled={isUpdatingStatus}
					>
						{isUpdatingStatus
							? "Saving..."
							: isPublic
								? "Make Draft"
								: "Make Public"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={handleCopyPublicLink}
						title="Copy public link"
					>
						<LinkIcon className="mr-2 h-4 w-4" />
						Copy Public Link
					</Button>
					{isPublic ? (
						<Button
							type="button"
							variant="outline"
							onClick={handleCopyPublicZineLink}
							title="Copy public zine link"
						>
							<LinkIcon className="mr-2 h-4 w-4" />
							Copy Public Zine Link
						</Button>
					) : null}
					<Button asChild variant="outline">
						<Link href={`/playlist-lyrics/${currentSlug}`}>Print view</Link>
					</Button>
					<Button asChild variant="ghost">
						<Link href="/lyrics/playlists">Back</Link>
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Playlist Details</CardTitle>
					<CardDescription>
						Changes save when each field loses focus.
						{savingPlaylistField ? " Saving..." : ""}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="playlist-title">Title</Label>
						<Input
							id="playlist-title"
							value={playlistFields.title}
							onChange={(event) =>
								handlePlaylistFieldChange("title", event.currentTarget.value)
							}
							onBlur={() => {
								void handlePlaylistFieldBlur("title");
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="playlist-theme">Theme</Label>
						<Input
							id="playlist-theme"
							value={playlistFields.theme}
							onChange={(event) =>
								handlePlaylistFieldChange("theme", event.currentTarget.value)
							}
							onBlur={() => {
								void handlePlaylistFieldBlur("theme");
							}}
							placeholder="Optional theme or occasion"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="playlist-description">Description</Label>
						<Textarea
							id="playlist-description"
							value={playlistFields.description}
							onChange={(event) =>
								handlePlaylistFieldChange(
									"description",
									event.currentTarget.value,
								)
							}
							onBlur={() => {
								void handlePlaylistFieldBlur("description");
							}}
							placeholder="Short intro for the playlist"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="playlist-notes">Notes</Label>
						<Textarea
							id="playlist-notes"
							value={playlistFields.notes}
							onChange={(event) =>
								handlePlaylistFieldChange("notes", event.currentTarget.value)
							}
							onBlur={() => {
								void handlePlaylistFieldBlur("notes");
							}}
							placeholder="Private editing notes"
						/>
					</div>
				</CardContent>
			</Card>

			<PlaylistBackCoverQrCard
				appleMusicQrImageUrl={playlist.zineAppleMusicQrImageUrl}
				playlistId={playlist._id}
				showAppleMusicQr={playlist.zineShowAppleMusicQr === true}
				showSpotifyQr={playlist.zineShowSpotifyQr === true}
				spotifyQrImageUrl={playlist.zineSpotifyQrImageUrl}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Add Song</CardTitle>
					<CardDescription>
						Paste a Genius song URL to scrape lyrics, or add an instrumental
						track manually.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<form
						onSubmit={handleAddSong}
						className="flex flex-col gap-3 sm:flex-row"
					>
						<div className="flex-1 space-y-2">
							<Label htmlFor="genius-song-url">Genius URL</Label>
							<Input
								id="genius-song-url"
								type="url"
								value={songUrl}
								onChange={(event) => setSongUrl(event.currentTarget.value)}
								onPaste={(event) => {
									void handleSongUrlPaste(event);
								}}
								placeholder="https://genius.com/..."
								disabled={isAddingSong}
							/>
						</div>
						<Button type="submit" className="sm:mt-7" disabled={isAddingSong}>
							{isAddingSong ? "Adding..." : "Add song"}
						</Button>
					</form>

					<div className="space-y-3 border-t pt-6">
						<div>
							<h3 className="font-medium text-sm">Instrumental track</h3>
							<p className="text-muted-foreground text-sm">
								For intros, interludes, outros, or other tracks without lyrics.
							</p>
						</div>
						<form
							onSubmit={handleAddManualSong}
							className="grid gap-3 sm:grid-cols-2"
						>
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="manual-song-title">Track title</Label>
								<Input
									id="manual-song-title"
									value={manualSongTitle}
									onChange={(event) =>
										setManualSongTitle(event.currentTarget.value)
									}
									placeholder="Intro"
									disabled={isAddingManualSong}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="manual-artist-name">Artist</Label>
								<Input
									id="manual-artist-name"
									value={manualArtistName}
									onChange={(event) =>
										setManualArtistName(event.currentTarget.value)
									}
									placeholder="Optional"
									disabled={isAddingManualSong}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="manual-album-title">Album</Label>
								<Input
									id="manual-album-title"
									value={manualAlbumTitle}
									onChange={(event) =>
										setManualAlbumTitle(event.currentTarget.value)
									}
									placeholder="Optional"
									disabled={isAddingManualSong}
								/>
							</div>
							<div className="space-y-2 sm:col-span-2">
								<IntroContentEditor
									id="manual-intro-content"
									value={manualIntroContent}
									disabled={isAddingManualSong}
									label="Intro"
									placeholder="Optional intro text for the zine"
									helperText={TRACK_INTRO_HELPER_TEXT}
									onChange={setManualIntroContent}
								/>
							</div>
							<div className="sm:col-span-2">
								<Button type="submit" disabled={isAddingManualSong}>
									{isAddingManualSong ? "Adding..." : "Add instrumental track"}
								</Button>
							</div>
						</form>
					</div>
				</CardContent>
			</Card>

			<section className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 className="font-semibold text-2xl">Songs</h2>
						<p className="text-muted-foreground text-sm">
							{songs.length} {songs.length === 1 ? "song" : "songs"} in this
							playlist.
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						disabled={isRescrapingAll || rescrapableSongCount === 0}
						onClick={() => {
							void handleRescrapeAll();
						}}
					>
						{isRescrapingAll
							? "Rescraping all..."
							: `Rescrape all (${rescrapableSongCount})`}
					</Button>
				</div>

				{songs.length === 0 ? (
					<Card>
						<CardContent className="pt-6">
							<p className="text-muted-foreground text-sm">
								No songs yet. Add a Genius URL or an instrumental track above.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{songs.map((item, index) => (
							<PlaylistSongCard
								key={item._id}
								item={item}
								trackNumber={getPlaylistDisplayTrackNumber(index)}
								busyAction={busyItems[item._id]}
								onItemFieldBlur={handleItemFieldBlur}
								onDurationBlur={handleDurationBlur}
								onCreditVisibilityChange={handleCreditVisibilityChange}
								onDeleteItem={handleDeleteItem}
								onRescrapeItem={handleRescrapeItem}
							/>
						))}
					</div>
				)}
			</section>
		</main>
	);
}

async function postPlaylistLyricsRoute(
	path: string,
	body: Record<string, string>,
): Promise<void> {
	const response = await fetch(path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (response.ok) return;

	throw new Error(await readPlaylistLyricsRouteError(response));
}

async function readPlaylistLyricsRouteError(
	response: Response,
): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error || "Playlist lyrics request failed";
	} catch {
		return "Playlist lyrics request failed";
	}
}

function PlaylistBackCoverQrCard({
	playlistId,
	spotifyQrImageUrl,
	appleMusicQrImageUrl,
	showSpotifyQr,
	showAppleMusicQr,
}: {
	playlistId: Id<"playlistLyrics">;
	spotifyQrImageUrl?: string;
	appleMusicQrImageUrl?: string;
	showSpotifyQr: boolean;
	showAppleMusicQr: boolean;
}): ReactElement {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Back cover QR codes</CardTitle>
				<CardDescription>
					Upload Spotify and Apple Music playlist QR codes for the zine back
					cover. Each appears bottom-left only when uploaded and toggled on.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-8 sm:grid-cols-2">
				<PlaylistQrSlotEditor
					initialImageUrl={spotifyQrImageUrl}
					initialShow={showSpotifyQr}
					label="Spotify"
					playlistId={playlistId}
					service="spotify"
				/>
				<PlaylistQrSlotEditor
					initialImageUrl={appleMusicQrImageUrl}
					initialShow={showAppleMusicQr}
					label="Apple Music"
					playlistId={playlistId}
					service="appleMusic"
				/>
			</CardContent>
		</Card>
	);
}

type QrService = "spotify" | "appleMusic";

function PlaylistQrSlotEditor({
	playlistId,
	service,
	label,
	initialImageUrl,
	initialShow,
}: {
	playlistId: Id<"playlistLyrics">;
	service: QrService;
	label: string;
	initialImageUrl?: string;
	initialShow: boolean;
}): ReactElement {
	const updateSpotifyQr = useMutation(api.playlistLyrics.updateZineSpotifyQr);
	const updateAppleMusicQr = useMutation(
		api.playlistLyrics.updateZineAppleMusicQr,
	);
	const updateQrToggles = useMutation(api.playlistLyrics.updateZineQrToggles);
	const generateUploadUrl = useMutation(
		api.playlistLyrics.generateZineCoverUploadUrl,
	);

	const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
	const [showOnBackCover, setShowOnBackCover] = useState(initialShow);
	const [isUploading, setIsUploading] = useState(false);
	const [isSavingUrl, setIsSavingUrl] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setImageUrl(initialImageUrl ?? "");
		setShowOnBackCover(initialShow);
	}, [initialImageUrl, initialShow]);

	const resolvedImageUrl = imageUrl.trim() || undefined;
	const inputIdPrefix = `playlist-qr-${service}`;

	async function persistImageUrl(nextUrl: string): Promise<string | undefined> {
		const trimmed = nextUrl.trim();
		const updateQr =
			service === "spotify" ? updateSpotifyQr : updateAppleMusicQr;
		const result = await updateQr({
			playlistId,
			qrImageUrl: trimmed.length > 0 ? trimmed : "",
		});
		return result.qrImageUrl;
	}

	async function handleUrlBlur(): Promise<void> {
		const trimmed = imageUrl.trim();
		const initialTrimmed = (initialImageUrl ?? "").trim();
		if (trimmed === initialTrimmed) return;

		setIsSavingUrl(true);
		try {
			const saved = await persistImageUrl(imageUrl);
			setImageUrl(saved ?? "");
			toast.success(`${label} QR saved`);
		} catch (error) {
			console.error(`Failed to save ${label} QR:`, error);
			toast.error(
				error instanceof Error ? error.message : `Failed to save ${label} QR`,
			);
		} finally {
			setIsSavingUrl(false);
		}
	}

	async function handleFileUpload(file: File | undefined): Promise<void> {
		if (!file) return;

		const maxBytes = 15 * 1024 * 1024;
		if (file.size > maxBytes) {
			toast.error("Image must be 15 MB or smaller");
			return;
		}

		setIsUploading(true);
		try {
			const uploadUrl = await generateUploadUrl({});
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});

			if (!response.ok) {
				throw new Error("Upload failed");
			}

			const { storageId } = (await response.json()) as { storageId: string };
			const updateQr =
				service === "spotify" ? updateSpotifyQr : updateAppleMusicQr;
			const result = await updateQr({
				playlistId,
				storageId: storageId as Id<"_storage">,
			});
			setImageUrl(result.qrImageUrl ?? "");
			toast.success(`${label} QR uploaded`);
		} catch (error) {
			console.error(`Failed to upload ${label} QR:`, error);
			toast.error(`Failed to upload ${label} QR`);
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	}

	async function handleShowToggle(checked: boolean): Promise<void> {
		setShowOnBackCover(checked);
		try {
			await updateQrToggles(
				service === "spotify"
					? { playlistId, showSpotifyQr: checked }
					: { playlistId, showAppleMusicQr: checked },
			);
		} catch (error) {
			setShowOnBackCover(!checked);
			console.error(`Failed to update ${label} QR toggle:`, error);
			toast.error(`Failed to update ${label} visibility`);
		}
	}

	return (
		<div className="space-y-3">
			<p className="font-medium text-sm">{label}</p>
			{resolvedImageUrl ? (
				<img
					alt={`${label} QR preview`}
					className="h-24 w-24 rounded-md border bg-white object-contain"
					src={resolvedImageUrl}
				/>
			) : null}
			<div className="space-y-2">
				<Label htmlFor={`${inputIdPrefix}-url`}>Image URL</Label>
				<Input
					id={`${inputIdPrefix}-url`}
					type="url"
					value={imageUrl}
					disabled={isUploading || isSavingUrl}
					placeholder="https://…"
					onChange={(event) => setImageUrl(event.currentTarget.value)}
					onBlur={() => {
						void handleUrlBlur();
					}}
				/>
			</div>
			<p className="text-center text-muted-foreground text-xs">or</p>
			<div className="space-y-2">
				<Label htmlFor={`${inputIdPrefix}-file`}>Upload image</Label>
				<input
					ref={fileInputRef}
					accept="image/jpeg,image/png,image/webp,image/gif"
					className="sr-only"
					id={`${inputIdPrefix}-file`}
					type="file"
					onChange={(event) => {
						const file = event.target.files?.[0];
						void handleFileUpload(file);
					}}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={isUploading || isSavingUrl}
					onClick={() => fileInputRef.current?.click()}
				>
					{isUploading ? "Uploading…" : "Choose file"}
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id={`${inputIdPrefix}-show`}
					checked={showOnBackCover}
					disabled={!resolvedImageUrl || isUploading || isSavingUrl}
					onCheckedChange={(checked) => {
						void handleShowToggle(checked === true);
					}}
				/>
				<Label
					htmlFor={`${inputIdPrefix}-show`}
					className="font-normal text-sm"
				>
					Show on back cover
				</Label>
			</div>
		</div>
	);
}

function PlaylistSongCard({
	item,
	trackNumber,
	busyAction,
	onItemFieldBlur,
	onDurationBlur,
	onCreditVisibilityChange,
	onDeleteItem,
	onRescrapeItem,
}: {
	item: PlaylistLyricsItem;
	trackNumber: number;
	busyAction?: ItemBusyAction;
	onItemFieldBlur: (
		item: PlaylistLyricsItem,
		field: PlaylistItemFieldName,
		value: string,
	) => Promise<void>;
	onDurationBlur: (item: PlaylistLyricsItem, rawInput: string) => Promise<void>;
	onCreditVisibilityChange: (
		item: PlaylistLyricsItem,
		label: string,
		visible: boolean,
	) => Promise<void>;
	onDeleteItem: (itemId: Id<"playlistLyricsItems">) => Promise<void>;
	onRescrapeItem: (itemId: Id<"playlistLyricsItems">) => Promise<void>;
}): ReactElement {
	const sourceUrl = item.scrape?.canonicalUrl ?? item.pendingUrl;
	const isManual = item.scrapeState === "manual";
	const isBusy = busyAction !== undefined;
	const displayMetadata = getDisplayMetadataParts(item);
	const [albumArtUrlOverride, setAlbumArtUrlOverride] = useState(
		item.albumArtUrlOverride ?? "",
	);
	const [durationInput, setDurationInput] = useState(
		formatTrackDurationInput(item.durationSecondsOverride),
	);
	const albumArtPreviewUrl =
		albumArtUrlOverride.trim() || item.scrape?.albumArtUrl?.trim();

	useEffect(() => {
		setAlbumArtUrlOverride(item.albumArtUrlOverride ?? "");
	}, [item.albumArtUrlOverride]);

	useEffect(() => {
		setDurationInput(formatTrackDurationInput(item.durationSecondsOverride));
	}, [item.durationSecondsOverride]);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<CardTitle>
							{trackNumber}. {getDisplayTitle(item)}
						</CardTitle>
						<CardDescription>{displayMetadata.join(" - ")}</CardDescription>
					</div>
					<div className="flex gap-2">
						{!isManual ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isBusy}
								onClick={() => {
									void onRescrapeItem(item._id);
								}}
							>
								{busyAction === "rescrape" ? "Rescraping..." : "Rescrape"}
							</Button>
						) : null}
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={isBusy}
							onClick={() => {
								void onDeleteItem(item._id);
							}}
						>
							{busyAction === "delete" ? "Deleting..." : "Delete"}
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				{isManual ? (
					<div className="rounded-lg border bg-muted/30 p-4 text-sm">
						<p className="text-muted-foreground">
							Manual instrumental track — no Genius scrape or lyrics.
						</p>
					</div>
				) : (
					<div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
						<MetadataRow label="Scrape state" value={item.scrapeState} />
						<MetadataRow
							label="Last scraped"
							value={
								item.scrape
									? formatDate(item.scrape.lastScrapedAt)
									: "Not scraped"
							}
						/>
						<MetadataRow
							label="Scraped title"
							value={item.scrape?.songTitle ?? "Unavailable"}
						/>
						<MetadataRow
							label="Scraped artist"
							value={item.scrape?.artistName ?? "Unavailable"}
						/>
						<MetadataRow
							label="Scraped album"
							value={getScrapedAlbumTitle(item) ?? "Unavailable"}
						/>
						<MetadataRow
							label="Scraped album art"
							value={item.scrape?.albumArtUrl ?? "Unavailable"}
						/>
						<MetadataRow
							label="Scraped year"
							value={getScrapedAlbumYear(item) ?? "Unavailable"}
						/>
						<MetadataRow
							label="Pending URL"
							value={item.pendingUrl ?? "None"}
						/>
						{sourceUrl ? (
							<div className="sm:col-span-2">
								<div className="text-muted-foreground">Source</div>
								<a
									href={sourceUrl}
									target="_blank"
									rel="noreferrer"
									className="break-all text-primary underline-offset-4 hover:underline"
								>
									{sourceUrl}
								</a>
							</div>
						) : null}
					</div>
				)}

				{item.scrape?.credits && item.scrape.credits.length > 0 ? (
					<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
						<div>
							<p className="font-medium text-sm">Credits</p>
							<p className="text-muted-foreground text-xs">
								Choose which scraped Genius credit rows appear in the print
								view.
							</p>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{item.scrape.credits.map((credit, index) => {
								const inputId = `playlist-credit-${item._id}-${index}`;
								const isVisible = !item.hiddenCreditLabels?.includes(
									credit.label,
								);

								return (
									<div key={credit.label} className="flex items-start gap-2">
										<Checkbox
											id={inputId}
											checked={isVisible}
											disabled={isBusy}
											onCheckedChange={(checked) => {
												void onCreditVisibilityChange(
													item,
													credit.label,
													checked === true,
												);
											}}
										/>
										<div className="space-y-1">
											<Label
												htmlFor={inputId}
												className="cursor-pointer font-normal text-sm"
											>
												{credit.label}
											</Label>
											<p className="text-muted-foreground text-xs">
												{credit.contributors
													.map((contributor) => contributor.name)
													.join(", ")}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : null}

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={`song-title-${item._id}`}>Title override</Label>
						<Input
							id={`song-title-${item._id}`}
							defaultValue={item.songTitleOverride ?? ""}
							placeholder={
								item.scrape?.songTitle ?? item.songTitleOverride ?? "Song title"
							}
							disabled={isBusy}
							onBlur={(event) => {
								void onItemFieldBlur(
									item,
									"songTitleOverride",
									event.currentTarget.value,
								);
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`song-artist-${item._id}`}>Artist override</Label>
						<Input
							id={`song-artist-${item._id}`}
							defaultValue={item.artistNameOverride ?? ""}
							placeholder={item.scrape?.artistName ?? "Artist"}
							disabled={isBusy}
							onBlur={(event) => {
								void onItemFieldBlur(
									item,
									"artistNameOverride",
									event.currentTarget.value,
								);
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`song-album-${item._id}`}>Album override</Label>
						<Input
							id={`song-album-${item._id}`}
							defaultValue={item.albumTitleOverride ?? ""}
							placeholder={getScrapedAlbumTitle(item) ?? "Album"}
							disabled={isBusy}
							onBlur={(event) => {
								void onItemFieldBlur(
									item,
									"albumTitleOverride",
									event.currentTarget.value,
								);
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`song-duration-${item._id}`}>
							Duration override
						</Label>
						<Input
							id={`song-duration-${item._id}`}
							value={durationInput}
							placeholder="3:15"
							disabled={isBusy}
							onChange={(event) => setDurationInput(event.currentTarget.value)}
							onBlur={(event) => {
								void onDurationBlur(item, event.currentTarget.value);
							}}
						/>
						<p className="text-muted-foreground text-xs">
							m:ss for the zine header. Leave empty for auto.
						</p>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor={`song-album-art-${item._id}`}>
							Album art URL override
						</Label>
						<Input
							id={`song-album-art-${item._id}`}
							type="url"
							value={albumArtUrlOverride}
							placeholder={item.scrape?.albumArtUrl ?? "Album art URL"}
							disabled={isBusy}
							onChange={(event) =>
								setAlbumArtUrlOverride(event.currentTarget.value)
							}
							onBlur={(event) => {
								void onItemFieldBlur(
									item,
									"albumArtUrlOverride",
									event.currentTarget.value,
								);
							}}
						/>
						{albumArtPreviewUrl ? (
							<div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
								<img
									src={albumArtPreviewUrl}
									alt={`${getDisplayTitle(item)} album art preview`}
									className="h-16 w-16 rounded-md object-cover"
								/>
								<div className="min-w-0 text-sm">
									<div className="font-medium">Album art preview</div>
									<div className="text-muted-foreground text-xs">
										{albumArtUrlOverride.trim()
											? "Using override URL"
											: "Using scraped art"}
									</div>
								</div>
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No album art available.
							</p>
						)}
					</div>
				</div>

				<SongIntroField
					item={item}
					isBusy={isBusy}
					onSave={(value) => {
						void onItemFieldBlur(item, "introContent", value);
					}}
				/>

				<div className="space-y-2">
					<Label htmlFor={`song-note-${item._id}`}>Song note</Label>
					<Textarea
						id={`song-note-${item._id}`}
						defaultValue={item.userNote ?? ""}
						placeholder="Optional note for this song"
						disabled={isBusy}
						onBlur={(event) => {
							void onItemFieldBlur(item, "userNote", event.currentTarget.value);
						}}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function SongIntroField({
	item,
	isBusy,
	onSave,
}: {
	item: PlaylistLyricsItem;
	isBusy: boolean;
	onSave: (value: string) => void;
}) {
	const [value, setValue] = useState(item.introContent ?? "");

	useEffect(() => {
		setValue(item.introContent ?? "");
	}, [item._id, item.introContent]);

	return (
		<IntroContentEditor
			id={`song-intro-${item._id}`}
			value={value}
			disabled={isBusy}
			label="Intro"
			placeholder="Optional intro for the zine INTRO section"
			helperText={TRACK_INTRO_HELPER_TEXT}
			onChange={setValue}
			onBlur={() => onSave(value)}
		/>
	);
}

function MetadataRow({
	label,
	value,
}: {
	label: string;
	value: string;
}): ReactElement {
	return (
		<div>
			<div className="text-muted-foreground">{label}</div>
			<div className="break-words">{value}</div>
		</div>
	);
}

function PlaylistLyricsEditorSkeleton(): ReactElement {
	return (
		<main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
			<div className="flex items-start justify-between">
				<div className="space-y-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-9 w-64" />
				</div>
				<Skeleton className="h-9 w-28" />
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-72" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-24 w-full" />
				</CardContent>
			</Card>
			<Card>
				<CardContent className="space-y-4 pt-6">
					<Skeleton className="h-7 w-56" />
					<Skeleton className="h-32 w-full" />
				</CardContent>
			</Card>
		</main>
	);
}

function getPlaylistFieldValue(
	playlist: Doc<"playlistLyrics">,
	field: PlaylistFieldName,
): string {
	if (field === "title") return playlist.title;
	if (field === "theme") return playlist.theme ?? "";
	if (field === "description") return playlist.description ?? "";
	return playlist.notes ?? "";
}

function getItemFieldValue(
	item: PlaylistLyricsItem,
	field: PlaylistItemFieldName,
): string {
	if (field === "songTitleOverride") return item.songTitleOverride ?? "";
	if (field === "artistNameOverride") return item.artistNameOverride ?? "";
	if (field === "albumTitleOverride") return item.albumTitleOverride ?? "";
	if (field === "albumArtUrlOverride") return item.albumArtUrlOverride ?? "";
	if (field === "introContent") return item.introContent ?? "";
	return item.userNote ?? "";
}

function getDisplayTitle(item: PlaylistLyricsItem): string {
	return item.songTitleOverride ?? item.scrape?.songTitle ?? "Untitled song";
}

function getDisplayArtist(item: PlaylistLyricsItem): string {
	return item.artistNameOverride ?? item.scrape?.artistName ?? "Unknown artist";
}

function getDisplayAlbum(item: PlaylistLyricsItem): string {
	const album = splitAlbumTitleAndYear(
		item.albumTitleOverride ?? item.scrape?.albumTitle,
	);

	return album.title ?? "";
}

function getDisplayMetadataParts(item: PlaylistLyricsItem): string[] {
	const parts = [getDisplayArtist(item)];
	const album = getDisplayAlbum(item);
	const year = getScrapedAlbumYear(item);

	if (album) {
		parts.push(album);
	}

	if (year) {
		parts.push(year);
	}

	return parts;
}

function getScrapedAlbumTitle(item: PlaylistLyricsItem): string | undefined {
	return splitAlbumTitleAndYear(item.scrape?.albumTitle).title;
}

function getScrapedAlbumYear(item: PlaylistLyricsItem): string | undefined {
	return (
		item.scrape?.albumYear ??
		splitAlbumTitleAndYear(item.scrape?.albumTitle).year
	);
}

function hasRescrapeSource(item: PlaylistLyricsItem): boolean {
	return Boolean(item.scrape?.canonicalUrl || item.pendingUrl?.trim());
}

function splitAlbumTitleAndYear(albumTitle: string | undefined): {
	title: string | undefined;
	year: string | undefined;
} {
	if (!albumTitle) {
		return { title: undefined, year: undefined };
	}

	let year: string | undefined;
	const title = albumTitle
		.replace(/\(([^)]*)\)/g, (_match, parenthetical: string) => {
			const trimmedParenthetical = parenthetical.trim();
			if (!year && /^\d{4}$/.test(trimmedParenthetical)) {
				year = trimmedParenthetical;
			}

			return "";
		})
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		title: title || undefined,
		year,
	};
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

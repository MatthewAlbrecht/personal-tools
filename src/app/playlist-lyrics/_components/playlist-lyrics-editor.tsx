"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardEvent, FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

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
	| "userNote";
type PlaylistLyricsItem = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};
type ItemBusyAction = "delete" | "rescrape" | "save";

export function PlaylistLyricsEditor({ slug }: { slug: string }): ReactElement {
	const router = useRouter();
	const data = useQuery(api.playlistLyrics.getBySlug, { slug });
	const updatePlaylist = useMutation(api.playlistLyrics.updatePlaylist);
	const addSongFromUrl = useAction(api.playlistLyrics.addSongFromUrl);
	const updateItem = useMutation(api.playlistLyrics.updateItem);
	const deleteItem = useMutation(api.playlistLyrics.deleteItem);
	const rescrapeItem = useAction(api.playlistLyrics.rescrapeItem);

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

			if (field === "title" && result.slug !== data.playlist.slug) {
				router.replace(`/playlist-lyrics/${result.slug}/edit`);
			}
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
			await addSongFromUrl({
				playlistId: data.playlist._id,
				url,
			});
			setSongUrl("");
			toast.success("Song added");
		} catch (error) {
			console.error("Failed to add song:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to add song",
			);
		} finally {
			setIsAddingSong(false);
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
			await rescrapeItem({ itemId });
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
							<Link href="/playlist-lyrics">Back to playlist lyrics</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	const { playlist, songs } = data;
	const currentSlug = playlist.slug;

	return (
		<main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="text-muted-foreground text-sm">Playlist Lyrics</p>
					<h1 className="font-bold text-3xl">Edit Playlist</h1>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link href={`/playlist-lyrics/${currentSlug}`}>Print view</Link>
					</Button>
					<Button asChild variant="ghost">
						<Link href="/playlist-lyrics">Back</Link>
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

			<Card>
				<CardHeader>
					<CardTitle>Add Song</CardTitle>
					<CardDescription>
						Paste a Genius song URL to scrape lyrics and add it to this
						playlist.
					</CardDescription>
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>

			<section className="space-y-4">
				<div>
					<h2 className="font-semibold text-2xl">Songs</h2>
					<p className="text-muted-foreground text-sm">
						{songs.length} {songs.length === 1 ? "song" : "songs"} in this
						playlist.
					</p>
				</div>

				{songs.length === 0 ? (
					<Card>
						<CardContent className="pt-6">
							<p className="text-muted-foreground text-sm">
								No songs yet. Add a Genius URL above to start the playlist.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{songs.map((item) => (
							<PlaylistSongCard
								key={item._id}
								item={item}
								busyAction={busyItems[item._id]}
								onItemFieldBlur={handleItemFieldBlur}
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

function PlaylistSongCard({
	item,
	busyAction,
	onItemFieldBlur,
	onDeleteItem,
	onRescrapeItem,
}: {
	item: PlaylistLyricsItem;
	busyAction?: ItemBusyAction;
	onItemFieldBlur: (
		item: PlaylistLyricsItem,
		field: PlaylistItemFieldName,
		value: string,
	) => Promise<void>;
	onDeleteItem: (itemId: Id<"playlistLyricsItems">) => Promise<void>;
	onRescrapeItem: (itemId: Id<"playlistLyricsItems">) => Promise<void>;
}): ReactElement {
	const sourceUrl = item.scrape?.canonicalUrl ?? item.pendingUrl;
	const isBusy = busyAction !== undefined;

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<CardTitle>
							{item.position}. {getDisplayTitle(item)}
						</CardTitle>
						<CardDescription>
							{getDisplayArtist(item)}
							{getDisplayAlbum(item) ? ` - ${getDisplayAlbum(item)}` : ""}
						</CardDescription>
					</div>
					<div className="flex gap-2">
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
						value={item.scrape?.albumTitle ?? "Unavailable"}
					/>
					<MetadataRow label="Pending URL" value={item.pendingUrl ?? "None"} />
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

				<div className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label htmlFor={`song-title-${item._id}`}>Title override</Label>
						<Input
							id={`song-title-${item._id}`}
							defaultValue={item.songTitleOverride ?? ""}
							placeholder={item.scrape?.songTitle ?? "Song title"}
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
							placeholder={item.scrape?.albumTitle ?? "Album"}
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
				</div>

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
	return item.userNote ?? "";
}

function getDisplayTitle(item: PlaylistLyricsItem): string {
	return item.songTitleOverride ?? item.scrape?.songTitle ?? "Untitled song";
}

function getDisplayArtist(item: PlaylistLyricsItem): string {
	return item.artistNameOverride ?? item.scrape?.artistName ?? "Unknown artist";
}

function getDisplayAlbum(item: PlaylistLyricsItem): string {
	return item.albumTitleOverride ?? item.scrape?.albumTitle ?? "";
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

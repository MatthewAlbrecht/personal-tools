"use client";

import { useMutation, useQuery } from "convex/react";
import { Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import type { ClipboardEvent, FormEvent, ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import {
	type ZineEditorPersistStatus,
	mergePersistStatuses,
	useZineEditorPersist,
} from "~/components/zine/editor/use-zine-editor-persist";
import { ZineEditorChapter } from "~/components/zine/editor/zine-editor-chapter";
import {
	type ZineEditorNavItem,
	ZineEditorShell,
} from "~/components/zine/editor/zine-editor-shell";
import { ZineField } from "~/components/zine/editor/zine-field";
import {
	ZineTrackRow,
	type ZineTrackRowFields,
	type ZineTrackRowStatus,
} from "~/components/zine/editor/zine-track-row";
import { IntroContentEditor } from "~/components/zine/intro-content-editor";
import { ZineInsideBackSectionsEditor } from "~/components/zine/zine-inside-back-sections-editor";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import type { ZineInsideBackSection } from "~/lib/zine/zine-inside-back-sections";
import { coerceZineInsideBackSections } from "~/lib/zine/zine-inside-back-sections";
import { coerceZinePageRecommendations } from "~/lib/zine/zine-page-recommendations";
import {
	formatTrackDuration,
	formatTrackDurationInput,
	parseTrackDurationInput,
} from "~/lib/zine/zine-song-header-content";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getPlaylistDisplayTrackNumber } from "../_utils/song-display";
import { SyncSpotifyPlaylistDialog } from "./sync-spotify-playlist-dialog";

type PlaylistFields = {
	title: string;
	theme: string;
	description: string;
	notes: string;
};

type PlaylistLyricsItem = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};

type TrackActionBusy = "delete" | "rescrape";

export function PlaylistLyricsEditor({ slug }: { slug: string }): ReactElement {
	const data = useQuery(api.playlistLyrics.getBySlug, { slug });
	const updatePlaylist = useMutation(api.playlistLyrics.updatePlaylist);
	const updateItem = useMutation(api.playlistLyrics.updateItem);
	const applyCreditDefaultsToPlaylist = useMutation(
		api.playlistLyrics.applyCreditDefaultsToPlaylist,
	);
	const deleteItem = useMutation(api.playlistLyrics.deleteItem);
	const createManualItem = useMutation(api.playlistLyrics.createManualItem);
	const updateZineInsideBackSections = useMutation(
		api.playlistLyrics.updateZineInsideBackSections,
	);
	const { userId } = useAuthToken();

	const [songUrl, setSongUrl] = useState("");
	const [isAddingSong, setIsAddingSong] = useState(false);
	const [manualSongTitle, setManualSongTitle] = useState("");
	const [manualArtistName, setManualArtistName] = useState("");
	const [manualAlbumTitle, setManualAlbumTitle] = useState("");
	const [manualIntroContent, setManualIntroContent] = useState("");
	const [isAddingManualSong, setIsAddingManualSong] = useState(false);
	const [isRescrapingAll, setIsRescrapingAll] = useState(false);
	const [isApplyingCreditDefaults, setIsApplyingCreditDefaults] =
		useState(false);
	const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
	const [busyItems, setBusyItems] = useState<Record<string, TrackActionBusy>>(
		{},
	);
	const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
	const [visibleTrackId, setVisibleTrackId] = useState<string | null>(null);
	const [editorNotesOpen, setEditorNotesOpen] = useState(false);
	const [spotifySyncOpen, setSpotifySyncOpen] = useState(false);
	const [trackStatuses, setTrackStatuses] = useState<
		Record<string, ZineEditorPersistStatus>
	>({});

	const playlistServer = useMemo((): PlaylistFields => {
		if (!data) {
			return { title: "", theme: "", description: "", notes: "" };
		}
		return {
			title: data.playlist.title,
			theme: data.playlist.theme ?? "",
			description: data.playlist.description ?? "",
			notes: data.playlist.notes ?? "",
		};
	}, [data]);

	const playlistPersist = useZineEditorPersist(
		playlistServer,
		async (fields) => {
			if (!data) return;
			await updatePlaylist({
				playlistId: data.playlist._id,
				title: fields.title,
				theme: fields.theme,
				description: fields.description,
				notes: fields.notes,
			});
		},
		{ enabled: data !== undefined && data !== null },
	);

	const insideBackServer = useMemo(
		() => coerceZineInsideBackSections(data?.playlist.zineInsideBackSections),
		[data?.playlist.zineInsideBackSections],
	);
	const insideBackPersist = useZineEditorPersist(
		insideBackServer,
		async (sections: ZineInsideBackSection[]) => {
			if (!data) return;
			await updateZineInsideBackSections({
				playlistId: data.playlist._id,
				sections,
			});
		},
		{ enabled: data !== undefined && data !== null },
	);

	const overallStatus = mergePersistStatuses([
		playlistPersist.status,
		insideBackPersist.status,
		...Object.values(trackStatuses),
	]);
	const persistError =
		playlistPersist.errorMessage ?? insideBackPersist.errorMessage ?? null;

	const handleTrackStatus = useCallback(
		(trackId: string, status: ZineEditorPersistStatus) => {
			setTrackStatuses((current) => {
				if (current[trackId] === status) return current;
				return { ...current, [trackId]: status };
			});
		},
		[],
	);

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
		toast.success("Public link copied");
	}

	function handleCopyPublicZineLink(): void {
		if (!data) return;
		const publicZineUrl = `${window.location.origin}/public/playlist-lyrics/${data.playlist.slug}/zine`;
		navigator.clipboard.writeText(publicZineUrl);
		toast.success("Public zine link copied");
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
			toast.error(
				error instanceof Error ? error.message : "Failed to add track",
			);
		} finally {
			setIsAddingManualSong(false);
		}
	}

	async function handleDeleteItem(
		itemId: Id<"playlistLyricsItems">,
	): Promise<void> {
		setBusyItems((current) => ({ ...current, [itemId]: "delete" }));
		try {
			await deleteItem({ itemId });
			toast.success("Song deleted");
			if (expandedTrackId === itemId) setExpandedTrackId(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete song",
			);
		} finally {
			setBusyItems((current) => {
				const next = { ...current };
				delete next[itemId];
				return next;
			});
		}
	}

	async function handleRescrapeItem(
		itemId: Id<"playlistLyricsItems">,
	): Promise<void> {
		setBusyItems((current) => ({ ...current, [itemId]: "rescrape" }));
		try {
			await postPlaylistLyricsRoute("/api/playlist-lyrics/rescrape-song", {
				itemId,
			});
			toast.success("Song rescraped");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to rescrape song",
			);
		} finally {
			setBusyItems((current) => {
				const next = { ...current };
				delete next[itemId];
				return next;
			});
		}
	}

	async function handleRescrapeAll(): Promise<void> {
		if (!data) return;
		const rescrapableItems = data.songs.filter(hasRescrapeSource);
		if (rescrapableItems.length === 0) {
			toast.error("No songs have a Genius URL to rescrape");
			return;
		}
		const nextBusy: Record<string, TrackActionBusy> = {};
		for (const item of rescrapableItems) {
			nextBusy[item._id] = "rescrape";
		}
		setIsRescrapingAll(true);
		setBusyItems((current) => ({ ...current, ...nextBusy }));
		let succeeded = 0;
		let failed = 0;
		for (const item of rescrapableItems) {
			try {
				await postPlaylistLyricsRoute("/api/playlist-lyrics/rescrape-song", {
					itemId: item._id,
				});
				succeeded++;
			} catch {
				failed++;
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
			toast.error(`Rescraped ${succeeded}; ${failed} failed`);
			return;
		}
		toast.success(`Rescraped ${succeeded} songs`);
	}

	async function handleApplyCreditDefaults(): Promise<void> {
		if (!data) return;
		setIsApplyingCreditDefaults(true);
		try {
			const result = await applyCreditDefaultsToPlaylist({
				playlistId: data.playlist._id,
			});
			toast.success(
				`Applied credit defaults to ${result.updatedCount} of ${result.itemCount} tracks`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to apply credit defaults",
			);
		} finally {
			setIsApplyingCreditDefaults(false);
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
		try {
			await updateItem({
				itemId: item._id,
				hiddenCreditLabels: Array.from(hiddenLabels),
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save credits",
			);
		}
	}

	if (data === undefined) {
		return <PlaylistLyricsEditorSkeleton />;
	}

	if (data === null) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<p className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
					Playlist not found
				</p>
				<p className="mt-2 text-muted-foreground text-sm">
					The playlist you&apos;re looking for does not exist or was deleted.
				</p>
				<Button asChild className="mt-6">
					<Link href="/lyrics/playlists">Back to playlist lyrics</Link>
				</Button>
			</main>
		);
	}

	const { playlist, songs } = data;
	const isPublic = playlist.status === "ready";
	const rescrapableSongCount = songs.filter(hasRescrapeSource).length;

	const stickyTrack = songs.find((song) => song._id === visibleTrackId);
	const stickyTrackIndex = songs.findIndex(
		(song) => song._id === visibleTrackId,
	);
	const stickyTrackLabel = stickyTrack
		? `${String(getPlaylistDisplayTrackNumber(stickyTrackIndex)).padStart(2, "0")}  ${getDisplayTitle(stickyTrack)}${
				getDisplayDuration(stickyTrack)
					? ` · ${getDisplayDuration(stickyTrack)}`
					: ""
			}`
		: undefined;

	const navItems: ZineEditorNavItem[] = [
		{ id: "cover", label: "Cover" },
		{
			id: "tracks",
			label: "Tracks",
			children: songs.map((song, index) => ({
				id: `track-${song._id}`,
				label: `${String(getPlaylistDisplayTrackNumber(index)).padStart(2, "0")} ${getDisplayTitle(song)}`,
			})),
		},
		{ id: "inside-back", label: "Inside back" },
		{ id: "back-cover", label: "Back cover" },
	];

	return (
		<>
			<ZineEditorShell
				eyebrow="Playlist lyrics"
				title={playlistPersist.value.title || playlist.title}
				persistStatus={overallStatus}
				persistError={persistError ?? undefined}
				zineHref={`/playlist-lyrics/${playlist.slug}/zine`}
				backHref="/lyrics/playlists"
				backLabel="Back"
				navItems={navItems}
				stickyTrackLabel={stickyTrackLabel}
				showStickyTrack={Boolean(stickyTrackLabel)}
				headerActions={
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								void handleTogglePublicStatus();
							}}
							disabled={isUpdatingStatus}
						>
							{isUpdatingStatus
								? "Saving…"
								: isPublic
									? "Make draft"
									: "Make public"}
						</Button>
						{isPublic ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleCopyPublicZineLink}
							>
								<LinkIcon className="mr-1.5 h-3.5 w-3.5" />
								Copy zine link
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleCopyPublicLink}
						>
							Copy reader link
						</Button>
					</>
				}
			>
				<ZineEditorChapter
					id="cover"
					title="Cover"
					description="What appears on the front of the booklet."
				>
					<ZineField
						label="Title"
						htmlFor="playlist-title"
						placement="Front cover."
					>
						<Input
							id="playlist-title"
							value={playlistPersist.value.title}
							onChange={(event) =>
								playlistPersist.setValue((current) => ({
									...current,
									title: event.currentTarget.value,
								}))
							}
						/>
					</ZineField>

					<div className="border-border/40 border-t pt-4">
						<button
							type="button"
							className="font-medium text-sm text-teal-800 underline-offset-4 hover:underline"
							onClick={() => setEditorNotesOpen((open) => !open)}
						>
							{editorNotesOpen ? "Hide editor notes" : "Editor notes"}
						</button>
						<p className="mt-1 text-muted-foreground text-xs">
							Not in the booklet — theme, description, and private notes.
						</p>
						{editorNotesOpen ? (
							<div className="mt-4 space-y-4">
								<ZineField
									label="Theme"
									htmlFor="playlist-theme"
									placement="Not in the booklet."
								>
									<Input
										id="playlist-theme"
										value={playlistPersist.value.theme}
										placeholder="Optional theme or occasion"
										onChange={(event) =>
											playlistPersist.setValue((current) => ({
												...current,
												theme: event.currentTarget.value,
											}))
										}
									/>
								</ZineField>
								<ZineField
									label="Description"
									htmlFor="playlist-description"
									placement="Not in the booklet."
								>
									<Textarea
										id="playlist-description"
										value={playlistPersist.value.description}
										placeholder="Short intro for the playlist"
										onChange={(event) =>
											playlistPersist.setValue((current) => ({
												...current,
												description: event.currentTarget.value,
											}))
										}
									/>
								</ZineField>
								<ZineField
									label="Notes"
									htmlFor="playlist-notes"
									placement="Not in the booklet. Private editing notes."
								>
									<Textarea
										id="playlist-notes"
										value={playlistPersist.value.notes}
										placeholder="Private editing notes"
										onChange={(event) =>
											playlistPersist.setValue((current) => ({
												...current,
												notes: event.currentTarget.value,
											}))
										}
									/>
								</ZineField>
							</div>
						) : null}
					</div>
				</ZineEditorChapter>

				<ZineEditorChapter
					id="tracks"
					title="Tracks"
					description={`${songs.length} ${songs.length === 1 ? "song" : "songs"} in this playlist.`}
				>
					<div className="space-y-6">
						<form
							onSubmit={handleAddSong}
							className="flex flex-col gap-3 sm:flex-row sm:items-end"
						>
							<ZineField
								label="Genius URL"
								htmlFor="genius-song-url"
								className="flex-1"
							>
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
							</ZineField>
							<Button type="submit" disabled={isAddingSong}>
								{isAddingSong ? "Adding…" : "Add song"}
							</Button>
						</form>

						<details className="group border-border/40 border-t pt-4">
							<summary className="cursor-pointer font-medium text-sm text-teal-800">
								Add instrumental track
							</summary>
							<form
								onSubmit={handleAddManualSong}
								className="mt-4 grid gap-3 sm:grid-cols-2"
							>
								<ZineField
									label="Track title"
									htmlFor="manual-song-title"
									className="sm:col-span-2"
								>
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
								</ZineField>
								<ZineField label="Artist" htmlFor="manual-artist-name">
									<Input
										id="manual-artist-name"
										value={manualArtistName}
										onChange={(event) =>
											setManualArtistName(event.currentTarget.value)
										}
										placeholder="Optional"
										disabled={isAddingManualSong}
									/>
								</ZineField>
								<ZineField label="Album" htmlFor="manual-album-title">
									<Input
										id="manual-album-title"
										value={manualAlbumTitle}
										onChange={(event) =>
											setManualAlbumTitle(event.currentTarget.value)
										}
										placeholder="Optional"
										disabled={isAddingManualSong}
									/>
								</ZineField>
								<div className="sm:col-span-2">
									<IntroContentEditor
										id="manual-intro-content"
										value={manualIntroContent}
										disabled={isAddingManualSong}
										label="Intro"
										placeholder="Optional intro text"
										helperText="INTRO block on this song’s page."
										onChange={setManualIntroContent}
									/>
								</div>
								<div className="sm:col-span-2">
									<Button type="submit" disabled={isAddingManualSong}>
										{isAddingManualSong ? "Adding…" : "Add instrumental"}
									</Button>
								</div>
							</form>
						</details>

						{songs.length > 0 ? (
							<div className="flex flex-wrap items-center justify-between gap-2">
								{playlist.spotifyPlaylistId ? (
									<p className="text-muted-foreground text-xs">
										Linked Spotify playlist: {playlist.spotifyPlaylistId}
									</p>
								) : (
									<span />
								)}
								<div className="flex flex-wrap justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setSpotifySyncOpen(true)}
									>
										Sync Spotify playlist
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isApplyingCreditDefaults}
										onClick={() => {
											void handleApplyCreditDefaults();
										}}
									>
										{isApplyingCreditDefaults
											? "Applying credit defaults…"
											: "Apply credit defaults"}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isRescrapingAll || rescrapableSongCount === 0}
										onClick={() => {
											void handleRescrapeAll();
										}}
									>
										{isRescrapingAll
											? "Rescraping all…"
											: `Rescrape all (${rescrapableSongCount})`}
									</Button>
								</div>
							</div>
						) : null}

						{songs.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No songs yet. Add a Genius URL or an instrumental track above.
							</p>
						) : (
							<div className="divide-y-0 border-border/40 border-t">
								{songs.map((item, index) => (
									<PlaylistTrackEditor
										key={item._id}
										item={item}
										trackNumber={getPlaylistDisplayTrackNumber(index)}
										expanded={expandedTrackId === item._id}
										onToggle={() =>
											setExpandedTrackId((current) =>
												current === item._id ? null : item._id,
											)
										}
										onVisible={(visible) => {
											if (visible) {
												setVisibleTrackId(item._id);
											} else if (visibleTrackId === item._id) {
												setVisibleTrackId(null);
											}
										}}
										busyAction={busyItems[item._id]}
										onStatusChange={handleTrackStatus}
										onCreditVisibilityChange={handleCreditVisibilityChange}
										onDelete={() => {
											void handleDeleteItem(item._id);
										}}
										onRescrape={() => {
											void handleRescrapeItem(item._id);
										}}
										updateItem={updateItem}
										recommendationsUserId={userId ?? undefined}
									/>
								))}
							</div>
						)}
					</div>
				</ZineEditorChapter>

				<ZineEditorChapter
					id="inside-back"
					title="Inside back"
					description="Optional discography and recommendations on the page before the back cover."
				>
					<ZineInsideBackSectionsEditor
						sections={insideBackPersist.value}
						onChange={insideBackPersist.setValue}
						userId={userId ?? undefined}
					/>
				</ZineEditorChapter>

				<ZineEditorChapter
					id="back-cover"
					title="Back cover"
					description="Bottom-left of the back cover, only when uploaded and shown."
				>
					<div className="grid gap-8 sm:grid-cols-2">
						<PlaylistQrSlotEditor
							playlistId={playlist._id}
							service="spotify"
							label="Spotify"
							initialImageUrl={playlist.zineSpotifyQrImageUrl}
							initialShow={playlist.zineShowSpotifyQr === true}
							onStatusChange={handleTrackStatus}
						/>
						<PlaylistQrSlotEditor
							playlistId={playlist._id}
							service="appleMusic"
							label="Apple Music"
							initialImageUrl={playlist.zineAppleMusicQrImageUrl}
							initialShow={playlist.zineShowAppleMusicQr === true}
							onStatusChange={handleTrackStatus}
						/>
					</div>
				</ZineEditorChapter>
			</ZineEditorShell>

			<SyncSpotifyPlaylistDialog
				open={spotifySyncOpen}
				onOpenChange={setSpotifySyncOpen}
				playlistId={playlist._id}
				initialSpotifyPlaylistId={playlist.spotifyPlaylistId}
				items={songs.map((song) => ({
					itemId: song._id,
					title: getDisplayTitle(song),
				}))}
			/>
		</>
	);
}

function PlaylistTrackEditor({
	item,
	trackNumber,
	expanded,
	onToggle,
	onVisible,
	busyAction,
	onStatusChange,
	onCreditVisibilityChange,
	onDelete,
	onRescrape,
	updateItem,
	recommendationsUserId,
}: {
	item: PlaylistLyricsItem;
	trackNumber: number;
	expanded: boolean;
	onToggle: () => void;
	onVisible: (visible: boolean) => void;
	busyAction?: TrackActionBusy;
	onStatusChange: (trackId: string, status: ZineEditorPersistStatus) => void;
	onCreditVisibilityChange: (
		item: PlaylistLyricsItem,
		label: string,
		visible: boolean,
	) => Promise<void>;
	onDelete: () => void;
	onRescrape: () => void;
	updateItem: ReturnType<
		typeof useMutation<typeof api.playlistLyrics.updateItem>
	>;
	recommendationsUserId?: string;
}): ReactNode {
	const serverFields = useMemo((): ZineTrackRowFields => {
		return {
			title: item.songTitleOverride ?? "",
			artist: item.artistNameOverride ?? "",
			album: item.albumTitleOverride ?? "",
			durationInput: formatTrackDurationInput(item.durationSecondsOverride),
			albumArtUrl: item.albumArtUrlOverride ?? "",
			intro: item.introContent ?? "",
			note: item.userNote ?? "",
		};
	}, [item]);

	const persist = useZineEditorPersist(serverFields, async (fields) => {
		let durationSecondsOverride: number | null | undefined;
		const trimmedDuration = fields.durationInput.trim();
		if (!trimmedDuration) {
			durationSecondsOverride =
				item.durationSecondsOverride === undefined ? undefined : null;
		} else {
			try {
				durationSecondsOverride = parseTrackDurationInput(trimmedDuration);
			} catch {
				// Skip duration in this save; other fields still persist.
				durationSecondsOverride = undefined;
			}
		}

		const patch: {
			itemId: Id<"playlistLyricsItems">;
			songTitleOverride: string;
			artistNameOverride: string;
			albumTitleOverride: string;
			albumArtUrlOverride: string;
			introContent: string;
			userNote: string;
			durationSecondsOverride?: number | null;
		} = {
			itemId: item._id,
			songTitleOverride: fields.title,
			artistNameOverride: fields.artist,
			albumTitleOverride: fields.album,
			albumArtUrlOverride: fields.albumArtUrl,
			introContent: fields.intro,
			userNote: fields.note,
		};

		if (durationSecondsOverride !== undefined) {
			patch.durationSecondsOverride = durationSecondsOverride;
		}

		await updateItem(patch);
	});

	const recsServer = useMemo(
		() => coerceZinePageRecommendations(item.zinePageRecommendations),
		[item.zinePageRecommendations],
	);
	const recsPersist = useZineEditorPersist(
		recsServer,
		async (recommendations) => {
			await updateItem({
				itemId: item._id,
				zinePageRecommendations: recommendations,
			});
		},
	);

	useEffect(() => {
		onStatusChange(
			item._id,
			mergePersistStatuses([persist.status, recsPersist.status]),
		);
	}, [item._id, onStatusChange, persist.status, recsPersist.status]);

	const displayTitle =
		persist.value.title.trim() || item.scrape?.songTitle || "Untitled song";
	const displayArtist =
		persist.value.artist.trim() || item.scrape?.artistName || "Unknown artist";
	const displayDuration =
		persist.value.durationInput.trim() ||
		(item.durationSecondsOverride !== undefined
			? formatTrackDuration(item.durationSecondsOverride)
			: "");

	const status: ZineTrackRowStatus =
		item.scrapeState === "manual"
			? "manual"
			: item.scrapeState === "failed"
				? "failed"
				: item.scrapeState === "scraping"
					? "scraping"
					: item.scrapeState === "reused"
						? "reused"
						: item.scrapeState === "ready"
							? "ready"
							: "none";

	const scrapeDetails = buildScrapeDetails(item);

	return (
		<ZineTrackRow
			id={`track-${item._id}`}
			trackNumber={trackNumber}
			displayTitle={displayTitle}
			displayArtist={displayArtist}
			displayDuration={displayDuration}
			status={status}
			expanded={expanded}
			onToggle={onToggle}
			onVisible={onVisible}
			fields={persist.value}
			onFieldChange={(field, value) =>
				persist.setValue((current) => ({ ...current, [field]: value }))
			}
			placeholders={{
				title: item.scrape?.songTitle,
				artist: item.scrape?.artistName,
				album: getScrapedAlbumTitle(item),
				albumArtUrl: item.scrape?.albumArtUrl,
			}}
			showArtistAlbumArt
			showNote
			credits={item.scrape?.credits ?? []}
			hiddenCreditLabels={item.hiddenCreditLabels ?? []}
			onCreditVisibilityChange={(label, visible) => {
				void onCreditVisibilityChange(item, label, visible);
			}}
			scrapeDetails={scrapeDetails}
			scrapeEmptyMessage={
				item.scrapeState === "manual"
					? "Manual instrumental track — no Genius scrape or lyrics."
					: undefined
			}
			canRescrape={hasRescrapeSource(item)}
			onRescrape={onRescrape}
			rescraping={busyAction === "rescrape"}
			onDelete={onDelete}
			deleting={busyAction === "delete"}
			recommendations={recsPersist.value}
			onRecommendationsChange={recsPersist.setValue}
			recommendationsUserId={recommendationsUserId}
		/>
	);
}

function PlaylistQrSlotEditor({
	playlistId,
	service,
	label,
	initialImageUrl,
	initialShow,
	onStatusChange,
}: {
	playlistId: Id<"playlistLyrics">;
	service: "spotify" | "appleMusic";
	label: string;
	initialImageUrl?: string;
	initialShow: boolean;
	onStatusChange: (id: string, status: ZineEditorPersistStatus) => void;
}): ReactNode {
	const updateSpotifyQr = useMutation(api.playlistLyrics.updateZineSpotifyQr);
	const updateAppleMusicQr = useMutation(
		api.playlistLyrics.updateZineAppleMusicQr,
	);
	const updateQrToggles = useMutation(api.playlistLyrics.updateZineQrToggles);
	const generateUploadUrl = useMutation(
		api.playlistLyrics.generateZineCoverUploadUrl,
	);

	const statusKey = `qr-${service}`;
	const [showOnBackCover, setShowOnBackCover] = useState(initialShow);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const urlPersist = useZineEditorPersist(
		initialImageUrl ?? "",
		async (nextUrl) => {
			const updateQr =
				service === "spotify" ? updateSpotifyQr : updateAppleMusicQr;
			await updateQr({
				playlistId,
				qrImageUrl: nextUrl.trim().length > 0 ? nextUrl.trim() : "",
			});
		},
	);

	useEffect(() => {
		setShowOnBackCover(initialShow);
	}, [initialShow]);

	useEffect(() => {
		onStatusChange(statusKey, urlPersist.status);
	}, [onStatusChange, statusKey, urlPersist.status]);

	const resolvedImageUrl = urlPersist.value.trim() || undefined;
	const inputIdPrefix = `playlist-qr-${service}`;

	async function handleFileUpload(file: File | undefined): Promise<void> {
		if (!file) return;
		const maxBytes = 15 * 1024 * 1024;
		if (file.size > maxBytes) {
			toast.error("Image must be 15 MB or smaller");
			return;
		}
		setIsUploading(true);
		onStatusChange(statusKey, "saving");
		try {
			const uploadUrl = await generateUploadUrl({});
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			if (!response.ok) throw new Error("Upload failed");
			const { storageId } = (await response.json()) as { storageId: string };
			const updateQr =
				service === "spotify" ? updateSpotifyQr : updateAppleMusicQr;
			const result = await updateQr({
				playlistId,
				storageId: storageId as Id<"_storage">,
			});
			urlPersist.setValue(result.qrImageUrl ?? "");
			toast.success(`${label} QR uploaded`);
			onStatusChange(statusKey, "saved");
		} catch {
			toast.error(`Failed to upload ${label} QR`);
			onStatusChange(statusKey, "error");
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
		} catch {
			setShowOnBackCover(!checked);
			toast.error(`Failed to update ${label} visibility`);
		}
	}

	return (
		<div className="space-y-3">
			<p className="font-medium text-sm">{label}</p>
			{resolvedImageUrl ? (
				<img
					alt={`${label} QR preview`}
					className="h-24 w-24 rounded-sm bg-white object-contain"
					src={resolvedImageUrl}
				/>
			) : null}
			<ZineField
				label="Image URL"
				htmlFor={`${inputIdPrefix}-url`}
				placement="Back cover, bottom-left."
			>
				<Input
					id={`${inputIdPrefix}-url`}
					type="url"
					value={urlPersist.value}
					placeholder="https://…"
					onChange={(event) => urlPersist.setValue(event.currentTarget.value)}
				/>
			</ZineField>
			<p className="text-center text-muted-foreground text-xs">or</p>
			<div className="space-y-2">
				<input
					ref={fileInputRef}
					accept="image/jpeg,image/png,image/webp,image/gif"
					className="sr-only"
					id={`${inputIdPrefix}-file`}
					type="file"
					onChange={(event) => {
						void handleFileUpload(event.target.files?.[0]);
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isUploading}
					onClick={() => fileInputRef.current?.click()}
				>
					{isUploading ? "Uploading…" : "Choose file"}
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id={`${inputIdPrefix}-show`}
					checked={showOnBackCover}
					disabled={!resolvedImageUrl || isUploading}
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

function PlaylistLyricsEditorSkeleton(): ReactElement {
	return (
		<main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
			<div className="space-y-2">
				<Skeleton className="h-3 w-28" />
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-4 w-64" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		</main>
	);
}

async function postPlaylistLyricsRoute(
	path: string,
	body: Record<string, string>,
): Promise<void> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
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

function getDisplayTitle(item: PlaylistLyricsItem): string {
	return item.songTitleOverride ?? item.scrape?.songTitle ?? "Untitled song";
}

function getDisplayDuration(item: PlaylistLyricsItem): string {
	if (item.durationSecondsOverride === undefined) return "";
	return formatTrackDuration(item.durationSecondsOverride);
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

function buildScrapeDetails(item: PlaylistLyricsItem) {
	if (item.scrapeState === "manual") {
		return [];
	}
	const sourceUrl = item.scrape?.canonicalUrl ?? item.pendingUrl;
	const details = [
		{ label: "State", value: item.scrapeState },
		{
			label: "Last scraped",
			value: item.scrape
				? formatDate(item.scrape.lastScrapedAt)
				: "Not scraped",
		},
		{ label: "Title", value: item.scrape?.songTitle ?? "Unavailable" },
		{ label: "Artist", value: item.scrape?.artistName ?? "Unavailable" },
		{
			label: "Album",
			value: getScrapedAlbumTitle(item) ?? "Unavailable",
		},
		{
			label: "Year",
			value: getScrapedAlbumYear(item) ?? "Unavailable",
		},
		{
			label: "Album art",
			value: item.scrape?.albumArtUrl ?? "Unavailable",
		},
		{ label: "Pending URL", value: item.pendingUrl ?? "None" },
	];
	if (sourceUrl) {
		details.push({
			label: "Source",
			value: sourceUrl,
			href: sourceUrl,
		} as { label: string; value: string; href?: string });
	}
	return details;
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
	return { title: title || undefined, year };
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

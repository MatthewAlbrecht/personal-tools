"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Clock3, Link2, RefreshCw, Unlink } from "lucide-react";
import Link from "next/link";
import {
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
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
} from "~/components/zine/editor/zine-track-row";
import { IntroContentEditor } from "~/components/zine/intro-content-editor";
import { ZineInsideBackSectionsEditor } from "~/components/zine/zine-inside-back-sections-editor";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { mapDiscographyReleasesToAlbumUpserts } from "~/lib/zine/spotify-discography-import";
import type { ZineInsideBackSection } from "~/lib/zine/zine-inside-back-sections";
import { coerceZineInsideBackSections } from "~/lib/zine/zine-inside-back-sections";
import { resolveAlbumIntroContent } from "~/lib/zine/zine-intro-content";
import { coerceZinePageRecommendations } from "~/lib/zine/zine-page-recommendations";
import {
	formatTrackDuration,
	formatTrackDurationInput,
	parseTrackDurationInput,
} from "~/lib/zine/zine-song-header-content";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SpotifyAlbumMapDrawer } from "./spotify-album-map-drawer";

type AlbumLyricsData = NonNullable<
	FunctionReturnType<typeof api.geniusAlbums.getAlbumBySlug>
>;
type Album = AlbumLyricsData["album"];
type Song = AlbumLyricsData["songs"][number];

type CoverFields = {
	albumTitleOverride: string;
	artistNameOverride: string;
};

type IntroFields = {
	introPageContent: string;
};

type EditorNotesFields = {
	frontPageImageUrlOverride: string;
};

type MatchedSongDuration = {
	songId: Id<"geniusSongs">;
	durationSeconds: number;
};

export function AlbumLyricsEditor({ slug }: { slug: string }): ReactElement {
	const { userId } = useAuthToken();
	const { getValidAccessToken } = useSpotifyAuth();
	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });
	const updateAlbumOverrides = useMutation(
		api.geniusAlbums.updateAlbumOverrides,
	);
	const updateSongOverrides = useMutation(api.geniusAlbums.updateSongOverrides);
	const applyCreditDefaultsToAlbum = useMutation(
		api.geniusAlbums.applyCreditDefaultsToAlbum,
	);
	const autoMatchSpotifyAlbum = useMutation(
		api.geniusAlbums.autoMatchSpotifyAlbum,
	);
	const setSpotifyAlbumMapping = useMutation(
		api.geniusAlbums.setSpotifyAlbumMapping,
	);
	const clearSpotifyAlbumMapping = useMutation(
		api.geniusAlbums.clearSpotifyAlbumMapping,
	);
	const syncTrackDurationsFromSpotify = useMutation(
		api.geniusAlbums.syncTrackDurationsFromSpotify,
	);
	const ingestSpotifyAlbumTracksForLyrics = useMutation(
		api.spotify.ingestSpotifyAlbumTracksForLyrics,
	);
	const bulkUpsertDiscographyAlbums = useMutation(
		api.spotify.bulkUpsertDiscographyAlbums,
	);

	const [isAutoMatching, setIsAutoMatching] = useState(false);
	const [isMappingSpotifyAlbum, setIsMappingSpotifyAlbum] = useState(false);
	const [isClearingMapping, setIsClearingMapping] = useState(false);
	const [isSyncingTrackDurations, setIsSyncingTrackDurations] = useState(false);
	const [isApplyingCreditDefaults, setIsApplyingCreditDefaults] =
		useState(false);
	const [spotifyMapDrawerOpen, setSpotifyMapDrawerOpen] = useState(false);
	const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
	const [visibleTrackId, setVisibleTrackId] = useState<string | null>(null);
	const [editorNotesOpen, setEditorNotesOpen] = useState(false);
	const [trackStatuses, setTrackStatuses] = useState<
		Record<string, ZineEditorPersistStatus>
	>({});
	const [durationBoosts, setDurationBoosts] = useState<Record<string, number>>(
		{},
	);

	const coverServer = useMemo((): CoverFields => {
		if (!albumData) return { albumTitleOverride: "", artistNameOverride: "" };
		return {
			albumTitleOverride: albumData.album.albumTitleOverride ?? "",
			artistNameOverride: albumData.album.artistNameOverride ?? "",
		};
	}, [albumData]);

	const coverPersist = useZineEditorPersist(
		coverServer,
		async (fields) => {
			if (!albumData) return;
			await updateAlbumOverrides({
				albumId: albumData.album._id,
				albumTitleOverride: fields.albumTitleOverride,
				artistNameOverride: fields.artistNameOverride,
			});
		},
		{ enabled: Boolean(albumData) },
	);

	const introServer = useMemo((): IntroFields => {
		if (!albumData) return { introPageContent: "" };
		return {
			introPageContent: resolveAlbumIntroContent(
				albumData.album.introPageContent,
				albumData.album.summaryOverride,
			),
		};
	}, [albumData]);

	const introPersist = useZineEditorPersist(
		introServer,
		async (fields) => {
			if (!albumData) return;
			await updateAlbumOverrides({
				albumId: albumData.album._id,
				introPageContent: fields.introPageContent,
				summaryOverride: fields.introPageContent,
			});
		},
		{ enabled: Boolean(albumData) },
	);

	const notesServer = useMemo((): EditorNotesFields => {
		if (!albumData) return { frontPageImageUrlOverride: "" };
		return {
			frontPageImageUrlOverride:
				albumData.album.frontPageImageUrlOverride ?? "",
		};
	}, [albumData]);

	const notesPersist = useZineEditorPersist(
		notesServer,
		async (fields) => {
			if (!albumData) return;
			await updateAlbumOverrides({
				albumId: albumData.album._id,
				frontPageImageUrlOverride: fields.frontPageImageUrlOverride,
			});
		},
		{ enabled: Boolean(albumData) },
	);

	const insideBackServer = useMemo(
		() => coerceZineInsideBackSections(albumData?.album.zineInsideBackSections),
		[albumData?.album.zineInsideBackSections],
	);
	const insideBackPersist = useZineEditorPersist(
		insideBackServer,
		async (sections: ZineInsideBackSection[]) => {
			if (!albumData) return;
			await updateAlbumOverrides({
				albumId: albumData.album._id,
				zineInsideBackSections: sections,
			});
		},
		{ enabled: Boolean(albumData) },
	);

	const overallStatus = mergePersistStatuses([
		coverPersist.status,
		introPersist.status,
		notesPersist.status,
		insideBackPersist.status,
		...Object.values(trackStatuses),
	]);
	const persistError =
		coverPersist.errorMessage ??
		introPersist.errorMessage ??
		notesPersist.errorMessage ??
		insideBackPersist.errorMessage ??
		null;

	const handleTrackStatus = useCallback(
		(trackId: string, status: ZineEditorPersistStatus) => {
			setTrackStatuses((current) => {
				if (current[trackId] === status) return current;
				return { ...current, [trackId]: status };
			});
		},
		[],
	);

	function applyMatchedDurations(matchedSongs: MatchedSongDuration[]): void {
		if (matchedSongs.length === 0) return;
		setDurationBoosts((current) => {
			const next = { ...current };
			for (const matched of matchedSongs) {
				next[matched.songId] = matched.durationSeconds;
			}
			return next;
		});
	}

	async function ensureSpotifyTrackData(spotifyAlbumId: string): Promise<void> {
		const accessToken = await getValidAccessToken();
		if (!accessToken) {
			throw new Error("Connect Spotify to fetch track times");
		}
		const response = await fetch(
			`/api/spotify/album/${spotifyAlbumId}/tracks`,
			{
				method: "POST",
				headers: { "X-Access-Token": accessToken },
			},
		);
		if (!response.ok) {
			throw new Error("Failed to fetch track details from Spotify");
		}
		const payload = (await response.json()) as {
			spotifyAlbumId: string;
			albumName: string;
			albumImageUrl?: string;
			rawData?: string;
			tracks: Array<{
				spotifyTrackId: string;
				trackName: string;
				artistName: string;
				artistIds: string[];
				trackNumber: number;
				durationMs: number;
			}>;
		};
		await ingestSpotifyAlbumTracksForLyrics({
			spotifyAlbumId: payload.spotifyAlbumId,
			albumName: payload.albumName,
			albumImageUrl: payload.albumImageUrl,
			rawData: payload.rawData,
			tracks: payload.tracks,
		});
	}

	async function handleAutoMatchSpotifyAlbum(): Promise<void> {
		if (!albumData) return;
		setIsAutoMatching(true);
		try {
			const result = await autoMatchSpotifyAlbum({
				albumId: albumData.album._id,
			});
			if (result.matched) {
				if (result.spotifyAlbumId) {
					await ensureSpotifyTrackData(result.spotifyAlbumId);
					const syncResult = await syncTrackDurationsFromSpotify({
						albumId: albumData.album._id,
					});
					applyMatchedDurations(syncResult.matchedSongs);
					toast.success(syncResult.reason);
				} else {
					toast.success(result.reason);
				}
			} else {
				toast.error(result.reason);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to auto-match Spotify album"));
		} finally {
			setIsAutoMatching(false);
		}
	}

	async function handleMapSpotifyAlbum(spotifyAlbumId: string): Promise<void> {
		if (!albumData) return;
		setIsMappingSpotifyAlbum(true);
		try {
			const result = await setSpotifyAlbumMapping({
				albumId: albumData.album._id,
				spotifyAlbumId,
			});
			if (result.matched) {
				await ensureSpotifyTrackData(spotifyAlbumId);
				const syncResult = await syncTrackDurationsFromSpotify({
					albumId: albumData.album._id,
				});
				applyMatchedDurations(syncResult.matchedSongs);
				toast.success(syncResult.reason || result.reason);
				setSpotifyMapDrawerOpen(false);
			} else {
				toast.error(result.reason);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to map Spotify album"));
		} finally {
			setIsMappingSpotifyAlbum(false);
		}
	}

	async function handleClearSpotifyMapping(): Promise<void> {
		if (!albumData) return;
		setIsClearingMapping(true);
		try {
			await clearSpotifyAlbumMapping({ albumId: albumData.album._id });
			toast.success("Spotify mapping cleared");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to clear Spotify mapping"));
		} finally {
			setIsClearingMapping(false);
		}
	}

	async function handleSyncTrackDurationsFromSpotify(): Promise<void> {
		if (!albumData?.album.spotifyAlbumId) return;
		setIsSyncingTrackDurations(true);
		try {
			await ensureSpotifyTrackData(albumData.album.spotifyAlbumId);
			const result = await syncTrackDurationsFromSpotify({
				albumId: albumData.album._id,
			});
			applyMatchedDurations(result.matchedSongs);
			if (result.updatedCount > 0) {
				toast.success(result.reason);
			} else if (result.matchedSongs.length > 0) {
				toast.success(
					result.reason === "Track times are already up to date."
						? "Track times loaded from Spotify."
						: result.reason,
				);
			} else {
				toast.error(result.reason);
			}
		} catch (error) {
			toast.error(
				getErrorMessage(error, "Failed to sync track times from Spotify"),
			);
		} finally {
			setIsSyncingTrackDurations(false);
		}
	}

	async function handleApplyCreditDefaults(): Promise<void> {
		if (!albumData) return;
		setIsApplyingCreditDefaults(true);
		try {
			const result = await applyCreditDefaultsToAlbum({
				albumId: albumData.album._id,
			});
			toast.success(
				`Applied credit defaults to ${result.updatedCount} of ${result.songCount} tracks`,
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

	if (albumData === undefined) {
		return <AlbumLyricsEditorSkeleton />;
	}

	if (!albumData) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<p className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
					Album not found
				</p>
				<p className="mt-2 text-muted-foreground text-sm">
					The album you&apos;re looking for doesn&apos;t exist or has been
					deleted.
				</p>
				<Button asChild className="mt-6">
					<Link href="/lyrics">Back to search</Link>
				</Button>
			</main>
		);
	}

	const { album, songs } = albumData;
	const displayTitle =
		coverPersist.value.albumTitleOverride.trim() || album.albumTitle;
	const displayArtist =
		coverPersist.value.artistNameOverride.trim() || album.artistName;

	const stickySong = songs.find((song) => song._id === visibleTrackId);
	const stickyDuration =
		stickySong !== undefined
			? (durationBoosts[stickySong._id] ?? stickySong.durationSecondsOverride)
			: undefined;
	const stickyTrackLabel = stickySong
		? `${String(stickySong.trackNumber).padStart(2, "0")}  ${
				stickySong.songTitleOverride?.trim() ||
				stickySong.songTitle ||
				"Untitled song"
			}${
				stickyDuration !== undefined
					? ` · ${formatTrackDuration(stickyDuration)}`
					: ""
			}`
		: undefined;

	const navItems: ZineEditorNavItem[] = [
		{ id: "cover", label: "Cover" },
		{ id: "intro", label: "Intro" },
		{
			id: "tracks",
			label: "Tracks",
			children: songs.map((song) => ({
				id: `track-${song._id}`,
				label: `${String(song.trackNumber).padStart(2, "0")} ${
					song.songTitleOverride?.trim() || song.songTitle || "Untitled"
				}`,
			})),
		},
		{ id: "inside-back", label: "Inside back" },
	];

	return (
		<ZineEditorShell
			eyebrow="Album lyrics"
			title={`${displayTitle} · ${displayArtist}`}
			persistStatus={overallStatus}
			persistError={persistError ?? undefined}
			zineHref={`/lyrics/${slug}/zine`}
			backHref={`/lyrics/${slug}`}
			backLabel="Back to album"
			navItems={navItems}
			stickyTrackLabel={stickyTrackLabel}
			showStickyTrack={Boolean(stickyTrackLabel)}
		>
			<ZineEditorChapter
				id="cover"
				title="Cover"
				description={`Scraped: ${album.albumTitle} by ${album.artistName}`}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<ZineField
						label="Album title"
						htmlFor="album-title"
						placement="Front cover."
					>
						<Input
							id="album-title"
							value={coverPersist.value.albumTitleOverride}
							placeholder={album.albumTitle}
							onChange={(event) =>
								coverPersist.setValue((current) => ({
									...current,
									albumTitleOverride: event.currentTarget.value,
								}))
							}
						/>
					</ZineField>
					<ZineField
						label="Artist"
						htmlFor="album-artist"
						placement="Front cover."
					>
						<Input
							id="album-artist"
							value={coverPersist.value.artistNameOverride}
							placeholder={album.artistName}
							onChange={(event) =>
								coverPersist.setValue((current) => ({
									...current,
									artistNameOverride: event.currentTarget.value,
								}))
							}
						/>
					</ZineField>
				</div>

				<div className="border-border/40 border-t pt-4">
					<button
						type="button"
						className="font-medium text-sm text-teal-800 underline-offset-4 hover:underline"
						onClick={() => setEditorNotesOpen((open) => !open)}
					>
						{editorNotesOpen ? "Hide editor notes" : "Editor notes"}
					</button>
					<p className="mt-1 text-muted-foreground text-xs">
						Not in the booklet — HTML reader cover image.
					</p>
					{editorNotesOpen ? (
						<div className="mt-4">
							<ZineField
								label="Reader cover image URL"
								htmlFor="front-page-image"
								placement="Not in the booklet. Used on the HTML reader, not the zine cover."
							>
								<Input
									id="front-page-image"
									value={notesPersist.value.frontPageImageUrlOverride}
									onChange={(event) =>
										notesPersist.setValue({
											frontPageImageUrlOverride: event.currentTarget.value,
										})
									}
								/>
							</ZineField>
						</div>
					) : null}
				</div>
			</ZineEditorChapter>

			<ZineEditorChapter
				id="intro"
				title="Intro"
				description="Page after the cover."
			>
				<IntroContentEditor
					id="album-intro"
					value={introPersist.value.introPageContent}
					label="Album intro"
					placeholder="Intro for the page after the cover"
					helperText="Page after the cover. Use *bold*, _italic_, and blank lines for paragraphs."
					onChange={(value) =>
						introPersist.setValue({ introPageContent: value })
					}
				/>
			</ZineEditorChapter>

			<ZineEditorChapter
				id="tracks"
				title="Tracks"
				description={`${songs.length} ${songs.length === 1 ? "track" : "tracks"}.`}
			>
				{songs.length > 0 ? (
					<div className="mb-3 flex flex-wrap justify-end gap-2">
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
					</div>
				) : null}
				{songs.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No songs found for this album.
					</p>
				) : (
					<div className="border-border/40 border-t">
						{songs.map((song) => (
							<AlbumTrackEditor
								key={song._id}
								song={song}
								boostedDuration={durationBoosts[song._id]}
								expanded={expandedTrackId === song._id}
								onToggle={() =>
									setExpandedTrackId((current) =>
										current === song._id ? null : song._id,
									)
								}
								onVisible={(visible) => {
									if (visible) {
										setVisibleTrackId(song._id);
									} else if (visibleTrackId === song._id) {
										setVisibleTrackId(null);
									}
								}}
								onStatusChange={handleTrackStatus}
								updateSongOverrides={updateSongOverrides}
								recommendationsUserId={userId ?? undefined}
							/>
						))}
					</div>
				)}

				<details className="mt-8 border-border/40 border-t pt-4">
					<summary className="cursor-pointer font-medium text-sm text-teal-800">
						Spotify mapping
					</summary>
					<p className="mt-1 text-muted-foreground text-xs">
						Used to fill track times and import discography.
					</p>
					<div className="mt-4 space-y-4">
						{album.spotifyAlbumId ? (
							<p className="text-sm">
								<span className="font-medium">Mapped:</span>{" "}
								{album.spotifyAlbumId}
								{album.spotifyAlbumMatchMethod
									? ` · ${album.spotifyAlbumMatchMethod}`
									: ""}
							</p>
						) : (
							<p className="text-muted-foreground text-sm">
								No Spotify album mapped yet.
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								size="sm"
								onClick={() => setSpotifyMapDrawerOpen(true)}
								disabled={isMappingSpotifyAlbum}
							>
								<Link2 className="mr-1.5 h-3.5 w-3.5" />
								{album.spotifyAlbumId ? "Change mapping" : "Map album"}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									void handleAutoMatchSpotifyAlbum();
								}}
								disabled={isAutoMatching}
							>
								<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
								{isAutoMatching ? "Matching…" : "Auto-match"}
							</Button>
							{album.spotifyAlbumId ? (
								<>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => {
											void handleSyncTrackDurationsFromSpotify();
										}}
										disabled={isSyncingTrackDurations}
									>
										<Clock3 className="mr-1.5 h-3.5 w-3.5" />
										{isSyncingTrackDurations ? "Syncing…" : "Sync track times"}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => {
											void handleClearSpotifyMapping();
										}}
										disabled={isClearingMapping}
									>
										<Unlink className="mr-1.5 h-3.5 w-3.5" />
										{isClearingMapping ? "Clearing…" : "Clear"}
									</Button>
								</>
							) : null}
						</div>
					</div>
				</details>
			</ZineEditorChapter>

			<SpotifyAlbumMapDrawer
				album={{
					albumTitle: displayTitle,
					artistName: displayArtist,
				}}
				open={spotifyMapDrawerOpen}
				onOpenChange={setSpotifyMapDrawerOpen}
				onSelect={handleMapSpotifyAlbum}
				isMapping={isMappingSpotifyAlbum}
			/>

			<ZineEditorChapter
				id="inside-back"
				title="Inside back"
				description="Discography and recommendations on the page before the back cover."
			>
				<ZineInsideBackSectionsEditor
					sections={insideBackPersist.value}
					onChange={insideBackPersist.setValue}
					userId={userId ?? undefined}
					spotifyDiscographySource={
						album.spotifyAlbumId && userId
							? {
									spotifyAlbumId: album.spotifyAlbumId,
									getAccessToken: getValidAccessToken,
									persistReleases: async (releases, sourceSpotifyAlbumId) => {
										return await bulkUpsertDiscographyAlbums({
											userId,
											albums: mapDiscographyReleasesToAlbumUpserts(
												releases,
												sourceSpotifyAlbumId,
											),
										});
									},
								}
							: undefined
					}
				/>
			</ZineEditorChapter>
		</ZineEditorShell>
	);
}

function AlbumTrackEditor({
	song,
	boostedDuration,
	expanded,
	onToggle,
	onVisible,
	onStatusChange,
	updateSongOverrides,
	recommendationsUserId,
}: {
	song: Song;
	boostedDuration?: number;
	expanded: boolean;
	onToggle: () => void;
	onVisible: (visible: boolean) => void;
	onStatusChange: (trackId: string, status: ZineEditorPersistStatus) => void;
	updateSongOverrides: ReturnType<
		typeof useMutation<typeof api.geniusAlbums.updateSongOverrides>
	>;
	recommendationsUserId?: string;
}): ReactNode {
	const effectiveDuration = boostedDuration ?? song.durationSecondsOverride;

	const serverFields = useMemo((): ZineTrackRowFields => {
		const titleValue = song.songTitleOverride ?? song.songTitle;
		return {
			title: titleValue,
			artist: "",
			album: "",
			durationInput: formatTrackDurationInput(effectiveDuration),
			albumArtUrl: "",
			intro: song.aboutOverride ?? "",
			note: "",
		};
	}, [song, effectiveDuration]);

	const [hiddenCreditLabels, setHiddenCreditLabels] = useState(
		song.hiddenCreditLabels ?? [],
	);

	useEffect(() => {
		setHiddenCreditLabels(song.hiddenCreditLabels ?? []);
	}, [song.hiddenCreditLabels]);

	const persist = useZineEditorPersist(serverFields, async (fields) => {
		let durationSecondsOverride: number | null | undefined;
		const trimmedDuration = fields.durationInput.trim();
		if (!trimmedDuration) {
			durationSecondsOverride =
				effectiveDuration === undefined ? undefined : null;
		} else {
			try {
				durationSecondsOverride = parseTrackDurationInput(trimmedDuration);
			} catch {
				durationSecondsOverride = undefined;
			}
		}

		const patch: {
			songId: Id<"geniusSongs">;
			songTitleOverride: string;
			aboutOverride: string;
			durationSecondsOverride?: number | null;
		} = {
			songId: song._id,
			songTitleOverride: resolveSongTitleOverride(fields.title, song.songTitle),
			aboutOverride: fields.intro,
		};

		if (durationSecondsOverride !== undefined) {
			patch.durationSecondsOverride = durationSecondsOverride;
		}

		await updateSongOverrides(patch);
	});

	const recsServer = useMemo(
		() => coerceZinePageRecommendations(song.zinePageRecommendations),
		[song.zinePageRecommendations],
	);
	const recsPersist = useZineEditorPersist(
		recsServer,
		async (recommendations) => {
			await updateSongOverrides({
				songId: song._id,
				zinePageRecommendations: recommendations,
			});
		},
	);

	useEffect(() => {
		onStatusChange(
			song._id,
			mergePersistStatuses([persist.status, recsPersist.status]),
		);
	}, [song._id, onStatusChange, persist.status, recsPersist.status]);

	const displayTitle =
		persist.value.title.trim() || song.songTitle || "Untitled song";
	const displayDuration =
		persist.value.durationInput.trim() ||
		(effectiveDuration !== undefined
			? formatTrackDuration(effectiveDuration)
			: "");

	async function handleCreditVisibilityChange(
		label: string,
		visible: boolean,
	): Promise<void> {
		const next = new Set(hiddenCreditLabels);
		if (visible) {
			next.delete(label);
		} else {
			next.add(label);
		}
		const nextList = Array.from(next);
		setHiddenCreditLabels(nextList);
		try {
			await updateSongOverrides({
				songId: song._id,
				hiddenCreditLabels: nextList,
			});
		} catch (error) {
			setHiddenCreditLabels(song.hiddenCreditLabels ?? []);
			toast.error(getErrorMessage(error, "Failed to save credits"));
		}
	}

	const scrapeDetails = [
		{ label: "Scraped title", value: song.songTitle || "Unavailable" },
		{
			label: "Genius about",
			value: song.about?.trim() || "None",
		},
		{
			label: "Duration",
			value:
				effectiveDuration !== undefined
					? formatTrackDuration(effectiveDuration)
					: "Not set",
		},
	];
	if (song.geniusSongUrl) {
		scrapeDetails.push({
			label: "Source",
			value: song.geniusSongUrl,
			href: song.geniusSongUrl,
		} as { label: string; value: string; href?: string });
	}

	return (
		<ZineTrackRow
			id={`track-${song._id}`}
			trackNumber={song.trackNumber}
			displayTitle={displayTitle}
			displayArtist=""
			displayDuration={displayDuration}
			status="none"
			expanded={expanded}
			onToggle={onToggle}
			onVisible={onVisible}
			fields={persist.value}
			onFieldChange={(field, value) =>
				persist.setValue((current) => ({ ...current, [field]: value }))
			}
			placeholders={{
				title: song.songTitle,
				intro: song.about?.trim() || undefined,
			}}
			showArtistAlbumArt={false}
			showNote={false}
			credits={song.credits ?? []}
			hiddenCreditLabels={hiddenCreditLabels}
			onCreditVisibilityChange={(label, visible) => {
				void handleCreditVisibilityChange(label, visible);
			}}
			scrapeDetails={scrapeDetails}
			recommendations={recsPersist.value}
			onRecommendationsChange={recsPersist.setValue}
			recommendationsUserId={recommendationsUserId}
		/>
	);
}

function AlbumLyricsEditorSkeleton(): ReactElement {
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
			</div>
			<div className="space-y-3">
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		</main>
	);
}

function resolveSongTitleOverride(
	formValue: string,
	scrapedTitle: string,
): string {
	const trimmed = formValue.trim();
	if (!trimmed || trimmed === scrapedTitle.trim()) {
		return "";
	}
	return trimmed;
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

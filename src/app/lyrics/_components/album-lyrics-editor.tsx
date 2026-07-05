"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	ArrowLeft,
	Clock3,
	Link2,
	RefreshCw,
	Save,
	Unlink,
} from "lucide-react";
import Link from "next/link";
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
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { IntroContentEditor } from "~/components/zine/intro-content-editor";
import { ZineInsideBackSectionsEditor } from "~/components/zine/zine-inside-back-sections-editor";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import type { ZineInsideBackSection } from "~/lib/zine/zine-inside-back-sections";
import { resolveAlbumIntroContent } from "~/lib/zine/zine-intro-content";
import { mapDiscographyReleasesToAlbumUpserts } from "~/lib/zine/spotify-discography-import";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SpotifyAlbumMapDrawer } from "./spotify-album-map-drawer";

type AlbumLyricsData = NonNullable<
	FunctionReturnType<typeof api.geniusAlbums.getAlbumBySlug>
>;

type Album = AlbumLyricsData["album"];

type AlbumFormState = {
	albumTitleOverride: string;
	artistNameOverride: string;
	frontPageImageUrlOverride: string;
	introPageContent: string;
	zineInsideBackSections: ZineInsideBackSection[];
};

type Song = AlbumLyricsData["songs"][number];

type SongFormState = {
	songTitleOverride: string;
	durationSecondsOverride: string;
	aboutOverride: string;
	hiddenCreditLabels: string[];
};

type MatchedSongDuration = {
	songId: Id<"geniusSongs">;
	durationSeconds: number;
};

const emptyAlbumForm: AlbumFormState = {
	albumTitleOverride: "",
	artistNameOverride: "",
	frontPageImageUrlOverride: "",
	introPageContent: "",
	zineInsideBackSections: [],
};

export function AlbumLyricsEditor({ slug }: { slug: string }) {
	const { userId } = useAuthToken();
	const { getValidAccessToken } = useSpotifyAuth();
	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });
	const updateAlbumOverrides = useMutation(
		api.geniusAlbums.updateAlbumOverrides,
	);
	const updateSongOverrides = useMutation(api.geniusAlbums.updateSongOverrides);
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

	const [albumForm, setAlbumForm] = useState<AlbumFormState>(emptyAlbumForm);
	const [songForms, setSongForms] = useState<Record<string, SongFormState>>({});
	const [initializedAlbumId, setInitializedAlbumId] =
		useState<Id<"geniusAlbums"> | null>(null);
	const [isSavingAlbum, setIsSavingAlbum] = useState(false);
	const [isAutoMatching, setIsAutoMatching] = useState(false);
	const [isMappingSpotifyAlbum, setIsMappingSpotifyAlbum] = useState(false);
	const [isClearingMapping, setIsClearingMapping] = useState(false);
	const [isSyncingTrackDurations, setIsSyncingTrackDurations] = useState(false);
	const [spotifyMapDrawerOpen, setSpotifyMapDrawerOpen] = useState(false);
	const [savingSongIds, setSavingSongIds] = useState<Record<string, boolean>>(
		{},
	);

	useEffect(() => {
		if (!albumData) return;
		if (initializedAlbumId === albumData.album._id) return;

		setAlbumForm(buildAlbumForm(albumData.album));
		setSongForms(buildSongForms(albumData.songs));
		setInitializedAlbumId(albumData.album._id);
	}, [albumData, initializedAlbumId]);

	useEffect(() => {
		if (!albumData) return;
		if (initializedAlbumId !== albumData.album._id) return;

		setSongForms((current) => {
			let changed = false;
			const next = { ...current };

			for (const song of albumData.songs) {
				const form = next[song._id];
				if (!form) continue;

				const serverDuration =
					song.durationSecondsOverride === undefined
						? ""
						: String(song.durationSecondsOverride);

				if (form.durationSecondsOverride !== serverDuration) {
					next[song._id] = {
						...form,
						durationSecondsOverride: serverDuration,
					};
					changed = true;
				}
			}

			return changed ? next : current;
		});
	}, [albumData, initializedAlbumId]);

	async function handleSaveAlbumOverrides() {
		if (!albumData) return;

		setIsSavingAlbum(true);
		try {
			await updateAlbumOverrides({
				albumId: albumData.album._id,
				albumTitleOverride: albumForm.albumTitleOverride,
				artistNameOverride: albumForm.artistNameOverride,
				summaryOverride: albumForm.introPageContent,
				frontPageImageUrlOverride: albumForm.frontPageImageUrlOverride,
				introPageContent: albumForm.introPageContent,
				zineInsideBackSections: albumForm.zineInsideBackSections,
			});
			toast.success("Album overrides saved");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to save album overrides"));
		} finally {
			setIsSavingAlbum(false);
		}
	}

	async function handleAutoMatchSpotifyAlbum() {
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
					applyMatchedDurationsToSongForms(syncResult.matchedSongs);
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

	async function handleMapSpotifyAlbum(spotifyAlbumId: string) {
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
				applyMatchedDurationsToSongForms(syncResult.matchedSongs);
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

	async function handleClearSpotifyMapping() {
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

	async function handleSyncTrackDurationsFromSpotify() {
		if (!albumData?.album.spotifyAlbumId) return;

		setIsSyncingTrackDurations(true);
		try {
			await ensureSpotifyTrackData(albumData.album.spotifyAlbumId);
			const result = await syncTrackDurationsFromSpotify({
				albumId: albumData.album._id,
			});
			applyMatchedDurationsToSongForms(result.matchedSongs);
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

	async function ensureSpotifyTrackData(spotifyAlbumId: string) {
		const accessToken = await getValidAccessToken();
		if (!accessToken) {
			throw new Error("Connect Spotify to fetch track times");
		}

		const response = await fetch(
			`/api/spotify/album/${spotifyAlbumId}/tracks`,
			{
				method: "POST",
				headers: {
					"X-Access-Token": accessToken,
				},
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

	function applyMatchedDurationsToSongForms(
		matchedSongs: MatchedSongDuration[],
	) {
		if (matchedSongs.length === 0) return;

		setSongForms((current) => {
			const next = { ...current };
			for (const matchedSong of matchedSongs) {
				const form = next[matchedSong.songId];
				if (!form) continue;
				next[matchedSong.songId] = {
					...form,
					durationSecondsOverride: String(matchedSong.durationSeconds),
				};
			}
			return next;
		});
	}

	async function handleSaveSong(song: Song) {
		const songForm = songForms[song._id] ?? buildSongForm(song);

		const durationSecondsOverride = parseDurationSeconds(
			songForm.durationSecondsOverride,
		);
		if (durationSecondsOverride === "invalid") {
			toast.error("Track length must be a valid number of seconds");
			return;
		}

		setSongSaving(song._id, true);
		try {
			await updateSongOverrides({
				songId: song._id,
				songTitleOverride: resolveSongTitleOverride(
					songForm.songTitleOverride,
					song.songTitle,
				),
				aboutOverride: songForm.aboutOverride,
				durationSecondsOverride,
				hiddenCreditLabels: songForm.hiddenCreditLabels,
			});
			toast.success("Track overrides saved");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to save track overrides"));
		} finally {
			setSongSaving(song._id, false);
		}
	}

	function updateAlbumFormField(field: keyof AlbumFormState, value: string) {
		setAlbumForm((current) => ({ ...current, [field]: value }));
	}

	function updateSongFormField(
		song: Song,
		field: keyof Omit<SongFormState, "hiddenCreditLabels">,
		value: string,
	) {
		setSongForms((current) => ({
			...current,
			[song._id]: {
				...getSongForm(current, song),
				[field]: value,
			},
		}));
	}

	function setCreditVisible(song: Song, label: string, isVisible: boolean) {
		setSongForms((current) => {
			const songForm = getSongForm(current, song);
			const hiddenLabels = new Set(songForm.hiddenCreditLabels);
			if (isVisible) {
				hiddenLabels.delete(label);
			} else {
				hiddenLabels.add(label);
			}

			return {
				...current,
				[song._id]: {
					...songForm,
					hiddenCreditLabels: Array.from(hiddenLabels),
				},
			};
		});
	}

	function setSongSaving(songId: Id<"geniusSongs">, isSaving: boolean) {
		setSavingSongIds((current) => ({ ...current, [songId]: isSaving }));
	}

	if (albumData === undefined) {
		return <AlbumLyricsEditorSkeleton />;
	}

	if (!albumData) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Album Not Found</h1>
				<p className="mb-6 text-muted-foreground">
					The album you're looking for doesn't exist or has been deleted.
				</p>
				<Button asChild>
					<Link href="/lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Search
					</Link>
				</Button>
			</div>
		);
	}

	const { album, songs } = albumData;

	return (
		<div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Button asChild variant="ghost">
						<Link href={`/lyrics/${slug}`}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to album
						</Link>
					</Button>
					<h1 className="mt-4 font-bold text-3xl">Edit album data</h1>
					<p className="text-muted-foreground">
						Override display data without changing scraped Genius fields.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Album overrides</CardTitle>
					<CardDescription>
						Scraped: {album.albumTitle} by {album.artistName}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="album-title-override">Album title override</Label>
							<Input
								id="album-title-override"
								value={albumForm.albumTitleOverride}
								onChange={(event) =>
									updateAlbumFormField("albumTitleOverride", event.target.value)
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="artist-name-override">
								Artist name(s) override
							</Label>
							<Input
								id="artist-name-override"
								value={albumForm.artistNameOverride}
								onChange={(event) =>
									updateAlbumFormField("artistNameOverride", event.target.value)
								}
							/>
						</div>
					</div>

					<IntroContentEditor
						id="intro-page-content"
						value={albumForm.introPageContent}
						label="Album intro"
						placeholder="Intro for the zine page after the cover"
						onChange={(value) =>
							updateAlbumFormField("introPageContent", value)
						}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Zine inside back cover</CardTitle>
					<CardDescription>
						Discography and recommendation sections on the page before the back
						cover.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<ZineInsideBackSectionsEditor
						sections={albumForm.zineInsideBackSections}
						userId={userId ?? undefined}
						onChange={(sections) =>
							setAlbumForm((current) => ({
								...current,
								zineInsideBackSections: sections,
							}))
						}
						disabled={isSavingAlbum}
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

					<div className="space-y-2">
						<Label htmlFor="front-page-image-url-override">
							Front page image URL override
						</Label>
						<Input
							id="front-page-image-url-override"
							value={albumForm.frontPageImageUrlOverride}
							onChange={(event) =>
								updateAlbumFormField(
									"frontPageImageUrlOverride",
									event.target.value,
								)
							}
						/>
					</div>

					<div className="flex justify-end">
						<Button onClick={handleSaveAlbumOverrides} disabled={isSavingAlbum}>
							<Save className="mr-2 h-4 w-4" />
							{isSavingAlbum ? "Saving..." : "Save album overrides"}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Spotify mapping</CardTitle>
					<CardDescription>
						Map this Genius album to an existing local Spotify album. Track
						times are pulled from Spotify when you map or sync.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{album.spotifyAlbumId ? (
						<div className="rounded-lg border bg-muted/30 p-4 text-sm">
							<p>
								<span className="font-medium">Current Spotify album ID:</span>{" "}
								{album.spotifyAlbumId}
							</p>
							{album.spotifyAlbumMatchMethod && (
								<p className="mt-1 text-muted-foreground">
									Match method: {album.spotifyAlbumMatchMethod}
								</p>
							)}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No Spotify album mapping is set.
						</p>
					)}

					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => setSpotifyMapDrawerOpen(true)}
							disabled={isMappingSpotifyAlbum}
						>
							<Link2 className="mr-2 h-4 w-4" />
							{album.spotifyAlbumId
								? "Change Spotify album"
								: "Map Spotify album"}
						</Button>
						<Button
							onClick={handleAutoMatchSpotifyAlbum}
							disabled={isAutoMatching}
							variant="outline"
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							{isAutoMatching ? "Matching..." : "Auto-match Spotify album"}
						</Button>
						{album.spotifyAlbumId && (
							<>
								<Button
									onClick={handleSyncTrackDurationsFromSpotify}
									disabled={isSyncingTrackDurations}
									variant="outline"
								>
									<Clock3 className="mr-2 h-4 w-4" />
									{isSyncingTrackDurations
										? "Syncing track times..."
										: "Sync track times from Spotify"}
								</Button>
								<Button
									onClick={handleClearSpotifyMapping}
									disabled={isClearingMapping}
									variant="outline"
								>
									<Unlink className="mr-2 h-4 w-4" />
									{isClearingMapping ? "Clearing..." : "Clear mapping"}
								</Button>
							</>
						)}
					</div>
				</CardContent>
			</Card>

			<SpotifyAlbumMapDrawer
				album={{
					albumTitle: albumForm.albumTitleOverride.trim() || album.albumTitle,
					artistName: albumForm.artistNameOverride.trim() || album.artistName,
				}}
				open={spotifyMapDrawerOpen}
				onOpenChange={setSpotifyMapDrawerOpen}
				onSelect={handleMapSpotifyAlbum}
				isMapping={isMappingSpotifyAlbum}
			/>

			<div className="space-y-4">
				<h2 className="font-semibold text-2xl">Track overrides</h2>
				{songs.length === 0 ? (
					<p className="text-muted-foreground">
						No songs found for this album.
					</p>
				) : (
					songs.map((song) => (
						<SongOverrideCard
							key={song._id}
							song={song}
							form={songForms[song._id] ?? buildSongForm(song)}
							isSaving={savingSongIds[song._id] === true}
							onFieldChange={updateSongFormField}
							onCreditVisibilityChange={setCreditVisible}
							onSave={handleSaveSong}
						/>
					))
				)}
			</div>
		</div>
	);
}

function SongOverrideCard({
	song,
	form,
	isSaving,
	onFieldChange,
	onCreditVisibilityChange,
	onSave,
}: {
	song: Song;
	form: SongFormState;
	isSaving: boolean;
	onFieldChange: (
		song: Song,
		field: keyof Omit<SongFormState, "hiddenCreditLabels">,
		value: string,
	) => void;
	onCreditVisibilityChange: (
		song: Song,
		label: string,
		isVisible: boolean,
	) => void;
	onSave: (song: Song) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Track {song.trackNumber}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid gap-4 md:grid-cols-[1fr_12rem]">
					<div className="space-y-2">
						<Label htmlFor={`song-${song._id}-title`}>Title</Label>
						<Input
							id={`song-${song._id}-title`}
							value={form.songTitleOverride}
							onChange={(event) =>
								onFieldChange(song, "songTitleOverride", event.target.value)
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`song-${song._id}-duration`}>
							Track length override
						</Label>
						<Input
							id={`song-${song._id}-duration`}
							inputMode="numeric"
							placeholder="Seconds"
							value={form.durationSecondsOverride}
							onChange={(event) =>
								onFieldChange(
									song,
									"durationSecondsOverride",
									event.target.value,
								)
							}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor={`song-${song._id}-about`}>Track intro</Label>
					<Textarea
						id={`song-${song._id}-about`}
						className="min-h-28"
						value={form.aboutOverride}
						onChange={(event) =>
							onFieldChange(song, "aboutOverride", event.target.value)
						}
					/>
				</div>

				<div className="space-y-3">
					<Label>Credit visibility</Label>
					{song.credits && song.credits.length > 0 ? (
						<div className="grid gap-3 md:grid-cols-2">
							{song.credits.map((credit, index) => {
								const isVisible = !form.hiddenCreditLabels.includes(
									credit.label,
								);
								const checkboxId = `song-${song._id}-credit-${index}`;

								return (
									<div
										key={credit.label}
										className="flex items-start gap-3 rounded-lg border p-3"
									>
										<Checkbox
											id={checkboxId}
											checked={isVisible}
											onCheckedChange={(checked) =>
												onCreditVisibilityChange(
													song,
													credit.label,
													checked === true,
												)
											}
										/>
										<Label
											htmlFor={checkboxId}
											className="space-y-1 text-sm leading-normal"
										>
											<span className="block font-medium">{credit.label}</span>
											<span className="block text-muted-foreground">
												{credit.contributors
													.map((contributor) => contributor.name)
													.join(", ")}
											</span>
										</Label>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No credits were scraped for this track.
						</p>
					)}
				</div>

				<div className="flex justify-end">
					<Button onClick={() => onSave(song)} disabled={isSaving}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving ? "Saving..." : "Save track"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function AlbumLyricsEditorSkeleton() {
	return (
		<div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
			<div className="space-y-3">
				<Skeleton className="h-9 w-36" />
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-5 w-96 max-w-full" />
			</div>
			<Skeleton className="h-96 w-full" />
			<Skeleton className="h-64 w-full" />
			<Skeleton className="h-96 w-full" />
		</div>
	);
}

function buildAlbumForm(album: Album): AlbumFormState {
	return {
		albumTitleOverride: album.albumTitleOverride ?? "",
		artistNameOverride: album.artistNameOverride ?? "",
		frontPageImageUrlOverride: album.frontPageImageUrlOverride ?? "",
		introPageContent: resolveAlbumIntroContent(
			album.introPageContent,
			album.summaryOverride,
		),
		zineInsideBackSections: album.zineInsideBackSections ?? [],
	};
}

function buildSongForms(songs: Song[]): Record<string, SongFormState> {
	return Object.fromEntries(
		songs.map((song) => [song._id, buildSongForm(song)]),
	);
}

function buildSongForm(song: Song): SongFormState {
	return {
		songTitleOverride: song.songTitleOverride ?? song.songTitle,
		durationSecondsOverride:
			song.durationSecondsOverride === undefined
				? ""
				: String(song.durationSecondsOverride),
		aboutOverride: song.aboutOverride ?? "",
		hiddenCreditLabels: song.hiddenCreditLabels ?? [],
	};
}

function getSongForm(
	songForms: Record<string, SongFormState>,
	song: Song,
): SongFormState {
	return songForms[song._id] ?? buildSongForm(song);
}

function parseDurationSeconds(value: string): number | null | "invalid" {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const seconds = Number(trimmed);
	if (!Number.isFinite(seconds) || seconds < 0) return "invalid";

	return seconds;
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

"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine, LyricsZineSkeleton } from "~/components/zine/lyrics-zine";
import { coverTextLayoutFromStoredFields } from "~/lib/zine/zine-cover-text-layout";
import { insideBackLayoutFromStoredFields } from "~/lib/zine/zine-inside-back-layout";
import { hasInsideBackContent } from "~/lib/zine/zine-inside-back-sections";
import type { ZineItemSettings } from "~/lib/zine/zine-types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	buildZineSongDisplayInput,
	getPlaylistDisplayTrackNumber,
} from "../_utils/song-display";

type PlaylistLyricsZineProps = {
	slug: string;
	variant: "private" | "public";
};

export function PlaylistLyricsZine({ slug, variant }: PlaylistLyricsZineProps) {
	const updateItemSettings = useMutation(
		api.playlistLyrics.updateZineItemSettings,
	);
	const hideItemCreditLabel = useMutation(
		api.playlistLyrics.hideItemCreditLabel,
	);
	const showItemCreditLabel = useMutation(
		api.playlistLyrics.showItemCreditLabel,
	);
	const updateCoverImage = useMutation(api.playlistLyrics.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(
		api.playlistLyrics.updateZineCoverGreyscale,
	);
	const updateZineDisplaySettings = useMutation(
		api.playlistLyrics.updateZineDisplaySettings,
	);
	const updateZineCoverTextLayout = useMutation(
		api.playlistLyrics.updateZineCoverTextLayout,
	);
	const updateZineCoverReleaseYear = useMutation(
		api.playlistLyrics.updateZineCoverReleaseYear,
	);
	const updateZineInsideBackLayoutSettings = useMutation(
		api.playlistLyrics.updateZineInsideBackLayoutSettings,
	);
	const updateItem = useMutation(api.playlistLyrics.updateItem);
	const generateUploadUrl = useMutation(
		api.playlistLyrics.generateZineCoverUploadUrl,
	);

	const playlistData = useQuery(
		variant === "public"
			? api.playlistLyrics.getPublicBySlug
			: api.playlistLyrics.getBySlug,
		{ slug },
	);

	if (playlistData === undefined) {
		return <LyricsZineSkeleton />;
	}

	if (playlistData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Playlist Not Found</h1>
				<Button asChild>
					<Link
						href={
							variant === "public"
								? "/public/playlist-lyrics"
								: "/lyrics/playlists"
						}
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			</div>
		);
	}

	const canEdit = variant === "private";
	const playlistId =
		"_id" in playlistData.playlist ? playlistData.playlist._id : undefined;
	const backHref =
		variant === "public"
			? `/public/playlist-lyrics/${slug}`
			: `/playlist-lyrics/${slug}`;

	const songs = playlistData.songs.map((song, index) =>
		buildZineSongDisplayInput({
			id: song._id,
			position: getPlaylistDisplayTrackNumber(index),
			songTitleOverride: song.songTitleOverride,
			artistNameOverride: song.artistNameOverride,
			albumTitleOverride: song.albumTitleOverride,
			albumArtUrlOverride: song.albumArtUrlOverride,
			userNote: song.userNote,
			introContent: song.introContent,
			durationSecondsOverride: song.durationSecondsOverride,
			hiddenCreditLabels: song.hiddenCreditLabels,
			shownCreditLabels: song.shownCreditLabels,
			scrape: song.scrape,
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of playlistData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
			showCredits: song.zineShowCredits !== false,
			collapseWithPrevious: song.zineCollapseWithPrevious === true,
		};
	}

	const playlist = playlistData.playlist;
	const insideBackSections =
		variant === "public"
			? hasInsideBackContent(playlist.zineInsideBackSections)
				? (playlist.zineInsideBackSections ?? [])
				: undefined
			: (playlist.zineInsideBackSections ?? []);

	return (
		<LyricsZine
			backHref={backHref}
			canEdit={canEdit}
			collectionTitle={playlist.title}
			insideBackSections={insideBackSections}
			insideBackLayout={insideBackLayoutFromStoredFields(playlist)}
			backCoverQrCodes={{
				spotify: {
					imageUrl: playlist.zineSpotifyQrImageUrl,
					show: playlist.zineShowSpotifyQr === true,
				},
				appleMusic: {
					imageUrl: playlist.zineAppleMusicQrImageUrl,
					show: playlist.zineShowAppleMusicQr === true,
				},
			}}
			cover={{
				imageUrl: playlist.zineCoverImageUrl,
				greyscale: playlist.zineCoverGreyscale === true,
			}}
			coverTextLayout={coverTextLayoutFromStoredFields(playlist)}
			coverReleaseYear={playlist.zineCoverReleaseYear}
			itemSettingsById={itemSettingsById}
			displaySettings={playlist.zineDisplaySettings ?? undefined}
			siteWideHiddenCreditLabelKeys={playlistData.siteWideHiddenCreditLabelKeys}
			ignoredCreditLabelKeys={playlistData.ignoredCreditLabelKeys}
			songs={songs}
			persistence={
				canEdit && playlistId !== undefined
					? {
							saveItemSettings: (songId, s) => {
								void updateItemSettings({
									itemId: songId as Id<"playlistLyricsItems">,
									zineLyricsColumnCount: s.columnCount,
									zineLyricsFontSizePt: s.fontSizePt,
									zineTitleCondenseScale: s.condenseScale,
									zineShowCredits: s.showCredits,
									zineCollapseWithPrevious: s.collapseWithPrevious,
								});
							},
							hideCreditLabel: (songId, label) => {
								void hideItemCreditLabel({
									itemId: songId as Id<"playlistLyricsItems">,
									label,
								});
							},
							showCreditLabel: (songId, label) => {
								void showItemCreditLabel({
									itemId: songId as Id<"playlistLyricsItems">,
									label,
								});
							},
							saveCover: (url, storageId) =>
								updateCoverImage({
									playlistId,
									coverImageUrl: url,
									storageId: storageId as Id<"_storage"> | undefined,
								}),
							saveGreyscale: (on) => {
								void updateCoverGreyscale({ playlistId, greyscale: on });
							},
							saveDisplaySettings: (settings) => {
								void updateZineDisplaySettings({ playlistId, settings });
							},
							saveCoverTextLayout: (layout) => {
								void updateZineCoverTextLayout({ playlistId, layout });
							},
							saveCoverReleaseYear: (releaseYear) => {
								void updateZineCoverReleaseYear({ playlistId, releaseYear });
							},
							saveInsideBackLayoutSettings: (layout) => {
								void updateZineInsideBackLayoutSettings({ playlistId, layout });
							},
							saveSongIntroContent: (songId, content) => {
								void updateItem({
									itemId: songId as Id<"playlistLyricsItems">,
									introContent: content,
								});
							},
							generateUploadUrl: () => generateUploadUrl({}),
						}
					: undefined
			}
		/>
	);
}

export function PrivatePlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="private" />;
}

export function PublicPlaylistLyricsZine({ slug }: { slug: string }) {
	return <PlaylistLyricsZine slug={slug} variant="public" />;
}

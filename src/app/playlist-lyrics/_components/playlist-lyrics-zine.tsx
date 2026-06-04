"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine, LyricsZineSkeleton } from "~/components/zine/lyrics-zine";
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
	const updateCoverImage = useMutation(api.playlistLyrics.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(
		api.playlistLyrics.updateZineCoverGreyscale,
	);
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
								: "/playlist-lyrics"
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
			scrape: song.scrape,
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of playlistData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
			showCredits: song.zineShowCredits === false ? false : true,
		};
	}

	const playlist = playlistData.playlist;

	return (
		<LyricsZine
			backHref={backHref}
			canEdit={canEdit}
			collectionTitle={playlist.title}
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
			itemSettingsById={itemSettingsById}
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

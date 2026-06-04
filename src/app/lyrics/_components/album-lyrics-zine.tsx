"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine, LyricsZineSkeleton } from "~/components/zine/lyrics-zine";
import { buildAlbumZineSongInput } from "~/lib/zine/album-song-input";
import type { ZineItemSettings } from "~/lib/zine/zine-types";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type AlbumLyricsZineProps = {
	slug: string;
	variant: "private" | "public";
};

export function AlbumLyricsZine({ slug, variant }: AlbumLyricsZineProps) {
	const updateSongSettings = useMutation(
		api.geniusAlbums.updateZineSongSettings,
	);
	const updateCoverImage = useMutation(api.geniusAlbums.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(
		api.geniusAlbums.updateZineCoverGreyscale,
	);
	const generateUploadUrl = useMutation(
		api.geniusAlbums.generateZineCoverUploadUrl,
	);

	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });

	if (albumData === undefined) {
		return <LyricsZineSkeleton />;
	}

	if (albumData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Album Not Found</h1>
				<Button asChild>
					<Link href={variant === "public" ? "/public/lyrics" : "/lyrics"}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				</Button>
			</div>
		);
	}

	const canEdit = variant === "private";
	const albumId = albumData.album._id;
	const backHref =
		variant === "public" ? `/public/lyrics/${slug}` : `/lyrics/${slug}`;

	const songs = albumData.songs.map((song) =>
		buildAlbumZineSongInput({
			album: {
				albumTitle: albumData.album.albumTitle,
				artistName: albumData.album.artistName,
			},
			song: {
				id: song._id,
				trackNumber: song.trackNumber,
				songTitle: song.songTitle,
				lyrics: song.lyrics,
				about: song.about,
			},
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of albumData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
			showCredits: song.zineShowCredits === false ? false : true,
		};
	}

	return (
		<LyricsZine
			backHref={backHref}
			canEdit={canEdit}
			collectionTitle={albumData.album.albumTitle}
			cover={{
				imageUrl: albumData.album.zineCoverImageUrl,
				greyscale: albumData.album.zineCoverGreyscale === true,
			}}
			itemSettingsById={itemSettingsById}
			songs={songs}
			persistence={
				canEdit
					? {
							saveItemSettings: (songId, s) => {
								void updateSongSettings({
									songId: songId as Id<"geniusSongs">,
									zineLyricsColumnCount: s.columnCount,
									zineLyricsFontSizePt: s.fontSizePt,
									zineTitleCondenseScale: s.condenseScale,
									zineShowCredits: s.showCredits,
								});
							},
							saveCover: (url, storageId) =>
								updateCoverImage({
									albumId,
									coverImageUrl: url,
									storageId: storageId as Id<"_storage"> | undefined,
								}),
							saveGreyscale: (on) => {
								void updateCoverGreyscale({ albumId, greyscale: on });
							},
							generateUploadUrl: () => generateUploadUrl({}),
						}
					: undefined
			}
		/>
	);
}

export function PrivateAlbumLyricsZine({ slug }: { slug: string }) {
	return <AlbumLyricsZine slug={slug} variant="private" />;
}

export function PublicAlbumLyricsZine({ slug }: { slug: string }) {
	return <AlbumLyricsZine slug={slug} variant="public" />;
}

"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { LyricsZine, LyricsZineSkeleton } from "~/components/zine/lyrics-zine";
import { buildAlbumZineSongInput } from "~/lib/zine/album-song-input";
import { coverTextLayoutFromStoredFields } from "~/lib/zine/zine-cover-text-layout";
import { insideBackLayoutFromStoredFields } from "~/lib/zine/zine-inside-back-layout";
import { hasInsideBackContent } from "~/lib/zine/zine-inside-back-sections";
import { resolveAlbumIntroContent } from "~/lib/zine/zine-intro-content";
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
	const hideSongCreditLabel = useMutation(api.geniusAlbums.hideSongCreditLabel);
	const showSongCreditLabel = useMutation(api.geniusAlbums.showSongCreditLabel);
	const updateCoverImage = useMutation(api.geniusAlbums.updateZineCoverImage);
	const updateCoverGreyscale = useMutation(
		api.geniusAlbums.updateZineCoverGreyscale,
	);
	const updateZineIntroSettings = useMutation(
		api.geniusAlbums.updateZineIntroSettings,
	);
	const updateZineInsideBackLayoutSettings = useMutation(
		api.geniusAlbums.updateZineInsideBackLayoutSettings,
	);
	const updateZineDisplaySettings = useMutation(
		api.geniusAlbums.updateZineDisplaySettings,
	);
	const updateZineCoverTextLayout = useMutation(
		api.geniusAlbums.updateZineCoverTextLayout,
	);
	const updateZineCoverReleaseYear = useMutation(
		api.geniusAlbums.updateZineCoverReleaseYear,
	);
	const updateAlbumOverrides = useMutation(
		api.geniusAlbums.updateAlbumOverrides,
	);
	const generateUploadUrl = useMutation(
		api.geniusAlbums.generateZineCoverUploadUrl,
	);

	const albumData = useQuery(
		variant === "public"
			? api.geniusAlbums.getPublicAlbumBySlug
			: api.geniusAlbums.getAlbumBySlug,
		{ slug },
	);

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
	const displayAlbumTitle =
		albumData.album.albumTitleOverride?.trim() || albumData.album.albumTitle;
	const displayArtistName =
		albumData.album.artistNameOverride?.trim() || albumData.album.artistName;

	const songs = albumData.songs.map((song) =>
		buildAlbumZineSongInput({
			album: {
				albumTitle: displayAlbumTitle,
				artistName: displayArtistName,
			},
			song: {
				id: song._id,
				trackNumber: song.trackNumber,
				songTitle: song.songTitle,
				lyrics: song.lyrics,
				about: song.about,
				credits: song.credits,
				songTitleOverride: song.songTitleOverride,
				lyricsOverride: song.lyricsOverride,
				aboutOverride: song.aboutOverride,
				durationSecondsOverride: song.durationSecondsOverride,
				hiddenCreditLabels: song.hiddenCreditLabels,
				shownCreditLabels: song.shownCreditLabels,
			},
		}),
	);

	const itemSettingsById: Record<string, ZineItemSettings> = {};
	for (const song of albumData.songs) {
		itemSettingsById[song._id] = {
			columnCount: song.zineLyricsColumnCount,
			fontSizePt: song.zineLyricsFontSizePt,
			condenseScale: song.zineTitleCondenseScale,
			showCredits: song.zineShowCredits !== false,
			collapseWithPrevious: song.zineCollapseWithPrevious === true,
		};
	}

	return (
		<LyricsZine
			backHref={backHref}
			canEdit={canEdit}
			collectionTitle={displayAlbumTitle}
			coverArtistName={displayArtistName}
			cover={{
				imageUrl: albumData.album.zineCoverImageUrl,
				greyscale: albumData.album.zineCoverGreyscale === true,
			}}
			coverTextLayout={coverTextLayoutFromStoredFields(albumData.album)}
			coverReleaseYear={albumData.album.zineCoverReleaseYear}
			itemSettingsById={itemSettingsById}
			introPage={{
				content: resolveAlbumIntroContent(
					albumData.album.introPageContent,
					albumData.album.summaryOverride,
				),
				settings: {
					paragraphSpacingPt: albumData.album.zineIntroParagraphSpacingPt,
					marginPt: albumData.album.zineIntroMarginPt,
					verticalAlign: albumData.album.zineIntroVerticalAlign,
					fontSizePt: albumData.album.zineIntroFontSizePt,
				},
			}}
			displaySettings={albumData.album.zineDisplaySettings ?? undefined}
			insideBackSections={
				variant === "public"
					? hasInsideBackContent(albumData.album.zineInsideBackSections)
						? albumData.album.zineInsideBackSections
						: undefined
					: (albumData.album.zineInsideBackSections ?? [])
			}
			insideBackLayout={insideBackLayoutFromStoredFields(albumData.album)}
			siteWideHiddenCreditLabelKeys={albumData.siteWideHiddenCreditLabelKeys}
			ignoredCreditLabelKeys={albumData.ignoredCreditLabelKeys}
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
									zineCollapseWithPrevious: s.collapseWithPrevious,
								});
							},
							hideCreditLabel: (songId, label) => {
								void hideSongCreditLabel({
									songId: songId as Id<"geniusSongs">,
									label,
								});
							},
							showCreditLabel: (songId, label) => {
								void showSongCreditLabel({
									songId: songId as Id<"geniusSongs">,
									label,
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
							saveIntroSettings: (settings) => {
								void updateZineIntroSettings({
									albumId,
									zineIntroParagraphSpacingPt: settings.paragraphSpacingPt,
									zineIntroMarginPt: settings.marginPt,
									zineIntroVerticalAlign: settings.verticalAlign,
									zineIntroFontSizePt: settings.fontSizePt,
								});
							},
							saveInsideBackLayoutSettings: (layout) => {
								void updateZineInsideBackLayoutSettings({
									albumId,
									layout,
								});
							},
							saveDisplaySettings: (settings) => {
								void updateZineDisplaySettings({ albumId, settings });
							},
							saveCoverTextLayout: (layout) => {
								void updateZineCoverTextLayout({ albumId, layout });
							},
							saveCoverReleaseYear: (releaseYear) => {
								void updateZineCoverReleaseYear({ albumId, releaseYear });
							},
							saveIntroPageContent: (content) => {
								void updateAlbumOverrides({
									albumId,
									introPageContent: content,
									summaryOverride: content,
								});
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

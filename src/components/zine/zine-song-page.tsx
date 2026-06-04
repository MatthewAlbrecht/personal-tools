"use client";

import { cn } from "~/lib/utils";
import {
	ZINE_LYRICS_SIZE_SLIDER,
	ZINE_TEXT_CONDENSE,
} from "~/lib/zine/zine-layout";
import { LyricsRenderer } from "./lyrics-renderer";
import {
	type ZineLyricsColumnMode,
	useZineSongLyricsFit,
} from "./use-zine-song-lyrics-fit";
import type { ZineDisplayOptions } from "./zine-song-header";
import { ZineSongHeader } from "./zine-song-header";

export type { ZineDisplayOptions } from "./zine-song-header";
export type { ZineLyricsColumnMode } from "./use-zine-song-lyrics-fit";

type ZineSongPageSong = {
	songId: string;
	position: number;
	title: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	durationSeconds?: number;
	userNote?: string;
	introContent?: string;
	about?: string;
	lyrics: string;
};

export function ZineSongPage({
	song,
	displayOptions,
	lyricsColumnMode = 2,
	lyricsTargetFontSizePt,
	titleCondenseScale = ZINE_TEXT_CONDENSE.default,
	showCredits = true,
}: {
	song: ZineSongPageSong;
	displayOptions: ZineDisplayOptions;
	lyricsColumnMode?: ZineLyricsColumnMode;
	lyricsTargetFontSizePt?: number;
	titleCondenseScale?: number;
	showCredits?: boolean;
}) {
	const displayKey = [
		song.songId,
		song.position,
		displayOptions.showArtist,
		displayOptions.showAlbum,
		displayOptions.showYear,
		displayOptions.showAlbumArt,
		displayOptions.showIntro,
		displayOptions.showGeniusInfo,
		displayOptions.showSectionLabels,
		displayOptions.showUserNote,
		showCredits,
	].join(":");

	return (
		<ZineSongPageContent
			key={displayKey}
			displayKey={displayKey}
			displayOptions={displayOptions}
			lyricsColumnMode={lyricsColumnMode}
			lyricsTargetFontSizePt={lyricsTargetFontSizePt}
			showCredits={showCredits}
			song={song}
			titleCondenseScale={titleCondenseScale}
		/>
	);
}

function ZineSongPageContent({
	song,
	displayOptions,
	displayKey,
	lyricsColumnMode,
	lyricsTargetFontSizePt,
	titleCondenseScale,
	showCredits,
}: {
	song: ZineSongPageSong;
	displayOptions: ZineDisplayOptions;
	displayKey: string;
	lyricsColumnMode: ZineLyricsColumnMode;
	lyricsTargetFontSizePt?: number;
	titleCondenseScale: number;
	showCredits: boolean;
}) {
	const resolvedLyricsTargetPt =
		lyricsTargetFontSizePt ?? ZINE_LYRICS_SIZE_SLIDER.defaultPt;

	const lyricsFit = useZineSongLyricsFit({
		contentKey: `${displayKey}:${lyricsColumnMode}:condense${titleCondenseScale}:lyrics${resolvedLyricsTargetPt}`,
		lyrics: song.lyrics,
		lyricsColumnMode,
		showCredits,
		targetFontSizePt: resolvedLyricsTargetPt,
	});

	const hasLyrics = song.lyrics.trim().length > 0;

	return (
		<section
			ref={lyricsFit.pageRef}
			className="zine-page zine-page-preview zine-page-song"
		>
			<div ref={lyricsFit.headerRef} className="zine-song-page-header-wrap">
				<ZineSongHeader
					displayOptions={displayOptions}
					titleCondenseScale={titleCondenseScale}
					song={song}
				/>
				{hasLyrics ? (
					<p className="zine-section-label zine-song-lyrics-label">
						LYRICS
					</p>
				) : null}
			</div>
			<div
				ref={lyricsFit.lyricsClipRef}
				className="zine-song-lyrics zine-song-lyrics-body overflow-hidden leading-[1.35]"
				style={{
					height: lyricsFit.lyricsHeightPx
						? `${lyricsFit.lyricsHeightPx}px`
						: undefined,
				}}
			>
				<div
					ref={lyricsFit.lyricsScaledContentRef}
					className={cn(
						"zine-song-lyrics-scaled-inner h-full min-h-0",
						hasLyrics
							? lyricsFit.columnCount === 2
								? "zine-lyrics-columns"
								: "zine-lyrics-single-column"
							: "flex items-center justify-center",
					)}
					style={
						hasLyrics
							? { fontSize: `${lyricsFit.fontSizePt}pt` }
							: undefined
					}
				>
					{hasLyrics ? (
						<LyricsRenderer
							lyrics={song.lyrics}
							showSectionLabels={displayOptions.showSectionLabels}
						/>
					) : (
						<p className="text-center text-muted-foreground text-sm print:text-neutral-500">
							Instrumental track
						</p>
					)}
				</div>
			</div>
			{showCredits ? (
				<div className="zine-song-page-footer">
					<hr className="zine-song-footer-rule" />
					<p className="zine-section-label zine-song-footer-credits-label">
						CREDITS
					</p>
					<div className="zine-song-footer" />
				</div>
			) : null}
		</section>
	);
}

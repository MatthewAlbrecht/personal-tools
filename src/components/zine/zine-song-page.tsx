"use client";

import { cn } from "~/lib/utils";
import {
	ZINE_LYRICS_SIZE_SLIDER,
	ZINE_TEXT_CONDENSE,
} from "~/lib/zine/zine-layout";
import type { ZineCredit } from "~/lib/zine/zine-types";
import type { CreditVisibilityState } from "../../../convex/_utils/geniusCreditVisibility";
import {
	filterVisibleCredits,
	hasRenderableLyrics,
} from "../../../convex/_utils/geniusAlbumLyrics";
import { LyricsRenderer } from "./lyrics-renderer";
import { ZineSongPageFooterCredits } from "./zine-song-page-footer-credits";
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
	credits?: ZineCredit[];
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
};

export function ZineSongPage({
	song,
	displayOptions,
	lyricsColumnMode = 2,
	lyricsTargetFontSizePt,
	titleCondenseScale = ZINE_TEXT_CONDENSE.default,
	showCredits = true,
	creditVisibility,
	canEditCredits = false,
	onHideCreditLabel,
}: {
	song: ZineSongPageSong;
	displayOptions: ZineDisplayOptions;
	lyricsColumnMode?: ZineLyricsColumnMode;
	lyricsTargetFontSizePt?: number;
	titleCondenseScale?: number;
	showCredits?: boolean;
	creditVisibility?: CreditVisibilityState;
	canEditCredits?: boolean;
	onHideCreditLabel?: (label: string) => void;
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
		song.hiddenCreditLabels?.join("|") ?? "",
		song.shownCreditLabels?.join("|") ?? "",
		creditVisibility?.siteWideHiddenLabelKeys?.join("|") ?? "",
	].join(":");

	return (
		<ZineSongPageContent
			key={displayKey}
			canEditCredits={canEditCredits}
			creditVisibility={creditVisibility}
			displayKey={displayKey}
			displayOptions={displayOptions}
			lyricsColumnMode={lyricsColumnMode}
			lyricsTargetFontSizePt={lyricsTargetFontSizePt}
			onHideCreditLabel={onHideCreditLabel}
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
	creditVisibility,
	canEditCredits,
	onHideCreditLabel,
}: {
	song: ZineSongPageSong;
	displayOptions: ZineDisplayOptions;
	displayKey: string;
	lyricsColumnMode: ZineLyricsColumnMode;
	lyricsTargetFontSizePt?: number;
	titleCondenseScale: number;
	showCredits: boolean;
	creditVisibility?: CreditVisibilityState;
	canEditCredits: boolean;
	onHideCreditLabel?: (label: string) => void;
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

	const hasLyrics = hasRenderableLyrics(song.lyrics, {
		showSectionLabels: displayOptions.showSectionLabels,
	});
	const visibleCredits = filterVisibleCredits(song.credits, {
		hiddenCreditLabels: song.hiddenCreditLabels,
		shownCreditLabels: song.shownCreditLabels,
		siteWideHiddenLabelKeys: creditVisibility?.siteWideHiddenLabelKeys,
		ignoredLabelKeys: creditVisibility?.ignoredLabelKeys,
	});

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
						<p className="zine-instrumental-empty">Instrumental track</p>
					)}
				</div>
			</div>
			{showCredits ? (
				<div className="zine-song-page-footer">
					<hr className="zine-song-footer-rule" />
					<p className="zine-section-label zine-song-footer-credits-label">
						CREDITS
					</p>
					<div className="zine-song-footer">
						{visibleCredits ? (
							<ZineSongPageFooterCredits
								canEditCredits={canEditCredits}
								credits={visibleCredits}
								onHideCreditLabel={onHideCreditLabel}
							/>
						) : null}
					</div>
				</div>
			) : null}
		</section>
	);
}

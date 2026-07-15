"use client";

import { cn } from "~/lib/utils";
import {
	ZINE_LYRICS_SIZE_SLIDER,
	ZINE_TEXT_CONDENSE,
} from "~/lib/zine/zine-layout";
import type { ZineSongPageData } from "~/lib/zine/zine-pages";
import {
	filterVisibleCredits,
	hasRenderableLyrics,
} from "../../../convex/_utils/geniusAlbumLyrics";
import type { CreditVisibilityState } from "../../../convex/_utils/geniusCreditVisibility";
import { LyricsRenderer } from "./lyrics-renderer";
import type { ZineDisplayOptions } from "./zine-song-header";
import { ZineSongHeader } from "./zine-song-header";
import { ZineSongPageFooterCredits } from "./zine-song-page-footer-credits";

export function ZineSongGroupPage({
	songs,
	displayOptions,
	getTitleCondenseScale,
	getLyricsFontSizePt,
	getShowCredits,
	creditVisibility,
	canEditCredits,
	onHideCreditLabel,
}: {
	songs: ZineSongPageData[];
	displayOptions: ZineDisplayOptions;
	getTitleCondenseScale: (songId: string) => number;
	getLyricsFontSizePt: (songId: string) => number;
	getShowCredits: (songId: string) => boolean;
	creditVisibility?: CreditVisibilityState;
	canEditCredits?: boolean;
	onHideCreditLabel?: (songId: string, label: string) => void;
}) {
	return (
		<section className="zine-page zine-page-preview zine-page-song zine-page-song-group">
			{songs.map((song) => {
				const hasLyrics = hasRenderableLyrics(song.lyrics, {
					showSectionLabels: displayOptions.showSectionLabels,
				});
				const showCredits = getShowCredits(song.songId);
				const visibleCredits = showCredits
					? filterVisibleCredits(song.credits, {
							hiddenCreditLabels: song.hiddenCreditLabels,
							shownCreditLabels: song.shownCreditLabels,
							siteWideHiddenLabelKeys:
								creditVisibility?.siteWideHiddenLabelKeys,
							ignoredLabelKeys: creditVisibility?.ignoredLabelKeys,
						})
					: undefined;
				const lyricsFontSizePt =
					getLyricsFontSizePt(song.songId) ?? ZINE_LYRICS_SIZE_SLIDER.defaultPt;

				return (
					<div key={song.songId} className="zine-song-group-block">
						<ZineSongHeader
							displayOptions={displayOptions}
							titleCondenseScale={
								getTitleCondenseScale(song.songId) ?? ZINE_TEXT_CONDENSE.default
							}
							song={song}
						/>
						{hasLyrics ? (
							<div
								className="zine-song-group-lyrics zine-lyrics-single-column leading-[1.35]"
								style={{ fontSize: `${lyricsFontSizePt}pt` }}
							>
								<LyricsRenderer
									lyrics={song.lyrics}
									showSectionLabels={displayOptions.showSectionLabels}
								/>
							</div>
						) : null}
						{visibleCredits?.length ? (
							<div
								className={cn(
									"zine-song-group-credits",
									hasLyrics && "zine-song-group-credits-with-lyrics",
								)}
							>
								<ZineSongPageFooterCredits
									canEditCredits={canEditCredits ?? false}
									credits={visibleCredits}
									onHideCreditLabel={
										canEditCredits && onHideCreditLabel
											? (label) => onHideCreditLabel(song.songId, label)
											: undefined
									}
									showRule={displayOptions.showCreditsRule}
								/>
							</div>
						) : null}
					</div>
				);
			})}
		</section>
	);
}

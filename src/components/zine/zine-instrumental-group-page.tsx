"use client";

import { ZINE_TEXT_CONDENSE } from "~/lib/zine/zine-layout";
import type { ZinePageRecommendation } from "~/lib/zine/zine-page-recommendations";
import { getVisiblePageRecommendations } from "~/lib/zine/zine-page-recommendations";
import type { ZineSongPageData } from "~/lib/zine/zine-pages";
import { filterVisibleCredits } from "../../../convex/_utils/geniusAlbumLyrics";
import type { CreditVisibilityState } from "../../../convex/_utils/geniusCreditVisibility";
import type { ZineDisplayOptions } from "./zine-song-header";
import { ZineSongHeader } from "./zine-song-header";
import { ZineSongPageFooterCredits } from "./zine-song-page-footer-credits";
import { ZineSongPageRecommendations } from "./zine-song-page-recommendations";

export function ZineInstrumentalGroupPage({
	songs,
	displayOptions,
	getTitleCondenseScale,
	getShowCredits,
	pageRecommendations,
	creditVisibility,
	canEditCredits,
	onHideCreditLabel,
}: {
	songs: ZineSongPageData[];
	displayOptions: ZineDisplayOptions;
	getTitleCondenseScale: (songId: string) => number;
	getShowCredits: (songId: string) => boolean;
	pageRecommendations?: ZinePageRecommendation[];
	creditVisibility?: CreditVisibilityState;
	canEditCredits?: boolean;
	onHideCreditLabel?: (songId: string, label: string) => void;
}) {
	const visibleRecommendations =
		getVisiblePageRecommendations(pageRecommendations);
	const lastSongId = songs.at(-1)?.songId;
	return (
		<section className="zine-page zine-page-preview zine-page-song zine-page-instrumental-group">
			{songs.map((song) => {
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
				const showRecommendations =
					song.songId === lastSongId && visibleRecommendations.length > 0;

				return (
					<div key={song.songId} className="zine-instrumental-group-block">
						<ZineSongHeader
							displayOptions={displayOptions}
							titleCondenseScale={
								getTitleCondenseScale(song.songId) ?? ZINE_TEXT_CONDENSE.default
							}
							song={song}
						/>
						{showRecommendations || visibleCredits?.length ? (
							<div className="zine-instrumental-group-track-credits">
								{showRecommendations ? (
									<ZineSongPageRecommendations items={visibleRecommendations} />
								) : null}
								{visibleCredits?.length ? (
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
								) : null}
							</div>
						) : null}
					</div>
				);
			})}
		</section>
	);
}

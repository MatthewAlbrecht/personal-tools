"use client";

import { filterVisibleCredits } from "../../../convex/_utils/geniusAlbumLyrics";
import type { CreditVisibilityState } from "../../../convex/_utils/geniusCreditVisibility";
import { ZINE_TEXT_CONDENSE } from "~/lib/zine/zine-layout";
import type { ZineSongPageData } from "~/lib/zine/zine-pages";
import type { ZineDisplayOptions } from "./zine-song-header";
import { ZineSongHeader } from "./zine-song-header";
import { ZineSongPageFooterCredits } from "./zine-song-page-footer-credits";

export function ZineInstrumentalGroupPage({
	songs,
	displayOptions,
	getTitleCondenseScale,
	getShowCredits,
	creditVisibility,
	canEditCredits,
	onHideCreditLabel,
}: {
	songs: ZineSongPageData[];
	displayOptions: ZineDisplayOptions;
	getTitleCondenseScale: (songId: string) => number;
	getShowCredits: (songId: string) => boolean;
	creditVisibility?: CreditVisibilityState;
	canEditCredits?: boolean;
	onHideCreditLabel?: (songId: string, label: string) => void;
}) {
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

				return (
					<div key={song.songId} className="zine-instrumental-group-block">
						<ZineSongHeader
							displayOptions={displayOptions}
							titleCondenseScale={
								getTitleCondenseScale(song.songId) ??
								ZINE_TEXT_CONDENSE.default
							}
							song={song}
						/>
						{visibleCredits?.length ? (
							<div className="zine-instrumental-group-track-credits">
								<ZineSongPageFooterCredits
									canEditCredits={canEditCredits ?? false}
									credits={visibleCredits}
									onHideCreditLabel={
										canEditCredits && onHideCreditLabel
											? (label) => onHideCreditLabel(song.songId, label)
											: undefined
									}
								/>
							</div>
						) : null}
					</div>
				);
			})}
		</section>
	);
}

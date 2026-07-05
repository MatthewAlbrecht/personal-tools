"use client";

import {
	buildTrackPrimaryLineParts,
	buildZineCreditParts,
	getPlaceholderTrackDurationSeconds,
} from "~/lib/zine/zine-song-header-content";
import { FormattedIntroContent } from "./formatted-intro-content";

export type ZineDisplayOptions = {
	showArtist: boolean;
	showAlbum: boolean;
	showYear: boolean;
	showAlbumArt: boolean;
	showIntro: boolean;
	showGeniusInfo: boolean;
	showSectionLabels: boolean;
	showUserNote: boolean;
};

export function ZineSongHeader({
	song,
	displayOptions,
	titleCondenseScale = 1,
}: {
	song: {
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
	};
	displayOptions: ZineDisplayOptions;
	/** CSS `scaleX` on track title only (track # and duration unscaled). */
	titleCondenseScale?: number;
}) {
	const showAlbumArt =
		displayOptions.showAlbumArt && Boolean(song.albumArtUrl?.trim());
	const creditParts = buildZineCreditParts(song, {
		showArtist: displayOptions.showArtist,
		showAlbum: displayOptions.showAlbum,
		showYear: displayOptions.showYear,
	});
	const durationSeconds =
		song.durationSeconds ?? getPlaceholderTrackDurationSeconds(song.position);
	const primaryLineParts = buildTrackPrimaryLineParts({
		position: song.position,
		title: song.title,
		durationSeconds,
	});

	const introContent = song.introContent?.trim();
	const hasCustomIntro = Boolean(introContent);
	const showUserNote =
		displayOptions.showUserNote && Boolean(song.userNote?.trim());
	const showAbout =
		displayOptions.showGeniusInfo && Boolean(song.about?.trim());

	return (
		<div className="zine-song-header">
			<div
				className={
					showAlbumArt ? "zine-song-top" : "zine-song-top zine-song-top-no-art"
				}
			>
				{showAlbumArt ? (
					<img
						src={song.albumArtUrl}
						alt={`${song.title} album art`}
						className="zine-album-art"
					/>
				) : null}
				<div className="zine-song-top-info">
					<div className="zine-song-primary-line-clip w-full min-w-0 overflow-hidden whitespace-nowrap text-[12pt] leading-none">
						<div className="zine-song-primary-line flex w-full min-w-0 max-w-none flex-nowrap items-baseline gap-[0.35em] leading-none">
							<span className="zine-song-track-number">
								{primaryLineParts.trackNumberLabel}
							</span>
							<span className="zine-song-track-title min-w-0 shrink">
								<span
									className="zine-song-track-title-text inline-block"
									style={{
										transform: `scaleX(${titleCondenseScale})`,
										transformOrigin: "left center",
									}}
								>
									{primaryLineParts.title}
								</span>
							</span>
							<span className="zine-song-track-duration">
								{primaryLineParts.durationText}
							</span>
						</div>
					</div>
					{creditParts.length > 0 ? (
						<p className="zine-song-credits mt-1 text-[8pt] leading-snug">
							{creditParts.map((part, index) => (
								<span
									key={
										part.kind === "album" ? "album" : `${part.value}-${index}`
									}
								>
									{index > 0 ? " · " : null}
									{part.kind === "album" ? <em>{part.value}</em> : part.value}
								</span>
							))}
						</p>
					) : null}
					{displayOptions.showIntro && hasCustomIntro ? (
						<div className="zine-song-intro">
							<p className="zine-section-label zine-song-intro-label">INTRO</p>
							<FormattedIntroContent
								className="zine-song-intro-body"
								content={introContent ?? ""}
								paragraphClassName="zine-song-intro-paragraph"
							/>
						</div>
					) : null}
				</div>
			</div>
			{showUserNote ? (
				<div className="zine-song-note mt-1 rounded border border-neutral-300 bg-neutral-50 p-1.5 text-[7pt] leading-snug">
					<p className="whitespace-pre-line">{song.userNote}</p>
				</div>
			) : null}
			{showAbout ? (
				<div className="zine-song-note mt-1 rounded border border-neutral-300 bg-neutral-50 p-1.5 text-[7pt] leading-snug">
					<p className="whitespace-pre-line">{song.about}</p>
				</div>
			) : null}
		</div>
	);
}

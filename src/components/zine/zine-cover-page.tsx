"use client";

import type { CSSProperties } from "react";
import { siApplemusic, siSpotify } from "simple-icons";
import type { ZineBackCoverQrCodes } from "~/lib/zine/zine-types";
import {
	coverTextLayoutToStyleProperties,
	resolveZineCoverTextLayout,
	type ZineCoverTextLayout,
} from "~/lib/zine/zine-cover-text-layout";
import { cn } from "~/lib/utils";
import { useAutoFitText } from "./use-auto-fit-text";

export function ZineCoverPage({
	playlistTitle,
	artistName,
	releaseYear,
	coverTextLayout,
	coverImageUrl,
	coverGreyscale = false,
	coverSide = "front",
	useSheetSpreadBackground = false,
	backCoverQrCodes,
}: {
	playlistTitle: string;
	artistName?: string;
	releaseYear?: number;
	coverTextLayout?: Partial<ZineCoverTextLayout> | null;
	coverImageUrl?: string;
	coverGreyscale?: boolean;
	coverSide?: "front" | "back";
	useSheetSpreadBackground?: boolean;
	backCoverQrCodes?: ZineBackCoverQrCodes;
}) {
	const isBack = coverSide === "back";
	const hasCoverImage = Boolean(coverImageUrl?.trim());
	const showPerPanelBackground = hasCoverImage && !useSheetSpreadBackground;
	const displayArtistName = artistName?.trim() ?? "";
	const showArtistName = !isBack && displayArtistName !== "";
	const displayReleaseYear =
		!isBack && releaseYear !== undefined ? String(releaseYear) : "";
	const showReleaseYear = displayReleaseYear !== "";
	const resolvedCoverTextLayout = resolveZineCoverTextLayout(coverTextLayout);
	const coverTextStyle = coverTextLayoutToStyleProperties(resolvedCoverTextLayout);
	const { containerRef: titleRef, fontSizePt: titleFontSizePt } = useAutoFitText({
		initialFontSizePt: 26,
		minFontSizePt: 12,
		mode: "single-line",
		contentKey: `${coverSide}:${playlistTitle}:${coverImageUrl ?? ""}:${resolvedCoverTextLayout.anchor}:${resolvedCoverTextLayout.textAlign}`,
	});
	const { containerRef: artistRef, fontSizePt: artistFontSizePt } =
		useAutoFitText({
			initialFontSizePt: 14,
			minFontSizePt: 8,
			mode: "single-line",
			contentKey: `${coverSide}:${displayArtistName}:${coverImageUrl ?? ""}`,
		});

	const spotifyQr = backCoverQrCodes?.spotify;
	const appleMusicQr = backCoverQrCodes?.appleMusic;
	const showSpotifyQr =
		spotifyQr?.show === true && Boolean(spotifyQr.imageUrl?.trim());
	const showAppleMusicQr =
		appleMusicQr?.show === true && Boolean(appleMusicQr.imageUrl?.trim());
	const showBackCoverQrs = isBack && (showSpotifyQr || showAppleMusicQr);

	return (
		<section
			className={cn(
				"zine-page zine-page-preview zine-page-cover",
				coverSide === "front" ? "zine-cover-front" : "zine-cover-back",
				showPerPanelBackground && "zine-cover-has-image zine-cover-spread-half",
				coverGreyscale && hasCoverImage && "zine-cover-greyscale",
			)}
			style={
				showPerPanelBackground
					? { backgroundImage: `url("${coverImageUrl}")` }
					: undefined
			}
		>
			{!isBack ? (
				<div
					className="zine-cover-title-wrap"
					style={coverTextStyle as CSSProperties}
				>
					<div className="zine-cover-title-stack">
						{showReleaseYear ? (
							<div className="zine-cover-year-pill overflow-hidden whitespace-nowrap font-medium leading-none">
								{displayReleaseYear}
							</div>
						) : null}
						<div
							ref={titleRef}
							className="zine-cover-title-pill overflow-hidden whitespace-nowrap font-bold leading-none"
							style={{ fontSize: `${titleFontSizePt}pt` }}
						>
							{playlistTitle}
						</div>
						{showArtistName ? (
							<div
								ref={artistRef}
								className="zine-cover-artist-pill overflow-hidden whitespace-nowrap font-medium leading-none"
								style={{ fontSize: `${artistFontSizePt}pt` }}
							>
								{displayArtistName}
							</div>
						) : null}
					</div>
				</div>
			) : null}
			{showBackCoverQrs ? (
				<div className="zine-back-cover-qrs" aria-label="Playlist QR codes">
					{showSpotifyQr ? (
						<div className="zine-back-cover-qr-item">
							<SpotifyLogo className="zine-back-cover-qr-logo" />
							{/* biome-ignore lint/a11y/noRedundantAlt: decorative QR with service label */}
							<img
								alt="Spotify playlist QR code"
								className="zine-back-cover-qr-image"
								src={spotifyQr.imageUrl}
							/>
						</div>
					) : null}
					{showAppleMusicQr ? (
						<div
							className={cn(
								"zine-back-cover-qr-item",
								!showSpotifyQr && "zine-back-cover-qr-item--solo-right",
							)}
						>
							<AppleMusicLogo className="zine-back-cover-qr-logo" />
							{/* biome-ignore lint/a11y/noRedundantAlt: decorative QR with service label */}
							<img
								alt="Apple Music playlist QR code"
								className="zine-back-cover-qr-image"
								src={appleMusicQr.imageUrl}
							/>
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
}

function SpotifyLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			role="img"
			aria-label="Spotify"
		>
			<path fill={`#${siSpotify.hex}`} d={siSpotify.path} />
		</svg>
	);
}

function AppleMusicLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			role="img"
			aria-label="Apple Music"
		>
			<path fill={`#${siApplemusic.hex}`} d={siApplemusic.path} />
		</svg>
	);
}

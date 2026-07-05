"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, BookOpen, Columns2, Printer } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { LyricsRenderer } from "~/components/zine/lyrics-renderer";
import { resolveAlbumIntroContent } from "~/lib/zine/zine-intro-content";
import { api } from "../../../../../convex/_generated/api";
import { filterVisibleCredits } from "../../../../../convex/_utils/geniusAlbumLyrics";

export default function PublicAlbumLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const unwrappedParams = React.use(params);
	const slug = unwrappedParams.slug;

	const albumData = useQuery(api.geniusAlbums.getPublicAlbumBySlug, { slug });
	const [isCompact, setIsCompact] = useState(false);
	const [showGeniusInfo, setShowGeniusInfo] = useState(false);
	const [showSectionLabels, setShowSectionLabels] = useState(true);

	if (albumData === undefined) {
		return <AlbumSkeleton />;
	}

	if (albumData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Album Not Found</h1>
				<p className="text-muted-foreground">
					The album you're looking for doesn't exist.
				</p>
			</div>
		);
	}

	function handlePrint() {
		setIsCompact(false);
		setTimeout(() => window.print(), 50);
	}

	function handleCompactPrint() {
		setIsCompact(true);
		setTimeout(() => window.print(), 50);
	}

	const { album, songs, siteWideHiddenCreditLabelKeys, ignoredCreditLabelKeys } =
		albumData;
	const displayAlbumTitle =
		album.albumTitleOverride?.trim() || album.albumTitle;
	const displayArtistName =
		album.artistNameOverride?.trim() || album.artistName;
	const displaySummary = resolveAlbumIntroContent(
		album.introPageContent,
		album.summaryOverride,
	);
	const frontPageImageUrl =
		album.frontPageImageUrlOverride?.trim() || album.zineCoverImageUrl;

	return (
		<div
			className={`mx-auto max-w-4xl px-4 py-10 ${isCompact ? "print-compact" : ""}`}
		>
			{/* Back button - hidden when printing */}
			<div className="mb-6 print:hidden">
				<Button asChild variant="ghost">
					<Link href="/public/lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Albums
					</Link>
				</Button>
			</div>

			{/* Header */}
			<header className="mb-8 text-center print:mb-12">
				{frontPageImageUrl ? (
					<img
						src={frontPageImageUrl}
						alt={`${displayAlbumTitle} cover`}
						className="mx-auto mb-6 h-48 w-48 rounded-lg object-cover print:h-40 print:w-40"
					/>
				) : null}
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{displayAlbumTitle}
				</h1>
				<h2 className="text-2xl text-muted-foreground print:text-3xl">
					{displayArtistName}
				</h2>
				{displaySummary ? (
					<p className="mx-auto mt-4 max-w-2xl whitespace-pre-line text-muted-foreground text-sm leading-relaxed print:text-base">
						{displaySummary}
					</p>
				) : null}
				<p className="mt-2 text-muted-foreground text-sm print:hidden">
					{songs.length} {songs.length === 1 ? "song" : "songs"}
				</p>
			</header>

			{/* Print options - hidden when printing */}
			<div className="mb-8 flex flex-col items-center gap-3 print:hidden">
				<div className="flex items-center gap-2">
					<Checkbox
						id="genius-info"
						checked={showGeniusInfo}
						onCheckedChange={(checked) => setShowGeniusInfo(checked === true)}
					/>
					<Label htmlFor="genius-info" className="cursor-pointer text-sm">
						Show Genius info
					</Label>
				</div>
				<div className="flex items-center gap-2">
					<Checkbox
						id="show-section-labels"
						checked={showSectionLabels}
						onCheckedChange={(checked) =>
							setShowSectionLabels(checked === true)
						}
					/>
					<Label
						htmlFor="show-section-labels"
						className="cursor-pointer text-sm"
					>
						Show song part labels
					</Label>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link href={`/public/lyrics/${slug}/zine`}>
							<BookOpen className="mr-2 h-4 w-4" />
							Zine
						</Link>
					</Button>
					<Button variant="outline" onClick={handlePrint}>
						<Printer className="mr-2 h-4 w-4" />
						Print
					</Button>
					<Button variant="outline" onClick={handleCompactPrint}>
						<Columns2 className="mr-2 h-4 w-4" />
						2-Column
					</Button>
				</div>
			</div>

			{/* Songs */}
			<div className="lyrics-content space-y-12 print:space-y-8">
				{songs.map((song) => {
					const displayTitle = song.songTitleOverride?.trim() || song.songTitle;
					const displayLyrics = song.lyricsOverride?.trim() || song.lyrics;
					const displayAbout = song.aboutOverride?.trim() || song.about;
					const visibleCredits = filterVisibleCredits(song.credits, {
						hiddenCreditLabels: song.hiddenCreditLabels,
						shownCreditLabels: song.shownCreditLabels,
						siteWideHiddenLabelKeys: siteWideHiddenCreditLabelKeys,
						ignoredLabelKeys: ignoredCreditLabelKeys,
					});
					const hasLyrics = displayLyrics.trim().length > 0;

					return (
						<article key={song._id} className="print:mb-12">
							{/* Track Number */}
							<span className="text-muted-foreground text-sm print:text-xs">
								Track {song.trackNumber}
							</span>
							{/* Song Title */}
							<h3 className="mb-4 font-semibold text-2xl print:text-3xl">
								{displayTitle}
							</h3>

							{/* About Section (if exists) */}
							{displayAbout && showGeniusInfo && (
								<div className="mb-6 rounded-lg bg-muted p-4 text-sm leading-relaxed print:mb-8 print:border print:border-gray-300 print:bg-gray-50 print:text-base">
									{displayAbout.split("\n\n").map((paragraph, idx) => (
										<p key={idx} className="mb-2 last:mb-0">
											{paragraph}
										</p>
									))}
								</div>
							)}

							{visibleCredits && showGeniusInfo ? (
								<CreditRows credits={visibleCredits} />
							) : null}

							{/* Lyrics */}
							<div className="font-sans leading-relaxed print:text-base">
								{hasLyrics ? (
									<LyricsRenderer
										lyrics={displayLyrics}
										showSectionLabels={showSectionLabels}
									/>
								) : (
									<p className="rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm">
										No lyrics available for this track.
									</p>
								)}
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

function CreditRows({
	credits,
}: {
	credits: NonNullable<ReturnType<typeof filterVisibleCredits>>;
}) {
	return (
		<div className="mb-6 rounded-lg border bg-muted/30 p-4 text-sm print:mb-8">
			{credits.map((credit) => (
				<div key={credit.label} className="mb-2 last:mb-0">
					<span className="font-medium">{credit.label}: </span>
					{credit.contributors.map((contributor, index) => (
						<React.Fragment
							key={`${credit.label}-${contributor.name}-${index}`}
						>
							{index > 0 ? ", " : null}
							{contributor.url ? (
								<a
									href={contributor.url}
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:text-foreground"
								>
									{contributor.name}
								</a>
							) : (
								<span>{contributor.name}</span>
							)}
						</React.Fragment>
					))}
				</div>
			))}
		</div>
	);
}

function AlbumSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
			<div className="text-center">
				<Skeleton className="mx-auto mb-4 h-12 w-3/4" />
				<Skeleton className="mx-auto h-8 w-1/2" />
			</div>
			<div className="space-y-8">
				{[1, 2, 3].map((i) => (
					<div key={i} className="space-y-4">
						<Skeleton className="h-8 w-64" />
						<Skeleton className="h-32 w-full" />
					</div>
				))}
			</div>
		</div>
	);
}

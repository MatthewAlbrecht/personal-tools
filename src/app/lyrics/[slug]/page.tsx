"use client";

import { useQuery } from "convex/react";
import {
	ArrowLeft,
	BookOpen,
	Columns2,
	Link as LinkIcon,
	Pencil,
	Printer,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { LyricsRenderer } from "~/components/zine/lyrics-renderer";
import { resolveAlbumIntroContent } from "~/lib/zine/zine-intro-content";
import { api } from "../../../../convex/_generated/api";
import { filterVisibleCredits } from "../../../../convex/_utils/geniusAlbumLyrics";

export default function AlbumLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const unwrappedParams = React.use(params);
	const slug = unwrappedParams.slug;
	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });
	const [isCompact, setIsCompact] = useState(false);
	const [showGeniusInfo, setShowGeniusInfo] = useState(false);
	const [showSectionLabels, setShowSectionLabels] = useState(true);

	function handlePrint() {
		setIsCompact(false);
		setTimeout(() => window.print(), 50);
	}

	function handleCompactPrint() {
		setIsCompact(true);
		setTimeout(() => window.print(), 50);
	}

	function handleCopyPublicLink() {
		const publicUrl = `${window.location.origin}/public/lyrics/${slug}`;
		navigator.clipboard.writeText(publicUrl);
		toast.success("Public link copied to clipboard!");
	}

	if (albumData === undefined) {
		return <AlbumSkeleton />;
	}

	if (albumData === null || !albumData.album) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Album Not Found</h1>
				<p className="mb-6 text-muted-foreground">
					The album you're looking for doesn't exist or has been deleted.
				</p>
				<Button asChild>
					<Link href="/lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Search
					</Link>
				</Button>
			</div>
		);
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
			className={`mx-auto max-w-4xl px-4 py-10 print:px-2 print:py-4 ${isCompact ? "print-compact" : ""}`}
		>
			{/* Navigation Header - Hidden on Print */}
			<div className="no-print mb-6 flex items-center justify-between">
				<Button asChild variant="ghost">
					<Link href="/lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Search
					</Link>
				</Button>
				<div className="flex items-center gap-4">
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
							<Link href={`/lyrics/${slug}/edit`}>
								<Pencil className="mr-2 h-4 w-4" />
								Edit data
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href={`/lyrics/${slug}/zine`}>
								<BookOpen className="mr-2 h-4 w-4" />
								Zine
							</Link>
						</Button>
						<Button onClick={handleCopyPublicLink} variant="outline">
							<LinkIcon className="mr-2 h-4 w-4" />
							Share Link
						</Button>
						<Button onClick={handlePrint} variant="outline">
							<Printer className="mr-2 h-4 w-4" />
							Print
						</Button>
						<Button onClick={handleCompactPrint} variant="outline">
							<Columns2 className="mr-2 h-4 w-4" />
							2-Column
						</Button>
					</div>
				</div>
			</div>

			{/* Album Header */}
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

			{/* Songs List */}
			<div className="lyrics-content space-y-12 print:space-y-16">
				{songs.length === 0 ? (
					<p className="text-center text-muted-foreground">
						No songs found for this album.
					</p>
				) : (
					songs.map((song) => {
						const displayTitle =
							song.songTitleOverride?.trim() || song.songTitle;
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
							<article
								key={song._id}
								className="page-break-inside-avoid print:mb-16"
							>
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
					})
				)}
			</div>

			{/* Footer - Hidden on Print */}
			<div className="no-print mt-12 border-t pt-6 text-center text-muted-foreground text-sm">
				<p>
					Lyrics sourced from{" "}
					<a
						href={album.geniusAlbumUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="underline hover:text-foreground"
					>
						Genius.com
					</a>
				</p>
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

"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Columns2, Link as LinkIcon, Printer } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";

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

function formatLyrics(lyrics: string): React.ReactNode {
	// Split by lines
	const lines = lyrics.split("\n");

	return lines.map((line, index) => {
		// Check if line is a section header like [Verse 2], [Chorus], etc.
		const isSectionHeader = /^\[.*\]$/.test(line.trim());

		if (isSectionHeader) {
			return (
				<span
					key={index}
					className="text-muted-foreground text-sm print:text-xs"
				>
					{line}
					<br />
				</span>
			);
		}

		// Handle formatting markers
		const parts: React.ReactNode[] = [];
		const currentText = line;
		let key = 0;

		// Process italics (*text*)
		const italicRegex = /\*([^*]+)\*/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		// biome-ignore lint/suspicious/noAssignInExpressions: Standard pattern for regex exec loop
		while ((match = italicRegex.exec(line)) !== null) {
			// Add text before the italic
			if (match.index > lastIndex) {
				parts.push(line.substring(lastIndex, match.index));
			}
			// Add italic text
			parts.push(
				<em key={`italic-${index}-${key++}`} className="italic">
					{match[1]}
				</em>,
			);
			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < line.length) {
			parts.push(line.substring(lastIndex));
		}

		// If line is empty, just return a line break
		if (line.trim() === "") {
			return <br key={index} />;
		}

		return (
			<span key={index}>
				{parts.length > 0 ? parts : line}
				<br />
			</span>
		);
	});
}

export default function AlbumLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const unwrappedParams = React.use(params);
	const slug = unwrappedParams.slug;
	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });
	const [isCompact, setIsCompact] = useState(false);
	const [showGeniusInfo, setShowGeniusInfo] = useState(true);

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

	const { album, songs } = albumData;

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
					<div className="flex gap-2">
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
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{album.albumTitle}
				</h1>
				<h2 className="text-2xl text-muted-foreground print:text-3xl">
					{album.artistName}
				</h2>
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
					songs.map((song) => (
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
								{song.songTitle}
							</h3>

							{/* About Section (if exists) */}
							{song.about && showGeniusInfo && (
								<div className="mb-6 rounded-lg bg-muted p-4 text-sm leading-relaxed print:mb-8 print:border print:border-gray-300 print:bg-gray-50 print:text-base">
									{song.about.split("\n\n").map((paragraph, idx) => (
										<p key={idx} className="mb-2 last:mb-0">
											{paragraph}
										</p>
									))}
								</div>
							)}

							{/* Lyrics */}
							<div className="font-sans leading-relaxed print:text-base">
								{formatLyrics(song.lyrics)}
							</div>
						</article>
					))
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

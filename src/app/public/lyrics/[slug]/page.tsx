"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import React from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../../convex/_generated/api";

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

export default function PublicAlbumLyricsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const unwrappedParams = React.use(params);
	const slug = unwrappedParams.slug;

	const albumData = useQuery(api.geniusAlbums.getAlbumBySlug, { slug });

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
		window.print();
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-10">
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
			<header className="mb-12 text-center print:mb-8">
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{albumData.album.albumTitle}
				</h1>
				<p className="mb-4 text-muted-foreground text-xl print:text-2xl">
					{albumData.album.artistName}
				</p>
				<p className="text-muted-foreground text-sm print:text-base">
					{albumData.album.totalSongs} songs
				</p>

				{/* Print button - hidden when printing */}
				<div className="mt-6 print:hidden">
					<Button variant="outline" onClick={handlePrint}>
						<Printer className="mr-2 h-4 w-4" />
						Print Lyrics
					</Button>
				</div>
			</header>

			{/* Songs */}
			<div className="space-y-12 print:space-y-8">
				{albumData.songs.map((song) => (
					<article key={song._id} className="print:mb-12">
						{/* Song Title */}
						<h3 className="mb-4 font-semibold text-2xl print:text-3xl">
							{song.trackNumber}. {song.songTitle}
						</h3>

						{/* About Section (if exists) */}
						{song.about && (
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
				))}
			</div>
		</div>
	);
}

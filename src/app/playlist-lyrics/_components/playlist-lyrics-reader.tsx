"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Columns2, Edit, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { LyricsRenderer } from "./lyrics-renderer";

type PlaylistLyricsItemWithScrape = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};

export function PlaylistLyricsReader({ slug }: { slug: string }) {
	const playlistData = useQuery(api.playlistLyrics.getBySlug, { slug });
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

	if (playlistData === undefined) {
		return <PlaylistLyricsReaderSkeleton />;
	}

	if (playlistData === null) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-10 text-center">
				<h1 className="mb-4 font-bold text-2xl">Playlist Not Found</h1>
				<p className="mb-6 text-muted-foreground">
					The playlist you're looking for doesn't exist or has been deleted.
				</p>
				<Button asChild>
					<Link href="/playlist-lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Playlist Lyrics
					</Link>
				</Button>
			</div>
		);
	}

	const { playlist, songs } = playlistData;

	return (
		<div
			className={`mx-auto max-w-4xl px-4 py-10 print:px-2 print:py-4 ${isCompact ? "print-compact" : ""}`}
		>
			<div className="no-print mb-6 flex items-center justify-between">
				<Button asChild variant="ghost">
					<Link href="/playlist-lyrics">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Playlist Lyrics
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
						<Button asChild variant="outline">
							<Link href={`/playlist-lyrics/${slug}/edit`}>
								<Edit className="mr-2 h-4 w-4" />
								Edit
							</Link>
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

			<header className="mb-8 text-center print:mb-12">
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{playlist.title}
				</h1>
				{playlist.theme && (
					<p className="text-2xl text-muted-foreground print:text-3xl">
						{playlist.theme}
					</p>
				)}
				{playlist.description && (
					<p className="mx-auto mt-4 max-w-3xl whitespace-pre-line text-muted-foreground print:text-lg">
						{playlist.description}
					</p>
				)}
				{playlist.notes && (
					<div className="mx-auto mt-6 max-w-3xl rounded-lg bg-muted p-4 text-left text-sm leading-relaxed print:border print:border-gray-300 print:bg-gray-50 print:text-base">
						<p className="whitespace-pre-line">{playlist.notes}</p>
					</div>
				)}
				<p className="mt-4 text-muted-foreground text-sm print:hidden">
					{songs.length} {songs.length === 1 ? "song" : "songs"}
				</p>
			</header>

			<div className="lyrics-content space-y-12 print:space-y-16">
				{songs.length === 0 ? (
					<p className="text-center text-muted-foreground">
						No songs found for this playlist.
					</p>
				) : (
					songs.map((song) => (
						<article
							key={song._id}
							className="page-break-inside-avoid print:mb-16"
						>
							<span className="text-muted-foreground text-sm print:text-xs">
								Track {song.position}
							</span>
							<h2 className="mb-2 font-semibold text-2xl print:text-3xl">
								{getSongTitle(song)}
							</h2>
							<p className="mb-4 text-muted-foreground print:text-lg">
								{getArtistName(song)}
								{getAlbumTitle(song) ? ` - ${getAlbumTitle(song)}` : ""}
							</p>

							{song.userNote && (
								<div className="mb-6 rounded-lg bg-muted p-4 text-sm leading-relaxed print:mb-8 print:border print:border-gray-300 print:bg-gray-50 print:text-base">
									<p className="whitespace-pre-line">{song.userNote}</p>
								</div>
							)}

							{song.scrape?.about && showGeniusInfo && (
								<div className="mb-6 rounded-lg bg-muted p-4 text-sm leading-relaxed print:mb-8 print:border print:border-gray-300 print:bg-gray-50 print:text-base">
									<p className="whitespace-pre-line">{song.scrape.about}</p>
								</div>
							)}

							<div className="font-sans leading-relaxed print:text-base">
								{song.scrape?.lyrics ? (
									<LyricsRenderer lyrics={song.scrape.lyrics} />
								) : (
									<p className="text-muted-foreground">
										Lyrics are not available for this song.
									</p>
								)}
							</div>
						</article>
					))
				)}
			</div>
		</div>
	);
}

function PlaylistLyricsReaderSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
			<div className="text-center">
				<Skeleton className="mx-auto mb-4 h-12 w-3/4" />
				<Skeleton className="mx-auto h-8 w-1/2" />
			</div>
			<div className="space-y-8">
				{[1, 2, 3].map((songNumber) => (
					<div key={songNumber} className="space-y-4">
						<Skeleton className="h-8 w-64" />
						<Skeleton className="h-32 w-full" />
					</div>
				))}
			</div>
		</div>
	);
}

function getSongTitle(song: PlaylistLyricsItemWithScrape): string {
	return song.songTitleOverride ?? song.scrape?.songTitle ?? "Untitled song";
}

function getArtistName(song: PlaylistLyricsItemWithScrape): string {
	return song.artistNameOverride ?? song.scrape?.artistName ?? "Unknown artist";
}

function getAlbumTitle(song: PlaylistLyricsItemWithScrape): string | undefined {
	return song.albumTitleOverride ?? song.scrape?.albumTitle;
}

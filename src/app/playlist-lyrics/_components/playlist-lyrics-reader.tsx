"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, BookOpen, Columns2, Edit, Printer } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { LyricsRenderer } from "~/components/zine/lyrics-renderer";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { filterVisibleCredits } from "../../../../convex/_utils/geniusCreditVisibility";
import { getPlaylistDisplayTrackNumber } from "../_utils/song-display";

type PlaylistLyricsItemForReader = {
	_id: Id<"playlistLyricsItems">;
	position: number;
	userNote?: string;
	songTitleOverride?: string;
	artistNameOverride?: string;
	albumTitleOverride?: string;
	albumArtUrlOverride?: string;
	hiddenCreditLabels?: string[];
	shownCreditLabels?: string[];
	scrape?: {
		songTitle: string;
		artistName: string;
		albumTitle?: string;
		albumYear?: string;
		albumArtUrl?: string;
		lyrics: string;
		about?: string;
		credits?: PlaylistCredit[];
	};
};
type PlaylistCredit = {
	label: string;
	contributors: Array<{
		name: string;
		url?: string;
	}>;
};
type PlaylistForReader = {
	title: string;
	slug: string;
	theme?: string;
	description?: string;
	notes?: string;
};
type PlaylistLyricsData =
	| {
			playlist: PlaylistForReader;
			songs: PlaylistLyricsItemForReader[];
			siteWideHiddenCreditLabelKeys: string[];
			ignoredCreditLabelKeys: string[];
	  }
	| null
	| undefined;

export function PlaylistLyricsReader({ slug }: { slug: string }) {
	const playlistData = useQuery(api.playlistLyrics.getBySlug, { slug });

	return (
		<PlaylistLyricsReaderContent
			slug={slug}
			playlistData={playlistData}
			variant="private"
		/>
	);
}

export function PublicPlaylistLyricsReader({ slug }: { slug: string }) {
	const playlistData = useQuery(api.playlistLyrics.getPublicBySlug, { slug });

	return (
		<PlaylistLyricsReaderContent
			slug={slug}
			playlistData={playlistData}
			variant="public"
		/>
	);
}

function PlaylistLyricsReaderContent({
	slug,
	playlistData,
	variant,
}: {
	slug: string;
	playlistData: PlaylistLyricsData;
	variant: "private" | "public";
}) {
	const [isCompact, setIsCompact] = useState(false);
	const [showGeniusInfo, setShowGeniusInfo] = useState(false);
	const [showArtist, setShowArtist] = useState(true);
	const [showAlbum, setShowAlbum] = useState(true);
	const [showYear, setShowYear] = useState(true);
	const [showAlbumArt, setShowAlbumArt] = useState(false);
	const [showSectionLabels, setShowSectionLabels] = useState(true);
	const backHref =
		variant === "public" ? "/public/playlist-lyrics" : "/playlist-lyrics";
	const backLabel =
		variant === "public" ? "Back to Playlists" : "Back to Playlist Lyrics";

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
					<Link href={backHref}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						{backLabel}
					</Link>
				</Button>
			</div>
		);
	}

	const { playlist, songs, siteWideHiddenCreditLabelKeys, ignoredCreditLabelKeys } =
		playlistData;

	return (
		<div
			className={`mx-auto max-w-4xl px-4 py-10 print:px-2 print:py-4 ${isCompact ? "print-compact" : ""}`}
		>
			<div className="no-print mb-6 rounded-lg border bg-card p-4 shadow-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Button asChild variant="ghost" className="self-start">
						<Link href={backHref}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							{backLabel}
						</Link>
					</Button>
					<div className="flex flex-wrap gap-2">
						{variant === "private" && (
							<Button asChild variant="outline">
								<Link href={`/playlist-lyrics/${slug}/edit`}>
									<Edit className="mr-2 h-4 w-4" />
									Edit
								</Link>
							</Button>
						)}
						<Button onClick={handlePrint} variant="outline">
							<Printer className="mr-2 h-4 w-4" />
							Print
						</Button>
						<Button asChild variant="outline">
							<Link
								href={
									variant === "public"
										? `/public/playlist-lyrics/${slug}/zine`
										: `/playlist-lyrics/${slug}/zine`
								}
							>
								<BookOpen className="mr-2 h-4 w-4" />
								Zine
							</Link>
						</Button>
						<Button onClick={handleCompactPrint} variant="outline">
							<Columns2 className="mr-2 h-4 w-4" />
							2-Column
						</Button>
					</div>
				</div>

				<div className="mt-4 border-t pt-4">
					<p className="mb-3 font-medium text-sm">Display options</p>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
						<ToggleControl
							id="show-artist"
							checked={showArtist}
							onCheckedChange={setShowArtist}
							label="Show artist"
						/>
						<ToggleControl
							id="show-album"
							checked={showAlbum}
							onCheckedChange={setShowAlbum}
							label="Show album"
						/>
						<ToggleControl
							id="show-year"
							checked={showYear}
							onCheckedChange={setShowYear}
							label="Show year"
						/>
						<ToggleControl
							id="show-album-art"
							checked={showAlbumArt}
							onCheckedChange={setShowAlbumArt}
							label="Show album art"
						/>
						<ToggleControl
							id="genius-info"
							checked={showGeniusInfo}
							onCheckedChange={setShowGeniusInfo}
							label="Show Genius info"
						/>
						<ToggleControl
							id="show-section-labels"
							checked={showSectionLabels}
							onCheckedChange={setShowSectionLabels}
							label="Show song part labels"
						/>
					</div>
				</div>
			</div>

			<header className="mb-8 text-center print:mb-8">
				<h1 className="mb-2 font-bold text-4xl print:text-5xl">
					{playlist.title}
				</h1>
				{playlist.theme && (
					<p className="text-lg text-muted-foreground leading-snug sm:text-xl print:text-base print:leading-tight">
						{playlist.theme}
					</p>
				)}
				{playlist.description && (
					<p className="mx-auto mt-4 max-w-3xl whitespace-pre-line text-muted-foreground print:text-lg">
						{playlist.description}
					</p>
				)}
				{variant === "private" && playlist.notes && (
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
					songs.map((song, index) => {
						const metadataParts = getMetadataParts(song, {
							showAlbum,
							showArtist,
							showYear,
						});
						const albumArtUrl = getAlbumArtUrl(song);
						const visibleCredits = filterVisibleCredits(
							song.scrape?.credits,
							{
								hiddenCreditLabels: song.hiddenCreditLabels,
								shownCreditLabels: song.shownCreditLabels,
								siteWideHiddenLabelKeys: siteWideHiddenCreditLabelKeys,
								ignoredLabelKeys: ignoredCreditLabelKeys,
							},
						);

						return (
							<article
								key={song._id}
								className="page-break-inside-avoid print:mb-16"
							>
								{showAlbumArt && albumArtUrl ? (
									<img
										src={albumArtUrl}
										alt={`${getSongTitle(song)} album art`}
										className="mb-4 h-32 w-32 rounded-md object-cover print:mb-3 print:h-28 print:w-28"
									/>
								) : null}
								<span className="text-muted-foreground text-sm print:text-xs">
									Track {getPlaylistDisplayTrackNumber(index)}
								</span>
								<h2 className="mb-2 font-semibold text-2xl print:text-3xl">
									{getSongTitle(song)}
								</h2>
								{metadataParts.length > 0 && (
									<p className="mb-3 text-muted-foreground text-sm print:mb-2 print:text-xs print:leading-tight">
										{metadataParts.join(" - ")}
									</p>
								)}
								{visibleCredits ? (
									<CreditRows credits={visibleCredits} />
								) : null}

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
										<LyricsRenderer
											lyrics={song.scrape.lyrics}
											showSectionLabels={showSectionLabels}
										/>
									) : (
										<p className="text-muted-foreground">
											Lyrics are not available for this song.
										</p>
									)}
								</div>
							</article>
						);
					})
				)}
			</div>
		</div>
	);
}

function ToggleControl({
	id,
	checked,
	onCheckedChange,
	label,
}: {
	id: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
}) {
	return (
		<div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
			/>
			<Label htmlFor={id} className="cursor-pointer text-sm">
				{label}
			</Label>
		</div>
	);
}

function CreditRows({ credits }: { credits: PlaylistCredit[] }) {
	return (
		<div className="mb-6 rounded-lg border bg-muted/30 p-4 text-sm print:mb-8">
			{credits.map((credit) => (
				<div key={credit.label} className="mb-2 last:mb-0">
					<span className="font-medium">{credit.label}: </span>
					{credit.contributors.map((contributor, index) => (
						<Fragment key={`${credit.label}-${contributor.name}-${index}`}>
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
						</Fragment>
					))}
				</div>
			))}
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

function getSongTitle(song: PlaylistLyricsItemForReader): string {
	return song.songTitleOverride ?? song.scrape?.songTitle ?? "Untitled song";
}

function getArtistName(song: PlaylistLyricsItemForReader): string {
	return song.artistNameOverride ?? song.scrape?.artistName ?? "Unknown artist";
}

function getAlbumTitle(song: PlaylistLyricsItemForReader): string | undefined {
	return song.albumTitleOverride ?? song.scrape?.albumTitle;
}

function getAlbumArtUrl(song: PlaylistLyricsItemForReader): string | undefined {
	return song.albumArtUrlOverride?.trim() || song.scrape?.albumArtUrl?.trim();
}

function getMetadataParts(
	song: PlaylistLyricsItemForReader,
	options: {
		showArtist: boolean;
		showAlbum: boolean;
		showYear: boolean;
	},
): string[] {
	const album = getAlbumMetadata(song);
	const parts: string[] = [];

	if (options.showArtist) {
		parts.push(getArtistName(song));
	}

	if (options.showAlbum && album.title) {
		parts.push(album.title);
	}

	if (options.showYear && album.year) {
		parts.push(album.year);
	}

	return parts;
}

function getAlbumMetadata(song: PlaylistLyricsItemForReader): {
	title: string | undefined;
	year: string | undefined;
} {
	const rawAlbumTitle = getAlbumTitle(song);
	const fallbackAlbum = splitAlbumTitleAndYear(rawAlbumTitle);

	return {
		title: fallbackAlbum.title,
		year: song.scrape?.albumYear ?? fallbackAlbum.year,
	};
}

function splitAlbumTitleAndYear(albumTitle: string | undefined): {
	title: string | undefined;
	year: string | undefined;
} {
	if (!albumTitle) {
		return { title: undefined, year: undefined };
	}

	let year: string | undefined;
	const title = albumTitle
		.replace(/\(([^)]*)\)/g, (_match, parenthetical: string) => {
			const trimmedParenthetical = parenthetical.trim();
			if (!year && /^\d{4}$/.test(trimmedParenthetical)) {
				year = trimmedParenthetical;
			}

			return "";
		})
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		title: title || undefined,
		year,
	};
}

"use client";

import type { FunctionReturnType } from "convex/server";
import {
	ArrowLeft,
	Disc3,
	ExternalLink,
	Instagram,
	ListMusic,
} from "lucide-react";
import Link from "next/link";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type { api } from "../../../../../../convex/_generated/api";
import {
	type EnrichmentSliceKey,
	REQUIRED_ENRICHMENT_SLICES,
} from "../../../../../../convex/_utils/albumEnrichmentSlices";
import { formatRelativeTime } from "../../../_utils/formatters";

type AlbumDetails = NonNullable<
	FunctionReturnType<typeof api.albumEnrichment.getAlbumDetails>
>;
type AlbumDetailsTag = AlbumDetails["coverDescriptors"][number];

const SLICE_LABELS: Record<EnrichmentSliceKey, string> = {
	artistContext: "Artist context",
	whyListen: "Why listen",
	coverDescriptors: "Cover tags",
	occasions: "Occasions",
};

const RYM_LINK_METHOD_LABELS: Record<string, string> = {
	spotify_id: "Matched via Spotify ID",
	title_artist: "Matched via title & artist",
	manual: "Manually linked",
};

export function AlbumDetailsView({ details }: { details: AlbumDetails }) {
	return (
		<div className="mx-auto max-w-3xl space-y-8 pb-16">
			<Button asChild variant="ghost" size="sm" className="-ml-2">
				<Link href="/albums/all">
					<ArrowLeft className="h-4 w-4" />
					Back to albums
				</Link>
			</Button>

			<HeroSection hero={details.hero} />
			<Separator />
			<WhyListenSection whyListen={details.whyListen} />
			<Separator />
			<ArtistContextSection artistContext={details.artistContext} />
			<Separator />
			<CoverAndOccasionsSection
				coverDescriptors={details.coverDescriptors}
				occasions={details.occasions}
			/>
			<Separator />
			<LibraryAndQueueSection library={details.library} />
			<Separator />
			<RymSection rym={details.rym} />
			<Separator />
			<ListensSection listens={details.listens} />
			<Separator />
			<RawIdentityFooter ids={details.ids} />
		</div>
	);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</h2>
	);
}

function EmptyNote({ children }: { children: React.ReactNode }) {
	return <p className="text-muted-foreground text-sm italic">{children}</p>;
}

function TagChips({ tags }: { tags: AlbumDetailsTag[] }) {
	if (tags.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-wrap gap-1.5">
			{tags.map((tag) => (
				<Badge key={tag.key} variant="secondary">
					{tag.label}
				</Badge>
			))}
		</div>
	);
}

function HeroSection({ hero }: { hero: AlbumDetails["hero"] }) {
	const spotifyUrl = `https://open.spotify.com/album/${hero.spotifyAlbumId}`;

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
			<div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
				{hero.coverImageUrl ? (
					<img
						src={hero.coverImageUrl}
						alt={hero.title}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-10 w-10 text-muted-foreground" />
					</div>
				)}
			</div>
			<div className="flex-1 space-y-2">
				<div>
					<h1 className="font-bold text-2xl leading-tight">{hero.title}</h1>
					<p className="text-muted-foreground">
						{hero.artists.join(", ")}
						{hero.releaseYear ? ` · ${hero.releaseYear}` : ""}
					</p>
				</div>
				<div className="flex flex-wrap gap-3 text-sm">
					<a
						href={spotifyUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
					>
						Spotify
						<ExternalLink className="h-3 w-3" />
					</a>
					{hero.rymUrl ? (
						<a
							href={hero.rymUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						>
							RYM
							<ExternalLink className="h-3 w-3" />
						</a>
					) : null}
				</div>
				<div className="flex flex-wrap gap-1.5 pt-1">
					{REQUIRED_ENRICHMENT_SLICES.map((slice) => {
						const isPresent = hero.existingSlices[slice] != null;
						return (
							<Badge
								key={slice}
								variant={isPresent ? "secondary" : "outline"}
								className={
									isPresent
										? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: "border-dashed text-muted-foreground"
								}
							>
								{SLICE_LABELS[slice]}
							</Badge>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function WhyListenSection({
	whyListen,
}: {
	whyListen: AlbumDetails["whyListen"];
}) {
	return (
		<div className="space-y-2">
			<SectionHeading>Why listen</SectionHeading>
			{whyListen.whyListenPitch ? (
				<p className="text-base leading-relaxed">{whyListen.whyListenPitch}</p>
			) : (
				<EmptyNote>Not enriched yet.</EmptyNote>
			)}
		</div>
	);
}

function ArtistContextSection({
	artistContext,
}: {
	artistContext: AlbumDetails["artistContext"];
}) {
	const hasAnyContent =
		artistContext.artistWriteup ||
		artistContext.origin ||
		artistContext.activeSince ||
		artistContext.instagramUrl ||
		(artistContext.listenIfYouLike?.length ?? 0) > 0;

	return (
		<div className="space-y-3">
			<SectionHeading>Artist context</SectionHeading>
			{!hasAnyContent ? (
				<EmptyNote>Not enriched yet.</EmptyNote>
			) : (
				<div className="space-y-3">
					{artistContext.artistWriteup ? (
						<p className="text-sm leading-relaxed">
							{artistContext.artistWriteup}
						</p>
					) : null}
					<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
						{artistContext.origin ? (
							<span className="text-muted-foreground">
								Origin:{" "}
								<span className="text-foreground">{artistContext.origin}</span>
							</span>
						) : null}
						{artistContext.activeSince ? (
							<span className="text-muted-foreground">
								Active since:{" "}
								<span className="text-foreground">
									{artistContext.activeSince}
								</span>
							</span>
						) : null}
						{artistContext.instagramUrl ? (
							<a
								href={artistContext.instagramUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							>
								<Instagram className="h-3.5 w-3.5" />
								Instagram
							</a>
						) : null}
					</div>
					{artistContext.listenIfYouLike &&
					artistContext.listenIfYouLike.length > 0 ? (
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">
								Listen if you like
							</p>
							<div className="flex flex-wrap gap-1.5">
								{artistContext.listenIfYouLike.map((artist) => (
									<Badge key={artist} variant="outline">
										{artist}
									</Badge>
								))}
							</div>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}

function CoverAndOccasionsSection({
	coverDescriptors,
	occasions,
}: {
	coverDescriptors: AlbumDetailsTag[];
	occasions: AlbumDetailsTag[];
}) {
	const isEmpty = coverDescriptors.length === 0 && occasions.length === 0;

	return (
		<div className="space-y-3">
			<SectionHeading>Cover &amp; occasions</SectionHeading>
			{isEmpty ? (
				<EmptyNote>Not enriched yet.</EmptyNote>
			) : (
				<div className="space-y-2">
					{coverDescriptors.length > 0 ? (
						<TagChips tags={coverDescriptors} />
					) : null}
					{occasions.length > 0 ? <TagChips tags={occasions} /> : null}
				</div>
			)}
		</div>
	);
}

function LibraryAndQueueSection({
	library,
}: {
	library: AlbumDetails["library"];
}) {
	const forLater = library.forLater;

	return (
		<div className="space-y-3">
			<SectionHeading>Library &amp; queue</SectionHeading>
			<div className="flex flex-wrap gap-1.5 text-sm">
				<Badge variant={library.inLibrary ? "secondary" : "outline"}>
					{library.inLibrary ? "In library" : "Not in library"}
				</Badge>
				{forLater.inForLater ? (
					<Badge
						variant="secondary"
						className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
					>
						{forLater.isActive ? "Queued for later" : "Removed from queue"}
					</Badge>
				) : null}
				{forLater.markedAsSingle ? (
					<Badge variant="outline">Marked as single</Badge>
				) : null}
			</div>
			{forLater.inForLater ? (
				<div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground text-sm">
					{forLater.firstSeenAt ? (
						<span>First seen {formatRelativeTime(forLater.firstSeenAt)}</span>
					) : null}
					{forLater.lastSeenAt ? (
						<span>Last seen {formatRelativeTime(forLater.lastSeenAt)}</span>
					) : null}
					{forLater.playlistAddedAt ? (
						<span>
							Added to playlist {formatRelativeTime(forLater.playlistAddedAt)}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function RymSection({ rym }: { rym: AlbumDetails["rym"] }) {
	const hasTaxonomy =
		rym.primaryGenres.length > 0 ||
		rym.secondaryGenres.length > 0 ||
		rym.descriptors.length > 0;

	return (
		<div className="space-y-3">
			<SectionHeading>RYM / scrape</SectionHeading>
			{rym.status === "unlinked" ? (
				<EmptyNote>
					{rym.rymNotOnSite
						? "Marked as not on RateYourMusic."
						: "Not linked to RateYourMusic yet."}
				</EmptyNote>
			) : (
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-3 text-sm">
						{rym.rymUrl ? (
							<a
								href={rym.rymUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							>
								RYM page
								<ExternalLink className="h-3 w-3" />
							</a>
						) : null}
						{rym.rymLinkMethod ? (
							<span className="text-muted-foreground">
								{RYM_LINK_METHOD_LABELS[rym.rymLinkMethod] ?? rym.rymLinkMethod}
							</span>
						) : null}
					</div>
					{hasTaxonomy ? (
						<div className="space-y-1.5">
							<TagChips tags={rym.primaryGenres} />
							<TagChips tags={rym.secondaryGenres} />
							<TagChips tags={rym.descriptors} />
						</div>
					) : (
						<EmptyNote>No genre or descriptor data from RYM yet.</EmptyNote>
					)}
				</div>
			)}
		</div>
	);
}

function ListensSection({ listens }: { listens: AlbumDetails["listens"] }) {
	return (
		<div className="space-y-3">
			<SectionHeading>Listening / ratings</SectionHeading>
			{!listens.hasListened ? (
				<EmptyNote>No listens recorded yet.</EmptyNote>
			) : (
				<div className="flex flex-wrap items-center gap-3 text-sm">
					<span className="inline-flex items-center gap-1.5 text-muted-foreground">
						<ListMusic className="h-3.5 w-3.5" />
						{listens.listenCount} listen{listens.listenCount === 1 ? "" : "s"}
					</span>
					{listens.rating !== undefined ? (
						<AlbumRatingBadge rating={listens.rating} />
					) : null}
					{listens.firstListenedAt ? (
						<span className="text-muted-foreground">
							First: {formatRelativeTime(listens.firstListenedAt)}
						</span>
					) : null}
					{listens.lastListenedAt ? (
						<span className="text-muted-foreground">
							Last: {formatRelativeTime(listens.lastListenedAt)}
						</span>
					) : null}
				</div>
			)}
		</div>
	);
}

function RawIdentityFooter({ ids }: { ids: AlbumDetails["ids"] }) {
	return (
		<div className="space-y-1.5 text-muted-foreground text-xs">
			<p className="font-mono">Album: {ids.albumId}</p>
			<p className="font-mono">Spotify: {ids.spotifyAlbumId}</p>
			{ids.enrichmentId ? (
				<p className="font-mono">Enrichment: {ids.enrichmentId}</p>
			) : null}
			{ids.forLaterItemId ? (
				<p className="font-mono">For-later item: {ids.forLaterItemId}</p>
			) : null}
			{ids.libraryItemId ? (
				<p className="font-mono">Library item: {ids.libraryItemId}</p>
			) : null}
		</div>
	);
}

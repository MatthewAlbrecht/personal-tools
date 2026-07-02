"use client";

import { useMutation } from "convex/react";
import { Copy, Disc3, Download, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	type AlbumLibraryAlbumType,
	type AlbumLibraryListenStatus,
	type AlbumLibraryRobRankingStatus,
	type AlbumLibraryRymStatus,
	rowMatchesAlbumLibraryFilters,
} from "../../../../convex/_utils/albumLibraryRows";
import { formatRelativeTime } from "../_utils/formatters";
import type { AlbumLibraryRowData } from "../_utils/types";
import { AlbumRymAssociateDrawer } from "./album-rym-associate-drawer";

type AllAlbumsViewProps = {
	albums: AlbumLibraryRowData[];
	isLoading: boolean;
	onAddListen: (album: AlbumLibraryRowData) => void;
};

export function AllAlbumsView({
	albums,
	isLoading,
	onAddListen,
}: AllAlbumsViewProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [rymFilter, setRymFilter] = useState<AlbumLibraryRymStatus>("all");
	const [robRankingFilter, setRobRankingFilter] =
		useState<AlbumLibraryRobRankingStatus>("all");
	const [listenFilter, setListenFilter] =
		useState<AlbumLibraryListenStatus>("all");
	const [albumTypeFilter, setAlbumTypeFilter] =
		useState<AlbumLibraryAlbumType>("album");
	const [yearFilter, setYearFilter] = useState<string>("all");
	const [rymAssociateAlbum, setRymAssociateAlbum] =
		useState<AlbumLibraryRowData | null>(null);
	const setRymNotOnSite = useMutation(api.spotify.setSpotifyAlbumRymNotOnSite);
	const associateRymScrape = useMutation(
		api.spotify.associateSpotifyAlbumWithRymScrape,
	);

	// Extract available years from albums
	const availableYears = useMemo(() => {
		const years = new Set<number>();
		for (const album of albums) {
			if (album.releaseYear) years.add(album.releaseYear);
		}
		return Array.from(years).sort((a, b) => b - a);
	}, [albums]);

	const filteredAlbums = useMemo(() => {
		const selectedYear =
			yearFilter === "all" ? undefined : Number.parseInt(yearFilter, 10);

		return albums.filter((album) =>
			rowMatchesAlbumLibraryFilters(album, {
				search: searchQuery,
				rymStatus: rymFilter,
				robRankingStatus: robRankingFilter,
				listenStatus: listenFilter,
				albumType: albumTypeFilter,
				releaseYear: selectedYear,
			}),
		);
	}, [
		albums,
		yearFilter,
		rymFilter,
		robRankingFilter,
		listenFilter,
		albumTypeFilter,
		searchQuery,
	]);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading albums...</p>
			</div>
		);
	}

	if (albums.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">No albums found</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Albums will appear here after syncing your Spotify history
					</p>
				</div>
			</div>
		);
	}

	async function handleSetRymNotOnSite(
		album: AlbumLibraryRowData,
		notOnSite: boolean,
	): Promise<void> {
		try {
			await setRymNotOnSite({
				albumId: album._id as Id<"spotifyAlbums">,
				notOnSite,
			});
			toast.success(
				notOnSite ? "Marked as not on RYM" : "Cleared not-on-RYM mark",
			);
		} catch (error) {
			console.error("Failed to update RYM availability:", error);
			toast.error("Could not update RYM availability");
		}
	}

	async function handleAssociateRymScrape(
		scrapeId: Id<"rateYourMusicScrapes">,
	): Promise<void> {
		if (!rymAssociateAlbum) return;

		const albumName = rymAssociateAlbum.name;
		try {
			await associateRymScrape({
				albumId: rymAssociateAlbum._id as Id<"spotifyAlbums">,
				scrapeId,
			});
			setRymAssociateAlbum(null);
			toast.success(`Linked RYM page for "${albumName}"`);
		} catch (error) {
			console.error("Failed to associate RYM scrape:", error);
			toast.error("Could not link RYM scrape");
		}
	}

	return (
		<div className="space-y-4">
			{/* Filters */}
			<div className="space-y-3">
				{/* Search Input */}
				<div>
					<input
						type="text"
						placeholder="Search albums by name or artist..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>

				{/* Filter Controls */}
				<div className="flex flex-wrap items-center gap-4">
					{/* Release Year Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="year-filter" className="font-medium text-sm">
							Year:
						</label>
						<select
							id="year-filter"
							value={yearFilter}
							onChange={(e) => setYearFilter(e.target.value)}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Years</option>
							{availableYears.map((year) => (
								<option key={year} value={year.toString()}>
									{year}
								</option>
							))}
						</select>
					</div>

					{/* Album Type Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="album-type-filter" className="font-medium text-sm">
							Type:
						</label>
						<select
							id="album-type-filter"
							value={albumTypeFilter}
							onChange={(e) =>
								setAlbumTypeFilter(e.target.value as AlbumLibraryAlbumType)
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Types</option>
							<option value="album">Albums</option>
							<option value="single">Singles</option>
						</select>
					</div>

					{/* Listen Status Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="listen-filter" className="font-medium text-sm">
							Listens:
						</label>
						<select
							id="listen-filter"
							value={listenFilter}
							onChange={(e) =>
								setListenFilter(e.target.value as AlbumLibraryListenStatus)
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All Albums</option>
							<option value="listened">Listened</option>
							<option value="unlistened">Unlistened</option>
						</select>
					</div>

					{/* RYM Status Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="rym-filter" className="font-medium text-sm">
							RYM:
						</label>
						<select
							id="rym-filter"
							value={rymFilter}
							onChange={(e) =>
								setRymFilter(e.target.value as AlbumLibraryRymStatus)
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All</option>
							<option value="linked">Linked</option>
							<option value="unlinked">Unlinked</option>
						</select>
					</div>

					{/* Rob Ranking Filter */}
					<div className="flex items-center gap-2">
						<label htmlFor="rob-ranking-filter" className="font-medium text-sm">
							Rob:
						</label>
						<select
							id="rob-ranking-filter"
							value={robRankingFilter}
							onChange={(e) =>
								setRobRankingFilter(
									e.target.value as AlbumLibraryRobRankingStatus,
								)
							}
							className="rounded-md border bg-background px-2 py-1 text-sm"
						>
							<option value="all">All</option>
							<option value="appears">Appears</option>
							<option value="not_appears">Does not appear</option>
						</select>
					</div>

					<p className="text-muted-foreground text-sm">
						Showing {filteredAlbums.length} of {albums.length}
					</p>
				</div>
			</div>

			{/* Albums List */}
			<div className="space-y-1">
				{filteredAlbums.length === 0 ? (
					<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
						<p className="text-muted-foreground text-sm">
							No albums match the selected filters
						</p>
					</div>
				) : (
					filteredAlbums.map((album) => (
						<AlbumCardRow
							key={album._id}
							album={album}
							onAddListen={() => onAddListen(album)}
							onLinkRym={() => setRymAssociateAlbum(album)}
							onSetRymNotOnSite={(notOnSite) =>
								handleSetRymNotOnSite(album, notOnSite)
							}
						/>
					))
				)}
			</div>
			<AlbumRymAssociateDrawer
				album={rymAssociateAlbum}
				open={rymAssociateAlbum !== null}
				onOpenChange={(open) => {
					if (!open) setRymAssociateAlbum(null);
				}}
				onAssociate={handleAssociateRymScrape}
			/>
		</div>
	);
}

function AlbumCardRow({
	album,
	onAddListen,
	onLinkRym,
	onSetRymNotOnSite,
}: {
	album: AlbumLibraryRowData;
	onAddListen: () => void;
	onLinkRym: () => void;
	onSetRymNotOnSite: (notOnSite: boolean) => Promise<void>;
}) {
	const artworkUrl = album.imageUrl;

	return (
		<div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
			{/* Album Cover */}
			<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
				{artworkUrl ? (
					<img
						src={artworkUrl}
						alt={album.name}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Disc3 className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
			</div>

			{/* Album Info */}
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm">{album.name}</p>
				<p className="truncate text-muted-foreground text-xs">
					{album.artistName}
					{album.releaseYear && (
						<span className="text-muted-foreground/60">
							{" · "}
							{album.releaseYear}
						</span>
					)}
				</p>
				<div className="mt-1 flex flex-wrap gap-1">
					<RymStatusBadge album={album} />
					<RobRankingBadge years={album.robRankingYears} />
				</div>
				<TaxonomyLines album={album} />
			</div>

			{/* Listen Info */}
			<div className="flex flex-shrink-0 items-center gap-2">
				{album.lastListenedAt && (
					<span className="flex-shrink-0 text-muted-foreground text-xs">
						{formatRelativeTime(album.lastListenedAt)}
					</span>
				)}

				{album.rating !== undefined && (
					<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
						★ {album.rating}
					</span>
				)}

				{album.listenCount > 0 && (
					<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
						{album.listenCount}×
					</span>
				)}

				{artworkUrl ? (
					<>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								void copyArtworkUrl(artworkUrl);
							}}
							className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/50 transition-all hover:border-muted-foreground/40 hover:text-muted-foreground"
							title="Copy artwork URL"
							aria-label="Copy artwork URL"
						>
							<Copy className="h-3 w-3" />
							Copy art
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								void downloadArtwork(artworkUrl, album);
							}}
							className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/50 transition-all hover:border-muted-foreground/40 hover:text-muted-foreground"
							title="Download artwork"
							aria-label="Download artwork"
						>
							<Download className="h-3 w-3" />
							Download
						</button>
					</>
				) : null}

				{/* Add Listen Button */}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onAddListen();
					}}
					className="inline-flex items-center rounded-full border border-muted-foreground/20 border-dashed px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
					title="Add album listen"
				>
					+ Listen
				</button>
				<AlbumRymActionsMenu
					album={album}
					onLinkRym={onLinkRym}
					onSetRymNotOnSite={onSetRymNotOnSite}
				/>
			</div>
		</div>
	);
}

function RymStatusBadge({ album }: { album: AlbumLibraryRowData }) {
	if (album.rymNotOnSite) {
		return (
			<span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
				Not on RYM
			</span>
		);
	}

	if (album.rymStatus === "linked") {
		return (
			<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs dark:text-emerald-300">
				RYM linked
			</span>
		);
	}

	return (
		<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs dark:text-amber-300">
			Needs RYM
		</span>
	);
}

function AlbumRymActionsMenu({
	album,
	onLinkRym,
	onSetRymNotOnSite,
}: {
	album: AlbumLibraryRowData;
	onLinkRym: () => void;
	onSetRymNotOnSite: (notOnSite: boolean) => Promise<void>;
}) {
	const isLinked = album.rymStatus === "linked";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 p-0"
					aria-label="Open album actions"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel>RYM Actions</DropdownMenuLabel>
				{!isLinked && !album.rymNotOnSite ? (
					<DropdownMenuItem onSelect={onLinkRym}>
						Link RYM scrape
					</DropdownMenuItem>
				) : null}
				{album.rymNotOnSite ? (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(false)}>
						Clear not-on-RYM mark
					</DropdownMenuItem>
				) : !isLinked ? (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(true)}>
						Mark as Not on RYM
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem disabled>RYM already linked</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RobRankingBadge({ years }: { years: number[] }) {
	if (years.length === 0) return null;
	return (
		<span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
			Rob&apos;s Top 50 {years.slice(0, 3).join(", ")}
			{years.length > 3 ? ` +${years.length - 3}` : ""}
		</span>
	);
}

function TaxonomyLines({ album }: { album: AlbumLibraryRowData }) {
	if (
		album.primaryGenres.length === 0 &&
		album.secondaryGenres.length === 0 &&
		album.descriptors.length === 0
	) {
		return null;
	}

	return (
		<div className="mt-1 space-y-0.5">
			<TaxonomyLine tags={album.primaryGenres} className="text-sm" />
			<TaxonomyLine
				tags={album.secondaryGenres}
				className="text-muted-foreground text-xs"
			/>
			<TaxonomyLine
				tags={album.descriptors}
				className="text-muted-foreground text-xs"
			/>
		</div>
	);
}

function TaxonomyLine({
	tags,
	className,
}: {
	tags: Array<{ key: string; label: string }>;
	className: string;
}) {
	if (tags.length === 0) return null;

	return <p className={className}>{tags.map((tag) => tag.label).join(", ")}</p>;
}

async function copyArtworkUrl(url: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(url);
		toast.success("Artwork URL copied");
	} catch {
		toast.error("Could not copy artwork URL");
	}
}

async function downloadArtwork(
	url: string,
	album: AlbumLibraryRowData,
): Promise<void> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error("Could not fetch artwork");
		}

		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = objectUrl;
		link.download = getArtworkFilename(album, blob.type);
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);
		toast.success("Artwork download started");
	} catch {
		toast.error("Could not download artwork");
	}
}

function getArtworkFilename(
	album: AlbumLibraryRowData,
	contentType: string,
): string {
	const extension = getImageExtension(contentType);
	const name = `${album.artistName}-${album.name}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return `${name || "album-artwork"}.${extension}`;
}

function getImageExtension(contentType: string): string {
	if (contentType.includes("png")) return "png";
	if (contentType.includes("webp")) return "webp";
	return "jpg";
}

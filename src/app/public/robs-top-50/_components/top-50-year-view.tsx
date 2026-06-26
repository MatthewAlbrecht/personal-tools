"use client";

import { Disc3 } from "lucide-react";
import Image from "next/image";
import { Skeleton } from "~/components/ui/skeleton";

type AlbumEntry = {
	position: number;
	album: {
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	} | null;
};

function isSpotifyImageUrl(imageUrl: string): boolean {
	try {
		return new URL(imageUrl).hostname === "i.scdn.co";
	} catch {
		return false;
	}
}

function AlbumCoverImage({
	imageUrl,
	name,
	size,
	priority = false,
}: {
	imageUrl?: string;
	name: string;
	size: "hero" | "row";
	priority?: boolean;
}) {
	if (!imageUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Disc3
					className={
						size === "hero"
							? "h-8 w-8 text-muted-foreground"
							: "h-4 w-4 text-muted-foreground"
					}
				/>
			</div>
		);
	}

	if (!isSpotifyImageUrl(imageUrl)) {
		return (
			// biome-ignore lint/performance/noImgElement: manual entries may use any host
			<img src={imageUrl} alt={name} className="h-full w-full object-cover" />
		);
	}

	return (
		<Image
			src={imageUrl}
			alt={name}
			fill
			className="object-cover"
			sizes={size === "hero" ? "96px" : "40px"}
			priority={priority}
		/>
	);
}

export function Top50YearView({ albums }: { albums: AlbumEntry[] }) {
	const topAlbum = albums.find((a) => a.position === 1);

	return (
		<div className="space-y-6">
			{topAlbum?.album && (
				<div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
					<div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
						<AlbumCoverImage
							imageUrl={topAlbum.album.imageUrl}
							name={topAlbum.album.name}
							size="hero"
							priority
						/>
					</div>
					<div>
						<p className="font-bold text-3xl text-primary">#1</p>
						<p className="font-semibold text-lg">{topAlbum.album.name}</p>
						<p className="text-muted-foreground">{topAlbum.album.artistName}</p>
					</div>
				</div>
			)}

			<ol className="space-y-1">
				{albums.map((entry) => (
					<li
						key={entry.position}
						className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
					>
						<span className="w-8 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
							{entry.position}
						</span>
						<div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
							<AlbumCoverImage
								imageUrl={entry.album?.imageUrl}
								name={entry.album?.name ?? "Unknown album"}
								size="row"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">
								{entry.album?.name ?? "Unknown album"}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{entry.album?.artistName ?? "Unknown artist"}
							</p>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}

export function Top50YearViewSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4 rounded-lg border p-4">
				<Skeleton className="h-24 w-24 rounded-md" />
				<div className="space-y-2">
					<Skeleton className="h-8 w-12" />
					<Skeleton className="h-5 w-48" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
			<div className="space-y-2">
				{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((key) => (
					<div key={key} className="flex items-center gap-3 px-2 py-2">
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-10 w-10 rounded" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-3 w-32" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

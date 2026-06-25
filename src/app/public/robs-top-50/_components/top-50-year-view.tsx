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

export function Top50YearView({ albums }: { albums: AlbumEntry[] }) {
	const topAlbum = albums.find((a) => a.position === 1);

	return (
		<div className="space-y-6">
			{topAlbum?.album && (
				<div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
					<div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
						{topAlbum.album.imageUrl ? (
							<Image
								src={topAlbum.album.imageUrl}
								alt={topAlbum.album.name}
								fill
								className="object-cover"
								sizes="96px"
								priority
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<Disc3 className="h-8 w-8 text-muted-foreground" />
							</div>
						)}
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
							{entry.album?.imageUrl ? (
								<Image
									src={entry.album.imageUrl}
									alt={entry.album.name}
									fill
									className="object-cover"
									sizes="40px"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<Disc3 className="h-4 w-4 text-muted-foreground" />
								</div>
							)}
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

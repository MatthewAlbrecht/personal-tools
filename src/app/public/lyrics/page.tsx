"use client";

import { useQuery } from "convex/react";
import { Music } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";

type GeniusAlbum = Doc<"geniusAlbums">;

function AlbumListSkeleton() {
	return (
		<li>
			<div className="flex items-center gap-3">
				<Skeleton className="h-4 w-full max-w-md" />
			</div>
		</li>
	);
}

export default function PublicLyricsIndexPage() {
	const recentAlbums = useQuery(api.geniusAlbums.listRecent, { limit: 100 });
	const albumsLoading = recentAlbums === undefined;

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<Music className="h-6 w-6" />
						Album Lyrics
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div>
						<h2 className="mb-4 font-semibold text-lg">Available Albums</h2>
						{albumsLoading ? (
							<ul className="space-y-3">
								{["skeleton-1", "skeleton-2", "skeleton-3"].map((key) => (
									<AlbumListSkeleton key={key} />
								))}
							</ul>
						) : recentAlbums && recentAlbums.length > 0 ? (
							<ul className="space-y-2">
								{recentAlbums.map((album: GeniusAlbum) => (
									<li key={album._id}>
										<Button
											asChild
											variant="ghost"
											className="h-auto w-full justify-start px-3 py-3 text-left"
										>
											<Link href={`/public/lyrics/${album.albumSlug}`}>
												<div className="flex flex-col gap-1">
													<div className="font-medium">
														{album.artistName} — {album.albumTitle}
													</div>
													<div className="text-muted-foreground text-xs">
														{album.totalSongs} songs
													</div>
												</div>
											</Link>
										</Button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-muted-foreground text-sm">
								No albums available yet.
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</main>
	);
}

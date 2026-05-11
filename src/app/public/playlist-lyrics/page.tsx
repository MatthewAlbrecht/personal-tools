"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";

export default function PublicPlaylistLyricsIndexPage() {
	const playlists = useQuery(api.playlistLyrics.listPublic, { limit: 100 });
	const playlistsLoading = playlists === undefined;

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<ListMusic className="h-6 w-6" />
						Playlist Lyrics
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div>
						<h2 className="mb-4 font-semibold text-lg">Available Playlists</h2>
						{playlistsLoading ? (
							<ul className="space-y-3">
								{["skeleton-1", "skeleton-2", "skeleton-3"].map((key) => (
									<PlaylistListSkeleton key={key} />
								))}
							</ul>
						) : playlists && playlists.length > 0 ? (
							<ul className="space-y-2">
								{playlists.map((playlist) => (
									<li key={playlist.slug}>
										<Button
											asChild
											variant="ghost"
											className="h-auto w-full justify-start px-3 py-3 text-left"
										>
											<Link href={`/public/playlist-lyrics/${playlist.slug}`}>
												<div className="flex flex-col gap-1">
													<div className="font-medium">{playlist.title}</div>
													{playlist.description && (
														<div className="line-clamp-2 text-muted-foreground text-xs">
															{playlist.description}
														</div>
													)}
												</div>
											</Link>
										</Button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-muted-foreground text-sm">
								No playlists available yet.
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</main>
	);
}

function PlaylistListSkeleton() {
	return (
		<li>
			<div className="flex items-center gap-3">
				<Skeleton className="h-4 w-full max-w-md" />
			</div>
		</li>
	);
}

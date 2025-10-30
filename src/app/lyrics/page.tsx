"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Music, Trash2 } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";

type GeniusAlbum = Doc<"geniusAlbums">;

function AlbumListSkeleton() {
  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
    </li>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function LyricsSearchPage() {
  const router = useRouter();
  const [geniusUrl, setGeniusUrl] = useState("https://genius.com/Joey-valence-and-brae-hyperyouth-lyrics");
  const [isFetching, setIsFetching] = useState(false);

  // Convex hooks
  const recentAlbums = useQuery(api.geniusAlbums.listRecent, { limit: 50 });
  const createAlbumMutation = useMutation(api.geniusAlbums.createAlbum);
  const createSongMutation = useMutation(api.geniusAlbums.createSong);
  const deleteAlbumMutation = useMutation(api.geniusAlbums.deleteAlbum);

  const albumsLoading = recentAlbums === undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!geniusUrl.trim()) {
      toast.error("Please enter a Genius URL");
      return;
    }

    if (!geniusUrl.includes("genius.com")) {
      toast.error("Please enter a valid Genius.com URL");
      return;
    }

    setIsFetching(true);

    try {
      // Call Next.js API route to scrape
      const response = await fetch('/api/scrape-genius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geniusSongUrl: geniusUrl.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch album data');
      }

      const albumData = await response.json();

      // Generate slug
      const albumSlug = slugify(`${albumData.artistName} ${albumData.albumTitle}`);

      // Store in Convex
      const albumId = await createAlbumMutation({
        albumTitle: albumData.albumTitle,
        artistName: albumData.artistName,
        albumSlug,
        geniusAlbumUrl: albumData.geniusAlbumUrl,
        totalSongs: albumData.songs.length,
      });

      // Store each song
      for (const song of albumData.songs) {
        await createSongMutation({
          albumId,
          songTitle: song.songTitle,
          geniusSongUrl: song.geniusSongUrl,
          trackNumber: song.trackNumber,
          lyrics: song.lyrics,
          about: song.about,
        });
      }

      toast.success(`Successfully fetched ${albumData.songs.length} songs!`);
      router.push(`/lyrics/${albumSlug}`);
    } catch (error) {
      console.error("Error fetching album:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to fetch album. Please try again."
      );
    } finally {
      setIsFetching(false);
    }
  }

  async function handleDelete(albumId: string) {
    try {
      await deleteAlbumMutation({ id: albumId as any });
      toast.success("Album deleted successfully");
    } catch (error) {
      console.error("Error deleting album:", error);
      toast.error("Failed to delete album");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Music className="h-6 w-6" />
            Album Lyrics Aggregator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="geniusUrl">Genius Song URL</Label>
              <Input
                id="geniusUrl"
                type="url"
                value={geniusUrl}
                onChange={(e) => setGeniusUrl(e.target.value)}
                placeholder="Paste Genius URL here..."
                disabled={isFetching}
              />
            </div>

            <Button type="submit" variant="outline" disabled={isFetching}>
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching Album...
                </>
              ) : (
                "Fetch Album Lyrics"
              )}
            </Button>
          </form>

          <Separator className="my-6" />

          <div>
            <h2 className="mb-4 font-semibold text-lg">Recent Albums</h2>
            {albumsLoading ? (
              <ul className="space-y-3">
                {["skeleton-1", "skeleton-2", "skeleton-3"].map((key) => (
                  <AlbumListSkeleton key={key} />
                ))}
              </ul>
            ) : recentAlbums && recentAlbums.length > 0 ? (
              <ul className="space-y-3">
                {recentAlbums.map((album: GeniusAlbum) => (
                  <li key={album._id}>
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        variant="ghost"
                        className="h-auto flex-1 justify-start px-0 py-2 text-left"
                        onClick={() => router.push(`/lyrics/${album.albumSlug}`)}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="font-medium">
                            {album.artistName} — {album.albumTitle}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {album.totalSongs} songs
                          </div>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(album._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No albums yet. Fetch your first album above!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}


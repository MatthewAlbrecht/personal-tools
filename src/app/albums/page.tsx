'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { ArrowDown, ArrowUp, Check, Disc3, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '~/components/ui/kbd';

import { SpotifyConnection } from '../spotify-playlister/_components/spotify-connection';
import { SyncAlbumsButton } from '~/components/sync-albums-button';
import { LoginPrompt } from '~/components/login-prompt';
import { useSpotifyAuth } from '~/lib/hooks/use-spotify-auth';
import { useSyncHistory } from '~/lib/hooks/use-sync-history';
import { useDebouncedCallback } from '~/lib/hooks/use-debounced-callback';
import { AlbumCard } from './_components/album-card';
import { AlbumRanker } from './_components/album-ranker';
import { AddListenDrawer } from './_components/add-listen-view';
import {
  TIER_ORDER,
  getRatingsForTier,
  groupByMonth,
  extractReleaseYear,
  getTierShortLabel,
  type TierName,
} from '~/lib/album-tiers';

type TabValue = 'history' | 'rankings' | 'tracks';

type AlbumToRate = {
  userAlbumId: string;
  albumId: string;
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
};

export default function AlbumsPage() {
  const { userId, isLoading, connection, isConnected, getValidAccessToken } = useSpotifyAuth();
  const [activeTab, setActiveTab] = useState<TabValue>('history');
  const [yearFilter, setYearFilter] = useState<string>(() => {
    // Default to current year
    return new Date().getFullYear().toString();
  });
  const [albumToRate, setAlbumToRate] = useState<AlbumToRate | null>(null);
  const [trackToAddListen, setTrackToAddListen] = useState<TrackItem | null>(null);
  const [isAddingListen, setIsAddingListen] = useState(false);

  const { isSyncing, syncHistory } = useSyncHistory({
    userId,
    isConnected,
    getValidAccessToken,
  });

  // Mutations
  const updateAlbumRating = useMutation(api.spotify.updateAlbumRating);
  const addManualAlbumListen = useMutation(api.spotify.addManualAlbumListen);
  const upsertAlbum = useMutation(api.spotify.upsertAlbum);
  const deleteAlbumListen = useMutation(api.spotify.deleteAlbumListen);

  // Fetch album listens (last 500)
  const albumListens = useQuery(
    api.spotify.getUserAlbumListens,
    userId ? { userId, limit: 500 } : 'skip'
  );

  // Fetch all user albums (for checking if rated)
  const userAlbums = useQuery(
    api.spotify.getUserAlbums,
    userId ? { userId } : 'skip'
  );

  // Fetch rated albums for the selected year (for the ranker)
  const currentYear = yearFilter === 'all' ? new Date().getFullYear() : Number.parseInt(yearFilter, 10);
  const ratedAlbumsForYear = useQuery(
    api.spotify.getRatedAlbumsForYear,
    userId ? { userId, year: currentYear } : 'skip'
  );

  // Fetch recently played tracks (for tracks history tab)
  const recentTracks = useQuery(
    api.spotify.getRecentlyPlayedTracks,
    userId ? { userId, limit: 200 } : 'skip'
  );

  // Build a map of albumId -> rating for quick lookup
  const albumRatings = useMemo(() => {
    if (!userAlbums) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const ua of userAlbums) {
      if (ua.rating !== undefined) {
        map.set(ua.albumId, ua.rating);
      }
    }
    return map;
  }, [userAlbums]);

  // Build a map from spotifyAlbums._id to userAlbums record
  type UserAlbumRecord = NonNullable<typeof userAlbums>[number];
  const userAlbumsMap = useMemo(() => {
    if (!userAlbums) return new Map<string, UserAlbumRecord>();
    return new Map(userAlbums.map((ua) => [ua.albumId, ua]));
  }, [userAlbums]);

  // Compute listen ordinals (which listen # this was for each album)
  // and group by month for history view
  const { listensByMonth, listenOrdinals } = useMemo(() => {
    if (!albumListens) return { listensByMonth: new Map(), listenOrdinals: new Map<string, number>() };

    // First, compute ordinals by processing listens oldest-first
    // (albumListens is ordered newest-first, so we reverse)
    const ordinals = new Map<string, number>(); // listenId -> ordinal
    const albumCounts = new Map<string, number>(); // albumId -> count so far

    const sortedOldestFirst = [...albumListens].reverse();
    for (const listen of sortedOldestFirst) {
      const albumId = listen.albumId;
      const currentCount = (albumCounts.get(albumId) ?? 0) + 1;
      albumCounts.set(albumId, currentCount);
      ordinals.set(listen._id, currentCount);
    }

    return {
      listensByMonth: groupByMonth(albumListens),
      listenOrdinals: ordinals,
    };
  }, [albumListens]);

  // Filter and group albums by tier for rankings view
  const { albumsByTier, availableYears } = useMemo(() => {
    if (!userAlbums) return { albumsByTier: new Map(), availableYears: [] as number[] };

    // Get all unique years
    const years = new Set<number>();
    for (const ua of userAlbums) {
      const year = extractReleaseYear(ua.album?.releaseDate);
      if (year) years.add(year);
    }
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    // Filter by year if set
    const filtered = userAlbums.filter((ua) => {
      if (!ua.rating) return false; // Only show rated albums
      if (yearFilter === 'all') return true;
      const year = extractReleaseYear(ua.album?.releaseDate);
      return year?.toString() === yearFilter;
    });

    // Group by tier
    const byTier = new Map<TierName, { high: typeof filtered; low: typeof filtered }>();
    for (const tier of TIER_ORDER) {
      const ratings = getRatingsForTier(tier);
      byTier.set(tier, {
        high: filtered.filter((ua) => ua.rating === ratings.high),
        low: filtered.filter((ua) => ua.rating === ratings.low),
      });
    }

    return { albumsByTier: byTier, availableYears: sortedYears };
  }, [userAlbums, yearFilter]);

  // Handle disconnect - redirect to playlister for full disconnect functionality
  function handleDisconnect() {
    window.location.href = '/spotify-playlister';
  }

  // Handle rate album - open the ranker
  function handleRateAlbum(listen: {
    albumId: string;
    album: { name: string; artistName: string; imageUrl?: string; releaseDate?: string } | null;
  }) {
    const userAlbum = userAlbumsMap.get(listen.albumId);
    if (!userAlbum || !listen.album) return;

    setAlbumToRate({
      userAlbumId: userAlbum._id,
      albumId: listen.albumId,
      name: listen.album.name,
      artistName: listen.album.artistName,
      imageUrl: listen.album.imageUrl,
      releaseDate: listen.album.releaseDate,
    });
  }

  // Handle save rating
  async function handleSaveRating(rating: number, position: number) {
    if (!albumToRate) return;

    const albumName = albumToRate.name;
    const userAlbumId = albumToRate.userAlbumId as Id<'userAlbums'>;
    setAlbumToRate(null); // Close drawer immediately

    try {
      await updateAlbumRating({
        userAlbumId,
        rating,
        position,
      });
      toast.success(`Rated "${albumName}"`);
    } catch (error) {
      console.error('Failed to save rating:', error);
      toast.error('Failed to save rating');
    }
  }

  // Handle delete listen
  async function handleDeleteListen(listenId: string, albumName: string) {
    try {
      await deleteAlbumListen({
        listenId: listenId as Id<'userAlbumListens'>,
      });
      toast.success(`Deleted listen for "${albumName}"`);
    } catch (error) {
      console.error('Failed to delete listen:', error);
      toast.error('Failed to delete listen');
    }
  }

  // Handle add listen from tracks view
  async function handleAddListen(listenedAt: number) {
    if (!trackToAddListen?.spotifyAlbumId || !userId) return;

    setIsAddingListen(true);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        toast.error('Not connected to Spotify');
        return;
      }

      // Check if album exists in DB, if not fetch and upsert
      const albumResponse = await fetch(
        `/api/spotify/album/${trackToAddListen.spotifyAlbumId}`,
        { headers: { 'X-Access-Token': accessToken } }
      );

      if (!albumResponse.ok) {
        throw new Error('Failed to fetch album from Spotify');
      }

      const albumData = await albumResponse.json();

      // Upsert the album to ensure it exists
      await upsertAlbum({
        spotifyAlbumId: albumData.spotifyAlbumId,
        name: albumData.name,
        artistName: albumData.artistName,
        imageUrl: albumData.imageUrl,
        releaseDate: albumData.releaseDate,
        totalTracks: albumData.totalTracks,
        genres: albumData.genres,
      });

      // Add the listen
      const result = await addManualAlbumListen({
        userId,
        spotifyAlbumId: trackToAddListen.spotifyAlbumId,
        listenedAt,
      });

      if (result.recorded) {
        toast.success(`Added listen for "${result.albumName}"`);
        setTrackToAddListen(null);
      } else {
        toast.info('Listen already recorded for this date');
      }
    } catch (error) {
      console.error('Failed to add listen:', error);
      toast.error('Failed to add listen');
    } finally {
      setIsAddingListen(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <LoginPrompt
        icon={Disc3}
        message="Please log in to track your albums"
        redirectPath="/albums"
      />
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-bold text-3xl">Album Tracker</h1>
          <p className="mt-2 text-muted-foreground">
            Track what albums you've listened to and when
          </p>
        </div>
        {isConnected && (
          <SyncAlbumsButton
            isSyncing={isSyncing}
            onSync={syncHistory}
            variant="outline"
          />
        )}
      </div>

      {/* Spotify Connection (only shows when not connected) */}
      <SpotifyConnection
        isConnected={isConnected}
        displayName={connection?.displayName}
        onDisconnect={handleDisconnect}
      />

      {isConnected && (
        <div className="mt-6">
          {/* Tabs */}
          <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'history'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rankings')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'rankings'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Rankings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tracks')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'tracks'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Tracks
            </button>
          </div>

          {/* History View */}
          {activeTab === 'history' && (
            <HistoryView
              listensByMonth={listensByMonth}
              listenOrdinals={listenOrdinals}
              albumRatings={albumRatings}
              onRateAlbum={handleRateAlbum}
              onDeleteListen={handleDeleteListen}
              isLoading={albumListens === undefined}
            />
          )}

          {/* Rankings View */}
          {activeTab === 'rankings' && (
            <RankingsView
              albumsByTier={albumsByTier}
              availableYears={availableYears}
              yearFilter={yearFilter}
              onYearFilterChange={setYearFilter}
              isLoading={userAlbums === undefined}
              onUpdateRating={(userAlbumId, rating, position) => {
                updateAlbumRating({
                  userAlbumId: userAlbumId as Id<'userAlbums'>,
                  rating,
                  position,
                });
              }}
            />
          )}

          {/* Tracks View */}
          {activeTab === 'tracks' && (
            <TracksView
              tracks={recentTracks ?? []}
              isLoading={recentTracks === undefined}
              onAddListen={(track) => setTrackToAddListen(track)}
            />
          )}
        </div>
      )}

      {/* Add Listen Drawer */}
      <AddListenDrawer
        track={trackToAddListen}
        open={trackToAddListen !== null}
        onOpenChange={(open) => {
          if (!open) setTrackToAddListen(null);
        }}
        onSave={handleAddListen}
        isSaving={isAddingListen}
      />

      {/* Album Ranker Drawer */}
      {ratedAlbumsForYear && (
        <AlbumRanker
          albumToRate={albumToRate}
          existingRankedAlbums={ratedAlbumsForYear}
          open={albumToRate !== null}
          onOpenChange={(open) => {
            if (!open) setAlbumToRate(null);
          }}
          onSave={handleSaveRating}
        />
      )}
    </div>
  );
}

// History View Component
type HistoryListen = {
  _id: string;
  albumId: string;
  listenedAt: number;
  album: { name: string; artistName: string; imageUrl?: string; releaseDate?: string } | null;
};

function HistoryView({
  listensByMonth,
  listenOrdinals,
  albumRatings,
  onRateAlbum,
  onDeleteListen,
  isLoading,
}: {
  listensByMonth: Map<string, HistoryListen[]>;
  listenOrdinals: Map<string, number>;
  albumRatings: Map<string, number>;
  onRateAlbum: (listen: HistoryListen) => void;
  onDeleteListen: (listenId: string, albumName: string) => void;
  isLoading: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading history...</p>
      </div>
    );
  }

  if (listensByMonth.size === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No album listens yet</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Click "Sync Albums" to start tracking your listening history
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {Array.from(listensByMonth.entries()).map(([month, listens]) => (
          <div key={month}>
            <h2 className="mb-3 font-semibold text-lg">{month}</h2>
            <div className="space-y-1">
              {listens.map((listen) => (
                <div key={listen._id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <AlbumCard
                      name={listen.album?.name ?? 'Unknown Album'}
                      artistName={listen.album?.artistName ?? 'Unknown Artist'}
                      imageUrl={listen.album?.imageUrl}
                      listenedAt={listen.listenedAt}
                      listenOrdinal={listenOrdinals.get(listen._id)}
                      rating={albumRatings.get(listen.albumId)}
                      showListenDate
                      onRate={() => onRateAlbum(listen)}
                    />
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                        aria-label="More options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDeleteTarget({
                          id: listen._id,
                          name: listen.album?.name ?? 'Unknown Album',
                        })}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listen?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the listen for "{deleteTarget?.name}" from your history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  onDeleteListen(deleteTarget.id, deleteTarget.name);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Album type for RankingsView
type RankedAlbumItem = {
  _id: string;
  albumId: string;
  rating?: number;
  position?: number;
  album: {
    name: string;
    artistName: string;
    imageUrl?: string;
    releaseDate?: string;
  } | null;
};

// Rankings View Component
function RankingsView({
  albumsByTier,
  availableYears,
  yearFilter,
  onYearFilterChange,
  isLoading,
  onUpdateRating,
}: {
  albumsByTier: Map<TierName, { high: RankedAlbumItem[]; low: RankedAlbumItem[] }>;
  availableYears: number[];
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
  isLoading: boolean;
  onUpdateRating: (userAlbumId: string, rating: number, position: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, { rating: number; position: number }>>(new Map());
  const [savedAlbumId, setSavedAlbumId] = useState<string | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0); // Triggers scroll-into-view on album move
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced mutation - waits 800ms after last change before persisting
  // Don't clear optimistic updates here - let them persist until Convex syncs
  // (they get cleared on year filter change anyway)
  const debouncedUpdate = useDebouncedCallback(
    (userAlbumId: string, rating: number, position: number) => {
      onUpdateRating(userAlbumId, rating, position);
      // Show "Saved" indicator on the specific album
      setSavedAlbumId(userAlbumId);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSavedAlbumId(null), 1500);
    },
    800
  );

  // Flatten albums into a single ordered list for keyboard navigation
  // Order: rating 10 -> 9 -> 8 -> ... -> 1, sorted by position within each rating
  const flatAlbums = useMemo(() => {
    // Collect ALL albums from all tiers first
    const allAlbums: RankedAlbumItem[] = [];
    for (const tier of TIER_ORDER) {
      const tierData = albumsByTier.get(tier);
      if (!tierData) continue;
      allAlbums.push(...tierData.high, ...tierData.low);
    }

    // Apply optimistic updates
    const withOptimistic = allAlbums.map((a) => {
      const update = optimisticUpdates.get(a._id);
      if (update) {
        return { ...a, rating: update.rating, position: update.position };
      }
      return a;
    });

    // Sort by rating (descending) then position (ascending)
    return withOptimistic.sort((a, b) => {
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      if (ratingA !== ratingB) return ratingB - ratingA; // Higher ratings first
      return (a.position ?? 0) - (b.position ?? 0); // Then by position
    });
  }, [albumsByTier, optimisticUpdates]);

  // Re-group for display (respecting optimistic updates)
  const displayByTier = useMemo(() => {
    const grouped = new Map<TierName, { high: RankedAlbumItem[]; low: RankedAlbumItem[] }>();
    for (const tier of TIER_ORDER) {
      const { high: highRating, low: lowRating } = getRatingsForTier(tier);
      grouped.set(tier, {
        high: flatAlbums.filter((a) => a.rating === highRating),
        low: flatAlbums.filter((a) => a.rating === lowRating),
      });
    }
    return grouped;
  }, [flatAlbums]);

  // Check if keyboard reordering is enabled (only for specific years)
  const isReorderingEnabled = yearFilter !== 'all';

  // Move album to a new position
  const moveAlbum = useCallback(
    (direction: 'up' | 'down') => {
      if (selectedIndex === null || !isReorderingEnabled) return;
      const album = flatAlbums[selectedIndex];
      if (!album) return;

      const currentRating = album.rating ?? 5;
      const currentPosition = album.position ?? 0;

      // Find albums in the same rating tier
      const albumsInSameTier = flatAlbums.filter((a) => a.rating === currentRating && a._id !== album._id);
      const sortedSameTier = albumsInSameTier.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      // Find album's position within its tier
      const albumsAbove = sortedSameTier.filter((a) => (a.position ?? 0) < currentPosition);
      const albumsBelow = sortedSameTier.filter((a) => (a.position ?? 0) > currentPosition);

      let newRating: number;
      let newPosition: number;
      let newSelectedIndex: number;

      if (direction === 'up') {
        if (albumsAbove.length > 0) {
          // Move within same tier - swap with album above
          const albumAbove = albumsAbove[albumsAbove.length - 1]; // Last one is closest above
          if (!albumAbove) return;
          
          const albumAboveThat = albumsAbove.length > 1 ? albumsAbove[albumsAbove.length - 2] : null;
          
          newRating = currentRating;
          if (albumAboveThat) {
            newPosition = ((albumAboveThat.position ?? 0) + (albumAbove.position ?? 0)) / 2;
          } else {
            newPosition = (albumAbove.position ?? 0) - 1;
          }
          
          // Find new index in flat list
          const newFlatIndex = flatAlbums.findIndex((a) => a._id === albumAbove._id);
          newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
        } else {
          // At top of tier - move to next higher rating
          if (currentRating >= 10) return; // Already at highest
          
          newRating = currentRating + 1;
          
          // Join at bottom of the new tier
          const albumsInNewTier = flatAlbums.filter((a) => a.rating === newRating);
          if (albumsInNewTier.length > 0) {
            const lastInNewTier = albumsInNewTier.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0];
            if (!lastInNewTier) return;
            newPosition = (lastInNewTier.position ?? 0) + 1;
          } else {
            newPosition = 0; // Empty tier
          }
          
          // Stay at same visual position when changing tiers
          newSelectedIndex = selectedIndex;
        }
      } else {
        // Moving down
        if (albumsBelow.length > 0) {
          // Move within same tier - swap with album below
          const albumBelow = albumsBelow[0]; // First one is closest below
          if (!albumBelow) return;
          
          const albumBelowThat = albumsBelow.length > 1 ? albumsBelow[1] : null;
          
          newRating = currentRating;
          if (albumBelowThat) {
            newPosition = ((albumBelow.position ?? 0) + (albumBelowThat.position ?? 0)) / 2;
          } else {
            newPosition = (albumBelow.position ?? 0) + 1;
          }
          
          // Find new index in flat list
          const newFlatIndex = flatAlbums.findIndex((a) => a._id === albumBelow._id);
          newSelectedIndex = newFlatIndex >= 0 ? newFlatIndex : selectedIndex;
        } else {
          // At bottom of tier - move to next lower rating
          if (currentRating <= 1) return; // Already at lowest
          
          newRating = currentRating - 1;
          
          // Join at top of the new tier
          const albumsInNewTier = flatAlbums.filter((a) => a.rating === newRating);
          if (albumsInNewTier.length > 0) {
            const firstInNewTier = albumsInNewTier.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
            if (!firstInNewTier) return;
            newPosition = (firstInNewTier.position ?? 0) - 1;
          } else {
            newPosition = 0; // Empty tier
          }
          
          // Stay at same visual position when changing tiers
          newSelectedIndex = selectedIndex;
        }
      }

      // Apply optimistic update immediately
      setOptimisticUpdates((prev) => {
        const next = new Map(prev);
        next.set(album._id, { rating: newRating, position: newPosition });
        return next;
      });

      setSelectedIndex(newSelectedIndex);
      setScrollTrigger((n) => n + 1); // Trigger scroll to follow the album

      // Debounced persist to DB
      debouncedUpdate(album._id, newRating, newPosition);
    },
    [selectedIndex, flatAlbums, isReorderingEnabled, debouncedUpdate]
  );

  // Keyboard handler
  useEffect(() => {
    if (!isReorderingEnabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Only handle if not in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        if (e.altKey) {
          // Option + Arrow: move album
          moveAlbum(e.key === 'ArrowUp' ? 'up' : 'down');
        } else {
          // Arrow only: move selection
          setSelectedIndex((prev) => {
            if (prev === null) return flatAlbums.length > 0 ? 0 : null;
            const next = e.key === 'ArrowUp' ? prev - 1 : prev + 1;
            if (next < 0 || next >= flatAlbums.length) return prev;
            return next;
          });
        }
      } else if (e.key === 'Escape') {
        setSelectedIndex(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReorderingEnabled, flatAlbums.length, moveAlbum]);

  // Scroll selected album into view (also triggers when album moves via scrollTrigger)
  useEffect(() => {
    // Use requestAnimationFrame to wait for DOM to update after tier change
    const frameId = requestAnimationFrame(() => {
      const el = selectedRowRef.current;
      if (!el) return;

      const padding = 240;
      const elRect = el.getBoundingClientRect();

      if (elRect.top < padding) {
        window.scrollBy({ top: elRect.top - padding, behavior: 'smooth' });
      } else if (elRect.bottom > window.innerHeight - padding) {
        window.scrollBy({ top: elRect.bottom - window.innerHeight + padding, behavior: 'smooth' });
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [selectedIndex, scrollTrigger]);

  // Reset selection when year filter changes
  useEffect(() => {
    setSelectedIndex(null);
    setOptimisticUpdates(new Map());
  }, [yearFilter]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading rankings...</p>
      </div>
    );
  }

  // Check if there are any rated albums
  const hasRatedAlbums = flatAlbums.length > 0;

  if (!hasRatedAlbums) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No rated albums yet</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Rate albums to see them organized by tier
          </p>
        </div>
      </div>
    );
  }

  // Build a lookup of album _id to flat index
  const albumIdToIndex = new Map<string, number>();
  flatAlbums.forEach((a, i) => albumIdToIndex.set(a._id, i));

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Year Filter + Keyboard hint */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label htmlFor="year-filter" className="text-muted-foreground text-sm">
            Filter by year:
          </label>
          <select
            id="year-filter"
            value={yearFilter}
            onChange={(e) => onYearFilterChange(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="all">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
        </div>
        {isReorderingEnabled && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <KbdGroup>
              <Kbd>
                <ArrowUp className="h-3 w-3" />
              </Kbd>
              <Kbd>
                <ArrowDown className="h-3 w-3" />
              </Kbd>
            </KbdGroup>
            <span>Select</span>
            <span>•</span>
            <KbdGroup>
              <Kbd>⌥</Kbd>
              <span>+</span>
              <Kbd>
                <ArrowUp className="h-3 w-3" />
              </Kbd>
              <Kbd>
                <ArrowDown className="h-3 w-3" />
              </Kbd>
            </KbdGroup>
            <span>Move</span>
            <span>•</span>
            <KbdGroup>
              <Kbd>Esc</Kbd>
            </KbdGroup>
            <span>Clear</span>
          </div>
        )}
      </div>

      {/* Tier Sections - always show all tiers for keyboard navigation */}
      {TIER_ORDER.map((tier) => {
        const albums = displayByTier.get(tier) ?? { high: [], low: [] };

        return (
          <div key={tier} className="rounded-lg border p-3">
            <h2 className="mb-2 font-semibold text-base">{tier}</h2>

            <div className="mb-3">
              <h3 className="mb-1 font-medium text-muted-foreground text-xs">
                High
              </h3>
              <div className="space-y-0.5">
                {albums.high.length > 0 ? (
                  albums.high.map((ua) => {
                    const flatIdx = albumIdToIndex.get(ua._id);
                    const isSelected = flatIdx === selectedIndex;
                    return (
                      <AlbumCard
                        key={ua._id}
                        ref={isSelected ? selectedRowRef : undefined}
                        name={ua.album?.name ?? 'Unknown Album'}
                        artistName={ua.album?.artistName ?? 'Unknown Artist'}
                        imageUrl={ua.album?.imageUrl}
                        releaseDate={ua.album?.releaseDate}
                        showReleaseYear
                        isSelected={isSelected}
                        showSaved={ua._id === savedAlbumId}
                        onSelect={isReorderingEnabled && flatIdx !== undefined ? () => setSelectedIndex(flatIdx) : undefined}
                      />
                    );
                  })
                ) : (
                  <div className="rounded-md border border-dashed py-1.5 text-center text-muted-foreground/50 text-xs">
                    Empty
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-1 font-medium text-muted-foreground text-xs">
                Low
              </h3>
              <div className="space-y-0.5">
                {albums.low.length > 0 ? (
                  albums.low.map((ua) => {
                    const flatIdx = albumIdToIndex.get(ua._id);
                    const isSelected = flatIdx === selectedIndex;
                    return (
                      <AlbumCard
                        key={ua._id}
                        ref={isSelected ? selectedRowRef : undefined}
                        name={ua.album?.name ?? 'Unknown Album'}
                        artistName={ua.album?.artistName ?? 'Unknown Artist'}
                        imageUrl={ua.album?.imageUrl}
                        releaseDate={ua.album?.releaseDate}
                        showReleaseYear
                        isSelected={isSelected}
                        showSaved={ua._id === savedAlbumId}
                        onSelect={isReorderingEnabled && flatIdx !== undefined ? () => setSelectedIndex(flatIdx) : undefined}
                      />
                    );
                  })
                ) : (
                  <div className="rounded-md border border-dashed py-1.5 text-center text-muted-foreground/50 text-xs">
                    Empty
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tracks View Component
type TrackItem = {
  _id: string;
  trackId: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  albumImageUrl?: string;
  spotifyAlbumId?: string;
  lastPlayedAt?: number;
};

function TracksView({
  tracks,
  isLoading,
  onAddListen,
}: {
  tracks: TrackItem[];
  isLoading: boolean;
  onAddListen: (track: TrackItem) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading tracks...</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No recently played tracks</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Click "Sync Albums" to start tracking your listening history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tracks.map((track) => (
        <TrackCard
          key={track._id}
          track={track}
          onAddListen={() => onAddListen(track)}
        />
      ))}
    </div>
  );
}

function TrackCard({
  track,
  onAddListen,
}: {
  track: TrackItem;
  onAddListen: () => void;
}) {
  const timeAgo = track.lastPlayedAt
    ? formatRelativeTime(track.lastPlayedAt)
    : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
      {/* Album Cover */}
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
        {track.albumImageUrl ? (
          <img
            src={track.albumImageUrl}
            alt={track.albumName ?? track.trackName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{track.trackName}</p>
        <p className="truncate text-muted-foreground text-xs">
          {track.artistName}
          {track.albumName && (
            <span className="text-muted-foreground/60"> · {track.albumName}</span>
          )}
        </p>
      </div>

      {/* Add Listen Button */}
      {track.spotifyAlbumId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddListen();
          }}
          className="inline-flex items-center rounded-full border border-dashed border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
          title="Add album listen"
        >
          + Listen
        </button>
      )}

      {/* Timestamp */}
      {timeAgo && (
        <span className="flex-shrink-0 text-muted-foreground text-xs">
          {timeAgo}
        </span>
      )}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  // For older dates, show the actual date
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

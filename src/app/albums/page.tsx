'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { Disc3 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

import { SpotifyConnection } from '../spotify-playlister/_components/spotify-connection';
import { SyncAlbumsButton } from '~/components/sync-albums-button';
import { LoginPrompt } from '~/components/login-prompt';
import { useSpotifyAuth } from '~/lib/hooks/use-spotify-auth';
import { useSyncHistory } from '~/lib/hooks/use-sync-history';
import { AlbumCard } from './_components/album-card';
import { AlbumRanker } from './_components/album-ranker';
import {
  TIER_ORDER,
  getRatingsForTier,
  groupByMonth,
  extractReleaseYear,
  getRatingColors,
  getTierShortLabel,
  type TierName,
} from '~/lib/album-tiers';

type TabValue = 'history' | 'rankings';

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

  const { isSyncing, syncHistory } = useSyncHistory({
    userId,
    isConnected,
    getValidAccessToken,
  });

  // Mutations
  const updateAlbumRating = useMutation(api.spotify.updateAlbumRating);

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
  const currentYear = yearFilter === 'all' ? new Date().getFullYear() : parseInt(yearFilter, 10);
  const ratedAlbumsForYear = useQuery(
    api.spotify.getRatedAlbumsForYear,
    userId ? { userId, year: currentYear } : 'skip'
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

    try {
      await updateAlbumRating({
        userAlbumId: albumToRate.userAlbumId as Id<'userAlbums'>,
        rating,
        position,
      });
      toast.success(`Rated "${albumToRate.name}"`);
      setAlbumToRate(null);
    } catch (error) {
      console.error('Failed to save rating:', error);
      toast.error('Failed to save rating');
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
          </div>

          {/* History View */}
          {activeTab === 'history' && (
            <HistoryView
              listensByMonth={listensByMonth}
              listenOrdinals={listenOrdinals}
              albumRatings={albumRatings}
              onRateAlbum={handleRateAlbum}
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
            />
          )}
        </div>
      )}

      {/* Album Ranker Overlay */}
      {albumToRate && ratedAlbumsForYear && (
        <AlbumRanker
          albumToRate={albumToRate}
          existingRankedAlbums={ratedAlbumsForYear}
          onSave={handleSaveRating}
          onCancel={() => setAlbumToRate(null)}
        />
      )}

      {/* TEMP: Badge preview */}
      <div className="mt-12 rounded-lg border p-4">
        <h3 className="mb-4 font-semibold">Badge Preview (temporary)</h3>
        <div className="flex flex-wrap gap-3">
          <BadgePreview rating={10} />
          <BadgePreview rating={9} />
          <BadgePreview rating={8} />
          <BadgePreview rating={7} />
          <BadgePreview rating={6} />
          <BadgePreview rating={5} />
          <BadgePreview rating={4} />
          <BadgePreview rating={3} />
          <BadgePreview rating={2} />
          <BadgePreview rating={1} />
          <span className="inline-flex items-center rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/50">
            Unrated
          </span>
        </div>
      </div>
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
  isLoading,
}: {
  listensByMonth: Map<string, HistoryListen[]>;
  listenOrdinals: Map<string, number>;
  albumRatings: Map<string, number>;
  onRateAlbum: (listen: HistoryListen) => void;
  isLoading: boolean;
}) {
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
    <div className="space-y-8">
      {Array.from(listensByMonth.entries()).map(([month, listens]) => (
        <div key={month}>
          <h2 className="mb-3 font-semibold text-lg">{month}</h2>
          <div className="space-y-1">
            {listens.map((listen) => (
              <AlbumCard
                key={listen._id}
                name={listen.album?.name ?? 'Unknown Album'}
                artistName={listen.album?.artistName ?? 'Unknown Artist'}
                imageUrl={listen.album?.imageUrl}
                listenedAt={listen.listenedAt}
                listenOrdinal={listenOrdinals.get(listen._id)}
                rating={albumRatings.get(listen.albumId)}
                showListenDate
                onRate={() => onRateAlbum(listen)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Rankings View Component
function RankingsView({
  albumsByTier,
  availableYears,
  yearFilter,
  onYearFilterChange,
  isLoading,
}: {
  albumsByTier: Map<TierName, { high: Array<{ album: { name: string; artistName: string; imageUrl?: string; releaseDate?: string } | null }>; low: Array<{ album: { name: string; artistName: string; imageUrl?: string; releaseDate?: string } | null }> }>;
  availableYears: number[];
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading rankings...</p>
      </div>
    );
  }

  // Check if there are any rated albums
  let hasRatedAlbums = false;
  for (const [, { high, low }] of albumsByTier) {
    if (high.length > 0 || low.length > 0) {
      hasRatedAlbums = true;
      break;
    }
  }

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

  return (
    <div className="space-y-8">
      {/* Year Filter */}
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

      {/* Tier Sections */}
      {TIER_ORDER.map((tier) => {
        const albums = albumsByTier.get(tier);
        if (!albums || (albums.high.length === 0 && albums.low.length === 0)) {
          return null;
        }

        return (
          <div key={tier} className="rounded-lg border p-4">
            <h2 className="mb-4 font-semibold text-lg">{tier}</h2>

            {albums.high.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 font-medium text-muted-foreground text-sm">
                  High
                </h3>
                <div className="space-y-1">
                  {albums.high.map((ua, idx) => (
                    <AlbumCard
                      key={`${ua.album?.name}-high-${idx}`}
                      name={ua.album?.name ?? 'Unknown Album'}
                      artistName={ua.album?.artistName ?? 'Unknown Artist'}
                      imageUrl={ua.album?.imageUrl}
                      releaseDate={ua.album?.releaseDate}
                      showReleaseYear
                    />
                  ))}
                </div>
              </div>
            )}

            {albums.low.length > 0 && (
              <div>
                <h3 className="mb-2 font-medium text-muted-foreground text-sm">
                  Low
                </h3>
                <div className="space-y-1">
                  {albums.low.map((ua, idx) => (
                    <AlbumCard
                      key={`${ua.album?.name}-low-${idx}`}
                      name={ua.album?.name ?? 'Unknown Album'}
                      artistName={ua.album?.artistName ?? 'Unknown Artist'}
                      imageUrl={ua.album?.imageUrl}
                      releaseDate={ua.album?.releaseDate}
                      showReleaseYear
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// TEMP: Badge preview component
function BadgePreview({ rating }: { rating: number }) {
  const colors = getRatingColors(rating);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {getTierShortLabel(rating)}
    </span>
  );
}

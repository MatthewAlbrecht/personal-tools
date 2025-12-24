'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { X, Disc3, ChevronUp, ChevronDown } from 'lucide-react';
import { TIER_ORDER, getTierInfo, getRatingsForTier, type TierName } from '~/lib/album-tiers';

type RankedAlbum = {
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

type AlbumToRate = {
  userAlbumId: string;
  albumId: string;
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
};

type AlbumRankerProps = {
  albumToRate: AlbumToRate;
  existingRankedAlbums: RankedAlbum[];
  onSave: (rating: number, position: number) => void;
  onCancel: () => void;
};

// All possible slots: 10 ratings (Holy Moly High=10 down to Actively Bad Low=1)
const ALL_RATINGS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export function AlbumRanker({
  albumToRate,
  existingRankedAlbums,
  onSave,
  onCancel,
}: AlbumRankerProps) {
  // Current rating for the new album (starts at top = 10)
  const [currentRating, setCurrentRating] = useState(10);
  // Position within the current rating's list (0 = top)
  const [positionInRating, setPositionInRating] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Group existing albums by rating
  const albumsByRating = useCallback(() => {
    const groups = new Map<number, RankedAlbum[]>();
    for (const rating of ALL_RATINGS) {
      groups.set(rating, []);
    }
    for (const album of existingRankedAlbums) {
      if (album.rating !== undefined) {
        const list = groups.get(album.rating) ?? [];
        list.push(album);
        groups.set(album.rating, list);
      }
    }
    // Sort each group by position
    for (const [rating, albums] of groups) {
      albums.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      groups.set(rating, albums);
    }
    return groups;
  }, [existingRankedAlbums]);

  const groups = albumsByRating();

  // Get albums at current rating
  const albumsAtCurrentRating = groups.get(currentRating) ?? [];
  const maxPositionInRating = albumsAtCurrentRating.length; // Can be 0 to length (insert at end)

  // Move within current rating or to adjacent rating
  function moveUp() {
    if (positionInRating > 0) {
      // Move up within current rating
      setPositionInRating(positionInRating - 1);
    } else {
      // Move to previous rating (higher number)
      const currentIdx = ALL_RATINGS.indexOf(currentRating as typeof ALL_RATINGS[number]);
      if (currentIdx > 0) {
        const prevRating = ALL_RATINGS[currentIdx - 1];
        if (prevRating !== undefined) {
          setCurrentRating(prevRating);
          // Position at bottom of that rating
          const prevAlbums = groups.get(prevRating) ?? [];
          setPositionInRating(prevAlbums.length);
        }
      }
    }
  }

  function moveDown() {
    if (positionInRating < maxPositionInRating) {
      // Move down within current rating
      setPositionInRating(positionInRating + 1);
    } else {
      // Move to next rating (lower number)
      const currentIdx = ALL_RATINGS.indexOf(currentRating as typeof ALL_RATINGS[number]);
      if (currentIdx < ALL_RATINGS.length - 1) {
        const nextRating = ALL_RATINGS[currentIdx + 1];
        if (nextRating !== undefined) {
          setCurrentRating(nextRating);
          setPositionInRating(0);
        }
      }
    }
  }

  // Jump to next/prev sub-tier (High/Low boundary)
  function jumpToTier(direction: 'up' | 'down') {
    const currentTierInfo = getTierInfo(currentRating);
    if (!currentTierInfo) return;

    const currentTierIdx = TIER_ORDER.indexOf(currentTierInfo.tier);

    if (direction === 'up') {
      if (currentTierInfo.subTier === 'Low') {
        // Move to same tier's High
        const highRating = getRatingsForTier(currentTierInfo.tier).high;
        setCurrentRating(highRating);
        setPositionInRating(0);
      } else if (currentTierIdx > 0) {
        // At a tier's High - move to prev tier's Low first (so we step through in order)
        const prevTier = TIER_ORDER[currentTierIdx - 1];
        if (prevTier) {
          const lowRating = getRatingsForTier(prevTier).low;
          setCurrentRating(lowRating);
          setPositionInRating(0);
        }
      }
    } else {
      if (currentTierInfo.subTier === 'High') {
        // Move to same tier's Low
        const lowRating = getRatingsForTier(currentTierInfo.tier).low;
        setCurrentRating(lowRating);
        setPositionInRating(0);
      } else if (currentTierIdx < TIER_ORDER.length - 1) {
        // At a tier's Low - move to next tier's High first (so we step through in order)
        const nextTier = TIER_ORDER[currentTierIdx + 1];
        if (nextTier) {
          const highRating = getRatingsForTier(nextTier).high;
          setCurrentRating(highRating);
          setPositionInRating(0);
        }
      }
    }
  }

  // Calculate final position value for saving
  function calculatePosition(): number {
    const albumsAtRating = groups.get(currentRating) ?? [];
    
    if (albumsAtRating.length === 0) {
      return 0;
    }

    if (positionInRating === 0) {
      // Insert at top
      const firstAlbum = albumsAtRating[0];
      return (firstAlbum?.position ?? 0) - 1;
    } else if (positionInRating >= albumsAtRating.length) {
      // Insert at bottom
      const lastAlbum = albumsAtRating[albumsAtRating.length - 1];
      return (lastAlbum?.position ?? 0) + 1;
    } else {
      // Insert between two albums
      const before = albumsAtRating[positionInRating - 1];
      const after = albumsAtRating[positionInRating];
      return ((before?.position ?? 0) + (after?.position ?? 0)) / 2;
    }
  }

  function handleSave() {
    const position = calculatePosition();
    onSave(currentRating, position);
  }

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      if (e.key === 'Enter') {
        handleSave();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.shiftKey) {
          jumpToTier('up');
        } else {
          moveUp();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.shiftKey) {
          jumpToTier('down');
        } else {
          moveDown();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Focus container on mount for keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const currentTierInfo = getTierInfo(currentRating);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/95 backdrop-blur-sm outline-none"
    >
      <div className="w-full max-w-2xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-xl">Rate Album</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Use arrow keys to position, Shift+arrows for tier jumps
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Album being rated - sticky at top */}
        <div className="mb-6 rounded-lg border-2 border-primary bg-primary/5 p-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              {albumToRate.imageUrl ? (
                <Image
                  src={albumToRate.imageUrl}
                  alt={albumToRate.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Disc3 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{albumToRate.name}</p>
              <p className="truncate text-muted-foreground text-sm">
                {albumToRate.artistName}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-primary">
                {currentTierInfo?.tier} - {currentTierInfo?.subTier}
              </p>
              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={moveUp}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={moveDown}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mb-4 flex items-center justify-between text-muted-foreground text-xs">
          <span>↑↓ Move • Shift+↑↓ Jump tier • Enter Save • Esc Cancel</span>
        </div>

        {/* All tiers - always show the template */}
        <div className="space-y-4">
          {TIER_ORDER.map((tier) => {
            const { high: highRating, low: lowRating } = getRatingsForTier(tier);
            const highAlbums = groups.get(highRating) ?? [];
            const lowAlbums = groups.get(lowRating) ?? [];

            return (
              <div key={tier} className="rounded-lg border p-3">
                <h3 className="mb-3 font-semibold text-sm">{tier}</h3>

                {/* High sub-tier */}
                <div className="mb-3">
                  <p className="mb-1.5 text-muted-foreground text-xs">High</p>
                  <div className="min-h-[40px] space-y-1">
                    <TierSlot
                      albums={highAlbums}
                      rating={highRating}
                      currentRating={currentRating}
                      positionInRating={positionInRating}
                      newAlbum={albumToRate}
                    />
                  </div>
                </div>

                {/* Low sub-tier */}
                <div>
                  <p className="mb-1.5 text-muted-foreground text-xs">Low</p>
                  <div className="min-h-[40px] space-y-1">
                    <TierSlot
                      albums={lowAlbums}
                      rating={lowRating}
                      currentRating={currentRating}
                      positionInRating={positionInRating}
                      newAlbum={albumToRate}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save/Cancel buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save Rating
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders a tier slot with existing albums and the new album insertion point
function TierSlot({
  albums,
  rating,
  currentRating,
  positionInRating,
  newAlbum,
}: {
  albums: RankedAlbum[];
  rating: number;
  currentRating: number;
  positionInRating: number;
  newAlbum: AlbumToRate;
}) {
  const isCurrentTier = rating === currentRating;

  // If this is the current tier, we need to show the new album at the right position
  if (isCurrentTier) {
    const elements: React.ReactNode[] = [];

    for (let i = 0; i <= albums.length; i++) {
      // Show new album insertion point
      if (i === positionInRating) {
        elements.push(
          <NewAlbumRow key="new" album={newAlbum} />
        );
      }

      // Show existing album
      if (i < albums.length) {
        const album = albums[i];
        if (album?.album) {
          elements.push(
            <ExistingAlbumRow key={album._id} album={album} />
          );
        }
      }
    }

    // If inserting at end and we haven't shown it yet
    if (positionInRating >= albums.length && elements.filter(e => e && (e as React.ReactElement).key === 'new').length === 0) {
      elements.push(<NewAlbumRow key="new" album={newAlbum} />);
    }

    if (elements.length === 0) {
      return <NewAlbumRow album={newAlbum} />;
    }

    return <>{elements}</>;
  }

  // Not the current tier - just show existing albums or empty state
  if (albums.length === 0) {
    return (
      <div className="flex h-10 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
        Empty
      </div>
    );
  }

  return (
    <>
      {albums.map((album) => (
        album.album && <ExistingAlbumRow key={album._id} album={album} />
      ))}
    </>
  );
}

function NewAlbumRow({ album }: { album: AlbumToRate }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-primary/10 p-2 ring-2 ring-primary">
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
        {album.imageUrl ? (
          <Image
            src={album.imageUrl}
            alt={album.name}
            fill
            className="object-cover"
            sizes="32px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{album.name}</p>
        <p className="truncate text-muted-foreground text-xs">{album.artistName}</p>
      </div>
    </div>
  );
}

function ExistingAlbumRow({ album }: { album: RankedAlbum }) {
  if (!album.album) return null;

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/30 p-2">
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
        {album.album.imageUrl ? (
          <Image
            src={album.album.imageUrl}
            alt={album.album.name}
            fill
            className="object-cover"
            sizes="32px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{album.album.name}</p>
        <p className="truncate text-muted-foreground text-xs">{album.album.artistName}</p>
      </div>
    </div>
  );
}

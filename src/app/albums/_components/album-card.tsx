'use client';

import Image from 'next/image';
import { Disc3 } from 'lucide-react';
import { getRatingColors, getTierShortLabel } from '~/lib/album-tiers';

type AlbumCardProps = {
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
  listenedAt?: number;
  listenOrdinal?: number; // Which listen this was (1 = first, 2 = second, etc.)
  rating?: number; // 1-10 rating if rated
  showListenDate?: boolean;
  showReleaseYear?: boolean;
  onRate?: () => void;
};

export function AlbumCard({
  name,
  artistName,
  imageUrl,
  releaseDate,
  listenedAt,
  listenOrdinal,
  rating,
  showListenDate = false,
  showReleaseYear = false,
  onRate,
}: AlbumCardProps) {
  const releaseYear = releaseDate?.substring(0, 4);

  const listenDateStr = listenedAt
    ? new Date(listenedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    : null;

  const ratingColors = rating ? getRatingColors(rating) : null;
  const isRated = rating !== undefined;

  return (
    <div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
      {/* Album Cover */}
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="48px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Album Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{name}</p>
        <p className="truncate text-muted-foreground text-xs">{artistName}</p>
      </div>

      {/* Metadata */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* Rating Badge or Unranked Button */}
        {isRated && ratingColors ? (
          // Rated - show colored tier badge (display only)
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px] ${ratingColors.bg} ${ratingColors.text} ${ratingColors.border}`}
          >
            {getTierShortLabel(rating)}
          </span>
        ) : (
          // Unranked - show subtle ghost button (only if onRate is provided)
          onRate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRate();
              }}
              className="inline-flex items-center rounded-full border border-dashed border-muted-foreground/20 px-2 py-0.5 font-medium text-[10px] text-muted-foreground/40 transition-all hover:border-muted-foreground/50 hover:text-muted-foreground"
              title="Rank this album"
            >
              Unranked
            </button>
          )
        )
        }

        {/* Listen ordinal */}
        {listenOrdinal !== undefined && (
          listenOrdinal === 1 ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600 text-[10px] dark:text-emerald-400">
              First
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-[10px]">
              {listenOrdinal}×
            </span>
          )
        )}

        {/* Date/Year */}
        <div className="text-right text-muted-foreground text-xs">
          {showListenDate && listenDateStr && <span>{listenDateStr}</span>}
          {showReleaseYear && releaseYear && <span>{releaseYear}</span>}
        </div>
      </div>
    </div>
  );
}

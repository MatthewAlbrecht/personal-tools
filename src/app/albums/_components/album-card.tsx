'use client';

import Image from 'next/image';
import { Disc3 } from 'lucide-react';

type AlbumCardProps = {
  name: string;
  artistName: string;
  imageUrl?: string;
  releaseDate?: string;
  listenedAt?: number;
  listenOrdinal?: number; // Which listen this was (1 = first, 2 = second, etc.)
  showListenDate?: boolean;
  showReleaseYear?: boolean;
};

export function AlbumCard({
  name,
  artistName,
  imageUrl,
  releaseDate,
  listenedAt,
  listenOrdinal,
  showListenDate = false,
  showReleaseYear = false,
}: AlbumCardProps) {
  const releaseYear = releaseDate?.substring(0, 4);

  const listenDateStr = listenedAt
    ? new Date(listenedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
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
        <div className="text-right text-muted-foreground text-xs">
          {showListenDate && listenDateStr && <span>{listenDateStr}</span>}
          {showReleaseYear && releaseYear && <span>{releaseYear}</span>}
        </div>
      </div>
    </div>
  );
}


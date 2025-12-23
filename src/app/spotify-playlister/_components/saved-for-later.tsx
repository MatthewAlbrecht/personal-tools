'use client';

import { Play, Bookmark, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';

type SavedTrack = {
  _id: string;
  trackId: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  albumImageUrl?: string;
  savedAt: number;
};

type SavedForLaterProps = {
  tracks: SavedTrack[] | undefined;
  isLoading: boolean;
  selectedTrackId: string | null;
  onSelectTrack: (track: SavedTrack) => void;
  onRemove: (trackId: string) => void;
};

export function SavedForLater({
  tracks,
  isLoading,
  selectedTrackId,
  onSelectTrack,
  onRemove,
}: SavedForLaterProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Saved for Later
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SavedTracksSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!tracks?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bookmark className="h-5 w-5" />
          Saved for Later
          <span className="font-normal text-muted-foreground text-sm">
            ({tracks.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[300px] space-y-1 overflow-y-auto">
          {tracks.map((track) => {
            const isSelected = selectedTrackId === track.trackId;

            return (
              <div
                key={track._id}
                className={`group flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/10 ring-1 ring-primary' : ''
                  }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                    {track.albumImageUrl ? (
                      <img
                        src={track.albumImageUrl}
                        alt={track.albumName ?? track.trackName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <Play className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{track.trackName}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {track.artistName}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(track.trackId);
                  }}
                  className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                  title="Remove from saved"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SavedTracksSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}


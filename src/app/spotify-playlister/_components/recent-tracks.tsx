'use client';

import { Play, Clock, CheckCircle2, Bookmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import type { RecentlyPlayedItem } from '../_utils/types';

type RecentTracksProps = {
  tracks: RecentlyPlayedItem[] | undefined;
  isLoading: boolean;
  selectedTrackId: string | null;
  categorizedTrackIds: Set<string>;
  savedTrackIds: Set<string>;
  onSelectTrack: (track: RecentlyPlayedItem) => void;
  onSaveForLater: (track: RecentlyPlayedItem) => void;
  onRefresh: () => void;
};

export function RecentTracks({
  tracks,
  isLoading,
  selectedTrackId,
  categorizedTrackIds,
  savedTrackIds,
  onSelectTrack,
  onSaveForLater,
  onRefresh,
}: RecentTracksProps) {
  // Filter out saved tracks
  const filteredTracks = tracks?.filter((item) => !savedTrackIds.has(item.track.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recently Played
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <RecentTracksSkeleton />
        ) : !filteredTracks?.length ? (
          <p className="py-8 text-center text-muted-foreground">
            No recently played tracks found
          </p>
        ) : (
          <div className="max-h-[600px] space-y-1 overflow-y-auto">
            {filteredTracks.map((item, index) => {
              const isCategorized = categorizedTrackIds.has(item.track.id);
              const isSelected = selectedTrackId === item.track.id;

              return (
                <div
                  key={`${item.track.id}-${index}`}
                  className={`group flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/10 ring-1 ring-primary' : ''
                    } ${isCategorized ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTrack(item)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                      {item.track.album.images[0] ? (
                        <img
                          src={item.track.album.images[item.track.album.images.length - 1]?.url}
                          alt={item.track.album.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Play className="h-4 w-4" />
                        </div>
                      )}
                      {isCategorized && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{item.track.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {item.track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSaveForLater(item);
                    }}
                    className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    title="Save for later"
                  >
                    <Bookmark className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTracksSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
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


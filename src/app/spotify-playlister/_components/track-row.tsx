'use client';

import { Play, Pause, Loader2, Radio } from 'lucide-react';
import type { SpotifyTrack, PlayerState } from '../_utils/types';

export function TrackRow({
  track,
  isSelected,
  isNowPlaying,
  playerState,
  onSelect,
  onTogglePlayback,
}: {
  track: SpotifyTrack;
  isSelected: boolean;
  isNowPlaying?: boolean;
  playerState: PlayerState;
  onSelect: () => void;
  onTogglePlayback: (trackUri: string) => void;
}) {
  const isPlaying = playerState.currentTrackId === track.id && playerState.isPlaying;
  const isCurrentTrack = playerState.currentTrackId === track.id;
  const isPending = playerState.isPending && playerState.pendingTrackId === track.id;

  return (
    <div
      className={`group flex w-full items-center gap-3 overflow-hidden rounded-lg p-2 transition-colors hover:bg-muted/50 ${
        isSelected ? 'bg-primary/10 ring-1 ring-primary' : ''
      } ${isNowPlaying ? 'bg-green-500/10 ring-1 ring-green-500/50' : ''}`}
    >
      {/* Album art with play button overlay */}
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
        {track.album.images[0] ? (
          <img
            src={track.album.images[track.album.images.length - 1]?.url}
            alt={track.album.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Play className="h-4 w-4" />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            onTogglePlayback(`spotify:track:${track.id}`);
            // Also select the track when playing it
            onSelect();
          }}
          disabled={!playerState.isReady || isPending}
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
            isCurrentTrack || isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } ${!playerState.isReady ? 'cursor-not-allowed' : ''}`}
          title={playerState.isReady ? (isPlaying ? 'Pause' : 'Play') : 'Player loading...'}
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5 text-white" />
          ) : isCurrentTrack ? (
            <Play className="h-5 w-5 text-white" />
          ) : (
            <Play className="h-4 w-4 text-white" />
          )}
        </button>
        {/* Now Playing indicator badge */}
        {isNowPlaying && !isCurrentTrack && !isPending && (
          <div className="absolute right-0 bottom-0 rounded-tl bg-green-500 p-0.5">
            <Radio className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
      {/* Track info - clickable to select */}
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <p className={`truncate font-medium text-sm ${isCurrentTrack || isNowPlaying ? 'text-green-500' : ''}`}>
            {track.name}
          </p>
          {isNowPlaying && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-500/20 px-1.5 py-0.5 font-medium text-[10px] text-green-600">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              LIVE
            </span>
          )}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {track.artists.map((a) => a.name).join(', ')}
        </p>
      </button>
    </div>
  );
}


'use client';

import { Play, Pause, Bookmark, Loader2, X } from 'lucide-react';
import type { SpotifyTrack, PlayerState } from '../_utils/types';

export function TrackRow({
  track,
  isSelected,
  playerState,
  onSelect,
  onTogglePlayback,
  onSaveForLater,
  onRemove,
}: {
  track: SpotifyTrack;
  isSelected: boolean;
  playerState: PlayerState;
  onSelect: () => void;
  onTogglePlayback: (trackUri: string) => void;
  onSaveForLater?: () => void;
  onRemove?: () => void;
}) {
  const isPlaying = playerState.currentTrackId === track.id && playerState.isPlaying;
  const isCurrentTrack = playerState.currentTrackId === track.id;
  const isPending = playerState.isPending && playerState.pendingTrackId === track.id;

  return (
    <div
      className={`group flex w-full items-center gap-3 overflow-hidden rounded-lg p-2 transition-colors hover:bg-muted/50 ${
        isSelected ? 'bg-primary/10 ring-1 ring-primary' : ''
      }`}
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
      </div>
      {/* Track info - clickable to select */}
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <p className={`truncate font-medium text-sm ${isCurrentTrack ? 'text-green-500' : ''}`}>
          {track.name}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {track.artists.map((a) => a.name).join(', ')}
        </p>
      </button>
      {/* Save for later button */}
      {onSaveForLater && (
        <button
          type="button"
          onClick={onSaveForLater}
          className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          title="Save for later"
        >
          <Bookmark className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
          title="Remove"
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  );
}


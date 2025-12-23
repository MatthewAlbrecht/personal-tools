'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, ExternalLink, Play, Pause } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { Label } from '~/components/ui/label';
import type { SpotifyTrack, ReviewState, PlayerState } from '../_utils/types';

type SongReviewCardProps = {
  track: SpotifyTrack;
  reviewState: ReviewState;
  initialInput?: string;
  playerState?: PlayerState;
  onTogglePlayback?: (trackUri: string) => void;
  onSubmit: (userInput: string) => void;
  onCancel: () => void;
};

export function SongReviewCard({
  track,
  reviewState,
  initialInput = '',
  playerState,
  onTogglePlayback,
  onSubmit,
  onCancel,
}: SongReviewCardProps) {
  const [userInput, setUserInput] = useState(initialInput);

  // Update input when initialInput changes (e.g., re-categorizing a track)
  useEffect(() => {
    setUserInput(initialInput);
  }, [initialInput]);
  const isLoading = reviewState.status === 'loading';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (userInput.trim()) {
      onSubmit(userInput.trim());
    }
  }

  const albumImage = track.album.images[0]?.url;
  const artistNames = track.artists.map((a) => a.name).join(', ');
  const isCurrentTrack = playerState?.currentTrackId === track.id;
  const isPlayButtonLoading = playerState?.isPending && playerState?.pendingTrackId === track.id;
  const isPlaying = isCurrentTrack && playerState?.isPlaying;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Categorize Song
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Track Info */}
        <div className="flex gap-4">
          {albumImage && (
            <img
              src={albumImage}
              alt={track.album.name}
              className="h-24 w-24 rounded-lg object-cover shadow-md"
            />
          )}
          <div className="flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-lg">{track.name}</h3>
                <p className="text-muted-foreground">{artistNames}</p>
                <p className="text-muted-foreground text-sm">{track.album.name}</p>
              </div>
              {onTogglePlayback && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onTogglePlayback(`spotify:track:${track.id}`);
                  }}
                  disabled={!playerState?.isReady}
                  className="p-1 flex-shrink-0 rounded hover:bg-primary/10 disabled:opacity-50"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlayButtonLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
            <a
              href={track.external_urls.spotify}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
            >
              Open in Spotify
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="vibe-input">
              Describe when you&apos;d listen to this song
            </Label>
            <Textarea
              id="vibe-input"
              placeholder="e.g., late night drive, moody, introspective..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={isLoading}
              autoFocus
              rows={3}
            />
            <p className="text-muted-foreground text-xs">
              The AI will match your description to your playlist vibes
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={!userInput.trim() || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finding playlists...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Get Suggestions
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


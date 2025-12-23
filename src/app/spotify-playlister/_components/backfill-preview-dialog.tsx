'use client';

import { useState } from 'react';
import { CheckCircle2, X, Play, Pause, Loader2 } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import type { PlayerState } from '../_utils/types';

export type BackfillMatch = {
  trackId: string;
  trackName: string;
  artistName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

type BackfillPreviewDialogProps = {
  isOpen: boolean;
  matches: BackfillMatch[];
  playlistName: string;
  isLoading: boolean;
  playerState?: PlayerState;
  onTogglePlayback?: (trackUri: string) => void;
  onConfirm: (matches: BackfillMatch[]) => void;
  onCancel: () => void;
};

export function BackfillPreviewDialog({
  isOpen,
  matches,
  playlistName,
  isLoading,
  playerState,
  onTogglePlayback,
  onConfirm,
  onCancel,
}: BackfillPreviewDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(matches.map((m) => m.trackId))
  );

  if (!isOpen) return null;

  // Validate track IDs - Spotify IDs are typically 22 character alphanumeric strings
  const isValidSpotifyId = (id: string) => /^[a-zA-Z0-9]{22}$/.test(id);
  const invalidIds = matches.filter((m) => !isValidSpotifyId(m.trackId));
  
  if (invalidIds.length > 0) {
    console.warn('[Dialog] Found invalid Spotify track IDs:', invalidIds.map((m) => ({
      trackId: m.trackId,
      trackName: m.trackName,
    })));
  }

  // Filter to only valid IDs for display
  const validMatches = matches.filter((m) => isValidSpotifyId(m.trackId));
  
  if (validMatches.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-background">
          <div className="border-b p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-lg">Error Loading Matches</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Could not find any valid tracks to display. This may indicate an issue with stored track data.
                </p>
              </div>
              <button
                onClick={onCancel}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            <p className="text-sm text-muted-foreground mb-4">
              {invalidIds.length} track(s) had invalid IDs:
            </p>
            <div className="space-y-2 mb-4 max-h-32 overflow-y-auto">
              {invalidIds.map((m) => (
                <div key={m.trackId} className="text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-2 rounded">
                  <p className="font-medium truncate">{m.trackName}</p>
                  <p className="text-red-700 dark:text-red-300 truncate">ID: {m.trackId}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t p-4 sm:p-6 flex gap-2 justify-end">
            <Button onClick={onCancel}>Close</Button>
          </div>
        </Card>
      </div>
    );
  }

  const highConfidence = validMatches.filter((m) => m.confidence === 'high').length;
  const mediumConfidence = validMatches.filter((m) => m.confidence === 'medium').length;
  const selectedMatches = validMatches.filter((m) => selectedIds.has(m.trackId));

  function handleToggleTrack(trackId: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(trackId)) {
      newSelected.delete(trackId);
    } else {
      newSelected.add(trackId);
    }
    setSelectedIds(newSelected);
  }

  function handleConfirm() {
    onConfirm(selectedMatches);
  }

  function getConfidenceColor(confidence: string) {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100';
      case 'medium':
        return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100';
      case 'low':
        return 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100';
      default:
        return '';
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-background">
        {/* Header */}
        <div className="border-b p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-lg">Review Matched Songs</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Found {matches.length} song{matches.length !== 1 ? 's' : ''} for &quot;{playlistName}&quot;
              </p>
            </div>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 p-4 sm:p-6 bg-accent/30 border-b">
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-2">
            <div className="text-xs font-medium text-green-900 dark:text-green-100">
              {highConfidence} High Confidence
            </div>
          </div>
          <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-2">
            <div className="text-xs font-medium text-yellow-900 dark:text-yellow-100">
              {mediumConfidence} Medium Confidence
            </div>
          </div>
        </div>

        {/* Matches List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
          {validMatches.map((match) => {
            const isSelected = selectedIds.has(match.trackId);
            const isCurrentTrack = playerState?.currentTrackId === match.trackId;
            const isPlayButtonLoading = playerState?.isPending && playerState?.pendingTrackId === match.trackId;
            const isPlaying = isCurrentTrack && playerState?.isPlaying;
            
            return (
              <button
                key={match.trackId}
                onClick={() => handleToggleTrack(match.trackId)}
                disabled={isLoading}
                className={`w-full rounded-lg border p-3 transition-colors disabled:opacity-50 ${
                  isSelected
                    ? 'bg-accent border-primary/50'
                    : 'hover:bg-accent/50 border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    disabled={isLoading}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{match.trackName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {match.artistName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getConfidenceColor(match.confidence)}>
                          {match.confidence}
                        </Badge>
                        {onTogglePlayback && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const trackUri = `spotify:track:${match.trackId}`;
                              console.log('[Dialog] Play button clicked:', {
                                trackId: match.trackId,
                                trackUri,
                                trackName: match.trackName,
                              });
                              onTogglePlayback(trackUri);
                            }}
                            disabled={isLoading || !playerState?.isReady}
                            className="p-1 hover:bg-primary/10 rounded disabled:opacity-50"
                            title={isPlaying ? 'Pause' : 'Play'}
                          >
                            {isPlayButtonLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{match.reason}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="border-t p-4 sm:p-6 flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || selectedMatches.length === 0}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Add {selectedMatches.length} Song{selectedMatches.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </Card>
    </div>
  );
}


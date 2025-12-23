'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, ListMusic, Power, Sparkles, Loader2, History, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { BackfillPreviewDialog, type BackfillMatch } from './backfill-preview-dialog';
import type { LocalPlaylist, SpotifyPlaylist } from '../_utils/types';
import type { PlayerState } from '../_utils/types';
import { formatPlaylistName } from '../_utils/formatters';

type PlaylistManagerProps = {
  localPlaylists: LocalPlaylist[] | undefined;
  spotifyPlaylists: SpotifyPlaylist[] | undefined;
  isLoading: boolean;
  onAddPlaylist: (spotifyPlaylist: SpotifyPlaylist, description: string, userNotes?: string) => void;
  onCreatePlaylist: (name: string, description: string, userNotes?: string) => Promise<{ playlist: SpotifyPlaylist } | null>;
  onUpdateDescription: (playlistId: string, description: string, userNotes?: string) => void;
  onToggleActive: (playlistId: string, isActive: boolean) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onCheckPastSongs?: (playlist: LocalPlaylist) => Promise<BackfillMatch[] | null>;
  onConfirmBackfill?: (playlist: LocalPlaylist, matches: BackfillMatch[]) => Promise<void>;
  playerState?: PlayerState;
  onTogglePlayback?: (trackUri: string) => void;
};

export function PlaylistManager({
  localPlaylists,
  spotifyPlaylists,
  isLoading,
  onAddPlaylist,
  onCreatePlaylist,
  onUpdateDescription,
  onToggleActive,
  onDeletePlaylist,
  onCheckPastSongs,
  onConfirmBackfill,
  playerState,
  onTogglePlayback,
}: PlaylistManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedSpotifyPlaylist, setSelectedSpotifyPlaylist] = useState<SpotifyPlaylist | null>(null);
  // Add existing playlist state
  const [addUserNotes, setAddUserNotes] = useState('');
  const [addGeneratedDescription, setAddGeneratedDescription] = useState('');
  // Create new playlist state
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistVibe, setNewPlaylistVibe] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState('');
  // Edit playlist state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUserNotes, setEditUserNotes] = useState('');
  const [editGeneratedDescription, setEditGeneratedDescription] = useState('');
  // Loading states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);
  const [isGeneratingCreate, setIsGeneratingCreate] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [backfillingId, setBackfillingId] = useState<string | null>(null);
  const [newlyCreatedPlaylist, setNewlyCreatedPlaylist] = useState<{ playlist: SpotifyPlaylist; description: string } | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{
    isOpen: boolean;
    matches: BackfillMatch[];
    playlistName: string;
    selectedPlaylist: LocalPlaylist | null;
    isConfirming: boolean;
  }>({
    isOpen: false,
    matches: [],
    playlistName: '',
    selectedPlaylist: null,
    isConfirming: false,
  });

  // Filter out playlists already added locally
  const localPlaylistIds = new Set(localPlaylists?.map((p) => p.spotifyPlaylistId) ?? []);
  const availableSpotifyPlaylists = spotifyPlaylists?.filter(
    (p) => !localPlaylistIds.has(p.id)
  );

  function handleAddPlaylist() {
    if (selectedSpotifyPlaylist && addGeneratedDescription.trim()) {
      onAddPlaylist(selectedSpotifyPlaylist, addGeneratedDescription.trim(), addUserNotes.trim() || undefined);
      setIsAdding(false);
      setSelectedSpotifyPlaylist(null);
      setAddUserNotes('');
      setAddGeneratedDescription('');
    }
  }

  function handleStartEdit(playlist: LocalPlaylist) {
    setEditingId(playlist._id);
    setEditUserNotes(playlist.userNotes ?? '');
    setEditGeneratedDescription(''); // Clear any previous preview
  }

  function handleSaveEdit(playlist: LocalPlaylist) {
    const newDescription = editGeneratedDescription.trim() || playlist.description;
    onUpdateDescription(playlist._id, newDescription, editUserNotes.trim() || undefined);
    setEditingId(null);
    setEditUserNotes('');
    setEditGeneratedDescription('');
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditUserNotes('');
    setEditGeneratedDescription('');
  }

  async function handleGenerateAddDescription() {
    if (!addUserNotes.trim()) {
      toast.error('Enter some notes first');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/spotify/generate-playlist-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userNotes: addUserNotes }),
      });

      if (!res.ok) throw new Error('Failed to generate');

      const data = await res.json();
      setAddGeneratedDescription(data.description);
    } catch {
      toast.error('Failed to generate description');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateEditDescription() {
    if (!editUserNotes.trim()) {
      toast.error('Enter some notes first');
      return;
    }

    setIsGeneratingEdit(true);
    try {
      const res = await fetch('/api/spotify/generate-playlist-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userNotes: editUserNotes }),
      });

      if (!res.ok) throw new Error('Failed to generate');

      const data = await res.json();
      setEditGeneratedDescription(data.description);
    } catch {
      toast.error('Failed to generate description');
    } finally {
      setIsGeneratingEdit(false);
    }
  }

  async function handleGenerateCreateDescription() {
    if (!newPlaylistVibe.trim()) {
      toast.error('Enter some notes first');
      return;
    }

    setIsGeneratingCreate(true);
    try {
      const res = await fetch('/api/spotify/generate-playlist-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userNotes: newPlaylistVibe }),
      });

      if (!res.ok) throw new Error('Failed to generate');

      const data = await res.json();
      setGeneratedDescription(data.description);
    } catch {
      toast.error('Failed to generate description');
    } finally {
      setIsGeneratingCreate(false);
    }
  }

  async function handleCreatePlaylist() {
    if (!newPlaylistName.trim() || !generatedDescription.trim()) {
      toast.error('Name and description are required');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const result = await onCreatePlaylist(
        newPlaylistName.trim(),
        generatedDescription.trim(),
        newPlaylistVibe.trim() || undefined
      );
      if (result) {
        toast.success(`Created "${newPlaylistName}"`);
        // Show seed suggestion prompt
        setNewlyCreatedPlaylist({ playlist: result.playlist, description: generatedDescription });
        // Reset form but keep isCreating true to show the seed prompt
        setNewPlaylistName('');
        setNewPlaylistVibe('');
        setGeneratedDescription('');
      }
    } catch {
      toast.error('Failed to create playlist');
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  function handleDismissNewPlaylist() {
    setNewlyCreatedPlaylist(null);
    setIsCreating(false);
  }

  async function handleSeedNewPlaylist() {
    if (!newlyCreatedPlaylist || !onCheckPastSongs) return;

    // Find the local playlist that was just created
    const localPlaylist = localPlaylists?.find(
      (p) => p.spotifyPlaylistId === newlyCreatedPlaylist.playlist.id
    );

    if (localPlaylist) {
      await handleCheckPastSongs(localPlaylist);
    }

    handleDismissNewPlaylist();
  }

  async function handleCheckPastSongs(playlist: LocalPlaylist) {
    if (!onCheckPastSongs) return;

    setBackfillingId(playlist._id);
    try {
      const matches = await onCheckPastSongs(playlist);
      if (matches && matches.length > 0) {
        setPreviewDialog({
          isOpen: true,
          matches,
          playlistName: playlist.name,
          selectedPlaylist: playlist,
          isConfirming: false,
        });
      } else {
        toast.info(`No matching songs found for "${playlist.name}"`);
      }
    } catch {
      toast.error('Failed to check past songs');
    } finally {
      setBackfillingId(null);
    }
  }

  async function handleConfirmBackfill(matches: BackfillMatch[]) {
    const { selectedPlaylist } = previewDialog;
    console.log('[PlaylistManager] Confirming backfill:', {
      playlistName: selectedPlaylist?.name,
      matchCount: matches.length,
    });

    if (!selectedPlaylist || !onConfirmBackfill) {
      console.error('[PlaylistManager] Missing selectedPlaylist or onConfirmBackfill');
      return;
    }

    setPreviewDialog((prev) => ({ ...prev, isConfirming: true }));

    try {
      console.log('[PlaylistManager] Calling onConfirmBackfill');
      await onConfirmBackfill(selectedPlaylist, matches);
      console.log('[PlaylistManager] onConfirmBackfill completed successfully');
      toast.success(`Added ${matches.length} songs to "${selectedPlaylist.name}"`);
      setPreviewDialog({
        isOpen: false,
        matches: [],
        playlistName: '',
        selectedPlaylist: null,
        isConfirming: false,
      });
    } catch (error) {
      console.error('[PlaylistManager] Error during confirm:', error);
      toast.error(`Failed to add songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPreviewDialog((prev) => ({ ...prev, isConfirming: false }));
    }
  }

  function handleCancelBackfill() {
    setPreviewDialog({
      isOpen: false,
      matches: [],
      playlistName: '',
      selectedPlaylist: null,
      isConfirming: false,
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Playlists</CardTitle>
        </CardHeader>
        <CardContent>
          <PlaylistManagerSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ListMusic className="h-5 w-5" />
          Your Playlists
        </CardTitle>
        {!isAdding && !isCreating && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsCreating(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Create New
            </Button>
            <Button size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Existing
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create New Playlist Form */}
        {isCreating && (
          <div className="bg-primary/5 border border-primary/50 border-dashed p-4 rounded-lg space-y-3">
            <p className="font-medium text-sm">Create a new playlist</p>

            <Input
              placeholder="Playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              autoFocus
            />

            <div className="space-y-2">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Describe the vibe (e.g., 'late night drives, melancholy')"
                  value={newPlaylistVibe}
                  onChange={(e) => setNewPlaylistVibe(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleGenerateCreateDescription}
                  disabled={isGeneratingCreate || !newPlaylistVibe.trim()}
                  title="Generate detailed description"
                >
                  {isGeneratingCreate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Enter short notes, then click <Sparkles className="inline h-3 w-3" /> to generate a description
              </p>
            </div>

            {generatedDescription && (
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground text-xs">Generated description:</p>
                <div className="rounded-md bg-muted p-3 text-sm">
                  {generatedDescription}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateCreateDescription}
                  disabled={isGeneratingCreate}
                >
                  {isGeneratingCreate ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3 w-3" />
                  )}
                  Regenerate
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || !generatedDescription.trim() || isSubmittingCreate}
              >
                {isSubmittingCreate ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreating(false);
                  setNewPlaylistName('');
                  setNewPlaylistVibe('');
                  setGeneratedDescription('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Seed Suggestion Prompt - shown after playlist creation */}
        {newlyCreatedPlaylist && (
          <div className="bg-green-500/10 border border-green-500/50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <p className="font-medium text-sm">
                Created &quot;{formatPlaylistName(newlyCreatedPlaylist.playlist.name)}&quot;!
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Want to seed this playlist with songs you&apos;ve already categorized?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSeedNewPlaylist}
                disabled={!onCheckPastSongs || backfillingId !== null}
              >
                {backfillingId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <History className="mr-2 h-4 w-4" />
                )}
                Check Past Songs
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismissNewPlaylist}>
                Skip
              </Button>
            </div>
          </div>
        )}

        {/* Add Existing Playlist Form */}
        {isAdding && (
          <div className="border border-dashed p-4 rounded-lg space-y-3">
            <p className="font-medium text-sm">Add a Spotify playlist</p>

            {/* Spotify Playlist Selector */}
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedSpotifyPlaylist?.id ?? ''}
              onChange={(e) => {
                const playlist = spotifyPlaylists?.find((p) => p.id === e.target.value);
                setSelectedSpotifyPlaylist(playlist ?? null);
              }}
            >
              <option value="">Select a playlist...</option>
              {availableSpotifyPlaylists?.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {formatPlaylistName(playlist.name)} ({playlist.tracks.total} tracks)
                </option>
              ))}
            </select>

            {selectedSpotifyPlaylist && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Describe the vibe (e.g., 'late night drives, melancholy')"
                    value={addUserNotes}
                    onChange={(e) => setAddUserNotes(e.target.value)}
                    autoFocus
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={handleGenerateAddDescription}
                    disabled={isGenerating || !addUserNotes.trim()}
                    title="Generate detailed description"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Enter short notes, then click <Sparkles className="inline h-3 w-3" /> to generate a description
                </p>
              </div>
            )}

            {addGeneratedDescription && (
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground text-xs">Generated description:</p>
                <div className="rounded-md bg-muted p-3 text-sm">
                  {addGeneratedDescription}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateAddDescription}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3 w-3" />
                  )}
                  Regenerate
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddPlaylist}
                disabled={!selectedSpotifyPlaylist || !addGeneratedDescription.trim()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setSelectedSpotifyPlaylist(null);
                  setAddUserNotes('');
                  setAddGeneratedDescription('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Existing Playlists */}
        {!localPlaylists?.length ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No playlists configured yet.</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Add Spotify playlists with mood descriptions to start categorizing songs.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {localPlaylists.map((playlist) => (
              <div
                key={playlist._id}
                className={`rounded-lg border p-3 ${!playlist.isActive ? 'opacity-50' : ''
                  }`}
              >
                {editingId === playlist._id ? (
                  <div className="space-y-3">
                    <p className="font-medium">{formatPlaylistName(playlist.name)}</p>

                    {/* User Notes Input */}
                    <div className="space-y-2">
                      <p className="font-medium text-muted-foreground text-xs">Your notes:</p>
                      <div className="flex gap-2">
                        <Textarea
                          value={editUserNotes}
                          onChange={(e) => setEditUserNotes(e.target.value)}
                          placeholder="Describe the vibe (e.g., 'late night drives, melancholy')"
                          autoFocus
                          rows={2}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={handleGenerateEditDescription}
                          disabled={isGeneratingEdit || !editUserNotes.trim()}
                          title="Generate new description"
                        >
                          {isGeneratingEdit ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Current Description */}
                    <div className="space-y-1">
                      <p className="font-medium text-muted-foreground text-xs">Current description:</p>
                      <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                        {playlist.description}
                      </div>
                    </div>

                    {/* Generated Preview (if regenerated) */}
                    {editGeneratedDescription && (
                      <div className="space-y-1">
                        <p className="font-medium text-muted-foreground text-xs">New description preview:</p>
                        <div className="rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm">
                          {editGeneratedDescription}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(playlist)}
                        disabled={!editGeneratedDescription && editUserNotes === (playlist.userNotes ?? '')}
                      >
                        <Save className="mr-2 h-3 w-3" />
                        {editGeneratedDescription ? 'Accept' : 'Save Notes'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                        <X className="mr-2 h-3 w-3" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{formatPlaylistName(playlist.name)}</p>
                    </div>
                    <div className="flex gap-1">
                      {onCheckPastSongs && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => handleCheckPastSongs(playlist)}
                                disabled={backfillingId === playlist._id}
                              >
                                {backfillingId === playlist._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <History className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Check past songs for this playlist
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() =>
                                onToggleActive(playlist._id, !playlist.isActive)
                              }
                            >
                              <Power
                                className={`h-4 w-4 ${playlist.isActive
                                  ? 'text-green-500'
                                  : 'text-muted-foreground'
                                  }`}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {playlist.isActive ? 'Disable' : 'Enable'} for suggestions
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(playlist)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDeletePlaylist(playlist._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Backfill Preview Dialog */}
      <BackfillPreviewDialog
        isOpen={previewDialog.isOpen}
        matches={previewDialog.matches}
        playlistName={previewDialog.playlistName}
        isLoading={previewDialog.isConfirming}
        playerState={playerState}
        onTogglePlayback={onTogglePlayback}
        onConfirm={handleConfirmBackfill}
        onCancel={handleCancelBackfill}
      />
    </Card>
  );
}

function PlaylistManagerSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <Skeleton className="mb-2 h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}


'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Music } from 'lucide-react';
import { api as convexApi } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

import { SpotifyConnection } from './_components/spotify-connection';
import { TracksPanel } from './_components/tracks-panel';
import { SongReviewCard } from './_components/song-review-card';
import { PlaylistSuggestions } from './_components/playlist-suggestions';
import { PlaylistManager } from './_components/playlist-manager';
import { MiniPlayer } from './_components/mini-player';
import { type BackfillMatch } from './_components/backfill-preview-dialog';
import { formatPlaylistName } from './_utils/formatters';
import type {
  RecentlyPlayedItem,
  SavedTrackItem,
  SpotifyPlaylist,
  SpotifyTrack,
  PlaylistSuggestion,
  LocalPlaylist,
  ReviewState,
} from './_utils/types';
import { useSpotifyAuth } from '~/lib/hooks/use-spotify-auth';
import { useSyncHistory } from '~/lib/hooks/use-sync-history';
import { SyncAlbumsButton } from '~/components/sync-albums-button';
import { LoginPrompt } from '~/components/login-prompt';
import { useSpotifyPlayer } from './_hooks/use-spotify-player';

export default function SpotifyPlaylisterPage() {
  const { userId, isLoading: authLoading, connection, isConnected, getValidAccessToken } = useSpotifyAuth();

  // Sync history hook for album detection
  const { isSyncing: isSyncingHistory, syncHistory: handleSyncHistory } = useSyncHistory({
    userId,
    isConnected,
    getValidAccessToken,
  });

  // Convex queries
  const localPlaylists = useQuery(
    convexApi.spotify.getPlaylists,
    userId ? { userId } : 'skip'
  );
  const activePlaylists = useQuery(
    convexApi.spotify.getActivePlaylists,
    userId ? { userId } : 'skip'
  );
  const categorizations = useQuery(
    convexApi.spotify.getCategorizations,
    userId ? { userId } : 'skip'
  );
  // Persisted track history from Convex
  const recentTracksFromDb = useQuery(
    convexApi.spotify.getRecentlyPlayedTracks,
    userId ? { userId } : 'skip'
  );
  const likedTracksFromDb = useQuery(
    convexApi.spotify.getLikedTracksHistory,
    userId ? { userId } : 'skip'
  );

  // Convex mutations
  const deleteConnection = useMutation(convexApi.spotify.deleteConnection);
  const upsertPlaylist = useMutation(convexApi.spotify.upsertPlaylist);
  const updatePlaylistDescription = useMutation(convexApi.spotify.updatePlaylistDescription);
  const togglePlaylistActive = useMutation(convexApi.spotify.togglePlaylistActive);
  const deletePlaylist = useMutation(convexApi.spotify.deletePlaylist);
  const saveCategorization = useMutation(convexApi.spotify.saveCategorization);
  const savePendingSuggestions = useMutation(convexApi.spotify.savePendingSuggestions);
  const clearPendingSuggestions = useMutation(convexApi.spotify.clearPendingSuggestions);
  const upsertTracksFromRecentlyPlayed = useMutation(convexApi.spotify.upsertTracksFromRecentlyPlayed);
  const upsertTracksFromLiked = useMutation(convexApi.spotify.upsertTracksFromLiked);

  // Local state
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[] | undefined>();
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isLoadingLiked, setIsLoadingLiked] = useState(false);
  const [currentlyPlayingTrack, setCurrentlyPlayingTrack] = useState<SpotifyTrack | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<RecentlyPlayedItem | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({ status: 'idle' });
  const [userInput, setUserInput] = useState('');
  const [pendingSuggestionsCache, setPendingSuggestionsCache] = useState<Map<string, { userInput: string; suggestions: PlaylistSuggestion[] }>>(new Map());

  // Derive categorized track IDs from track data (lastCategorizedAt timestamp)
  const categorizedTrackIds = new Set(
    [...(recentTracksFromDb ?? []), ...(likedTracksFromDb ?? [])]
      .filter((t) => t.lastCategorizedAt !== undefined)
      .map((t) => t.trackId)
  );

  // Convert Convex track data to UI format, with currently playing at top
  const recentTracks: RecentlyPlayedItem[] | undefined = (() => {
    const dbTracks = recentTracksFromDb?.map((t) => ({
      track: t.trackData ? JSON.parse(t.trackData) as SpotifyTrack : createMinimalTrackFromDb(t),
      played_at: new Date(t.lastPlayedAt ?? t.lastSeenAt).toISOString(),
    }));

    if (!dbTracks) return undefined;

    // If we have a currently playing track, add it to the top if not already there
    if (currentlyPlayingTrack) {
      const isAlreadyInList = dbTracks.some((t) => t.track.id === currentlyPlayingTrack.id);
      if (!isAlreadyInList) {
        return [
          { track: currentlyPlayingTrack, played_at: new Date().toISOString() },
          ...dbTracks,
        ];
      }
    }

    return dbTracks;
  })();

  const likedTracks: SavedTrackItem[] | undefined = likedTracksFromDb?.map((t) => ({
    track: t.trackData ? JSON.parse(t.trackData) as SpotifyTrack : createMinimalTrackFromDb(t),
    added_at: new Date(t.lastLikedAt ?? t.lastSeenAt).toISOString(),
  }));

  // Helper to create minimal track from DB record
  function createMinimalTrackFromDb(t: { trackId: string; trackName: string; artistName: string; albumName?: string; albumImageUrl?: string }): SpotifyTrack {
    return {
      id: t.trackId,
      name: t.trackName,
      artists: [{ id: '', name: t.artistName }],
      album: {
        id: '',
        name: t.albumName ?? '',
        images: t.albumImageUrl ? [{ url: t.albumImageUrl, height: 300, width: 300 }] : [],
      },
      duration_ms: 0,
      external_urls: { spotify: `https://open.spotify.com/track/${t.trackId}` },
      preview_url: null,
    };
  }

  // Query for pending suggestions (after selectedTrack state is declared)
  const getPendingSuggestions = useQuery(
    convexApi.spotify.getPendingSuggestions,
    selectedTrack ? { trackId: selectedTrack.track.id } : 'skip'
  );

  // Spotify Web Playback SDK - only enable when connected
  const { state: playerState, togglePlayback, skip } = useSpotifyPlayer(getValidAccessToken, isConnected);

  // Fetch recent tracks and currently playing when connected, upsert to Convex
  const fetchRecentTracks = useCallback(async () => {
    if (!connection || !userId) return;

    setIsLoadingTracks(true);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Fetch both recent tracks and currently playing in parallel
      const [recentRes, currentlyPlayingRes] = await Promise.all([
        fetch('/api/spotify/recent-tracks', {
          headers: { 'X-Access-Token': accessToken },
        }),
        fetch('/api/spotify/currently-playing', {
          headers: { 'X-Access-Token': accessToken },
        }),
      ]);

      if (!recentRes.ok) {
        throw new Error('Failed to fetch recent tracks');
      }

      const recentData = await recentRes.json();
      const items = recentData.items as RecentlyPlayedItem[];

      // Handle currently playing (may be null if nothing is playing)
      if (currentlyPlayingRes.ok) {
        const cpData = await currentlyPlayingRes.json();
        if (cpData.currentlyPlaying?.item) {
          setCurrentlyPlayingTrack(cpData.currentlyPlaying.item as SpotifyTrack);

          // Also upsert the currently playing track
          const cpTrack = cpData.currentlyPlaying.item as SpotifyTrack;
          await upsertTracksFromRecentlyPlayed({
            userId,
            items: [{
              trackId: cpTrack.id,
              trackName: cpTrack.name,
              artistName: cpTrack.artists.map((a) => a.name).join(', '),
              albumName: cpTrack.album.name,
              albumImageUrl: cpTrack.album.images?.[0]?.url,
              spotifyAlbumId: cpTrack.album.id,
              trackData: JSON.stringify(cpTrack),
              playedAt: Date.now(),
            }],
          });
        } else {
          setCurrentlyPlayingTrack(null);
        }
      }

      // Upsert recent tracks to Convex for persistence
      await upsertTracksFromRecentlyPlayed({
        userId,
        items: items.map((item) => ({
          trackId: item.track.id,
          trackName: item.track.name,
          artistName: item.track.artists.map((a) => a.name).join(', '),
          albumName: item.track.album.name,
          albumImageUrl: item.track.album.images?.[0]?.url,
          spotifyAlbumId: item.track.album.id,
          trackData: JSON.stringify(item.track),
          playedAt: Date.parse(item.played_at),
        })),
      });
    } catch (error) {
      console.error('Error fetching recent tracks:', error);
      toast.error('Failed to fetch recent tracks');
    } finally {
      setIsLoadingTracks(false);
    }
  }, [connection, userId, getValidAccessToken, upsertTracksFromRecentlyPlayed]);

  // Fetch liked tracks when connected and upsert to Convex
  const fetchLikedTracks = useCallback(async () => {
    if (!connection || !userId) return;

    setIsLoadingLiked(true);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const res = await fetch('/api/spotify/liked-tracks', {
        headers: {
          'X-Access-Token': accessToken,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch liked tracks');
      }

      const data = await res.json();
      const items = data.items as SavedTrackItem[];

      // Upsert to Convex for persistence
      await upsertTracksFromLiked({
        userId,
        items: items.map((item) => ({
          trackId: item.track.id,
          trackName: item.track.name,
          artistName: item.track.artists.map((a) => a.name).join(', '),
          albumName: item.track.album.name,
          albumImageUrl: item.track.album.images?.[0]?.url,
          spotifyAlbumId: item.track.album.id,
          trackData: JSON.stringify(item.track),
          addedAt: Date.parse(item.added_at),
        })),
      });
    } catch (error) {
      console.error('Error fetching liked tracks:', error);
      toast.error('Failed to fetch liked tracks');
    } finally {
      setIsLoadingLiked(false);
    }
  }, [connection, userId, getValidAccessToken, upsertTracksFromLiked]);

  // Fetch user playlists
  const fetchSpotifyPlaylists = useCallback(async () => {
    if (!connection) return;

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const res = await fetch('/api/spotify/playlists', {
        headers: {
          'X-Access-Token': accessToken,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch playlists');
      }

      const data = await res.json();
      setSpotifyPlaylists(data.items);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  }, [connection, getValidAccessToken]);

  // Initial data fetch
  useEffect(() => {
    if (isConnected) {
      fetchRecentTracks();
      fetchLikedTracks();
      fetchSpotifyPlaylists();
    }
  }, [isConnected, fetchRecentTracks, fetchLikedTracks, fetchSpotifyPlaylists]);

  // Load pending suggestions from Convex when track changes
  useEffect(() => {
    if (getPendingSuggestions && selectedTrack) {
      const cached = pendingSuggestionsCache.get(selectedTrack.track.id);
      // If not in cache, update cache from Convex query result
      if (!cached && getPendingSuggestions) {
        setPendingSuggestionsCache((prev) => new Map(prev).set(selectedTrack.track.id, {
          userInput: getPendingSuggestions.userInput,
          suggestions: getPendingSuggestions.suggestions as PlaylistSuggestion[],
        }));
      }
    }
  }, [getPendingSuggestions, selectedTrack, pendingSuggestionsCache]);

  // Derive current playing track from player state
  const currentPlayingTrack = (() => {
    if (!playerState.currentTrackId) return null;
    const fromRecent = recentTracks?.find((t) => t.track.id === playerState.currentTrackId);
    if (fromRecent) return fromRecent.track;
    const fromLiked = likedTracks?.find((t) => t.track.id === playerState.currentTrackId);
    if (fromLiked) return fromLiked.track;
    // If currently selected track matches, use that
    if (selectedTrack?.track.id === playerState.currentTrackId) return selectedTrack.track;
    return null;
  })();

  // Handle disconnect
  async function handleDisconnect() {
    if (!userId) return;
    try {
      await deleteConnection({ userId });
      setSpotifyPlaylists(undefined);
      toast.success('Disconnected from Spotify');
    } catch {
      toast.error('Failed to disconnect');
    }
  }

  // Handle track selection
  function handleSelectTrack(item: RecentlyPlayedItem) {
    // Don't reset if it's the same track and we're already showing it
    if (selectedTrack?.track.id === item.track.id && reviewState.status !== 'idle') {
      return;
    }

    setSelectedTrack(item);

    // Check for pending suggestions in cache
    const cached = pendingSuggestionsCache.get(item.track.id);
    if (cached) {
      setUserInput(cached.userInput);
      setReviewState({ status: 'suggestions', suggestions: cached.suggestions });
    } else {
      setReviewState({ status: 'input' });
      setUserInput('');
    }
  }

  // Handle liked track selection
  function handleSelectLikedTrack(item: SavedTrackItem) {
    // Don't reset if it's the same track and we're already showing it
    if (selectedTrack?.track.id === item.track.id && reviewState.status !== 'idle') {
      return;
    }

    // Convert to RecentlyPlayedItem format for consistency
    const asRecentlyPlayed: RecentlyPlayedItem = {
      track: item.track,
      played_at: item.added_at,
    };
    setSelectedTrack(asRecentlyPlayed);

    // Check for pending suggestions in cache
    const cached = pendingSuggestionsCache.get(item.track.id);
    if (cached) {
      setUserInput(cached.userInput);
      setReviewState({ status: 'suggestions', suggestions: cached.suggestions });
    } else {
      setReviewState({ status: 'input' });
      setUserInput('');
    }
  }

  // Handle selecting a categorized track for re-categorization
  function handleSelectCategorizedTrack(cat: {
    trackId: string;
    trackName: string;
    artistName: string;
    albumName?: string;
    albumImageUrl?: string;
    trackData?: string;
    userInput: string;
  }) {
    // Don't reset if it's the same track and we're already showing it
    if (selectedTrack?.track.id === cat.trackId && reviewState.status !== 'idle') {
      return;
    }

    // Use full track data if available, otherwise create minimal object
    let track: SpotifyTrack;

    if (cat.trackData) {
      try {
        track = JSON.parse(cat.trackData) as SpotifyTrack;
      } catch {
        track = createMinimalTrack(cat);
      }
    } else {
      track = createMinimalTrack(cat);
    }

    setSelectedTrack({ track, played_at: '' });

    // Check for pending suggestions in cache, otherwise prefill with previous input
    const cached = pendingSuggestionsCache.get(cat.trackId);
    if (cached) {
      setUserInput(cached.userInput);
      setReviewState({ status: 'suggestions', suggestions: cached.suggestions });
    } else {
      setUserInput(cat.userInput);
      setReviewState({ status: 'input' });
    }
  }

  // Helper to create minimal track object for legacy saved tracks
  function createMinimalTrack(saved: {
    trackId: string;
    trackName: string;
    artistName: string;
    albumName?: string;
    albumImageUrl?: string;
  }): SpotifyTrack {
    return {
      id: saved.trackId,
      name: saved.trackName,
      artists: [{ id: '', name: saved.artistName }],
      album: {
        id: '',
        name: saved.albumName ?? '',
        images: saved.albumImageUrl ? [{ url: saved.albumImageUrl, height: 300, width: 300 }] : [],
      },
      duration_ms: 0,
      external_urls: { spotify: `https://open.spotify.com/track/${saved.trackId}` },
      preview_url: null,
    };
  }

  // Handle categorization submission
  async function handleSubmitCategorization(input: string) {
    if (!selectedTrack || !activePlaylists?.length) return;

    setUserInput(input);
    setReviewState({ status: 'loading' });

    try {
      const res = await fetch('/api/spotify/categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackName: selectedTrack.track.name,
          artistName: selectedTrack.track.artists.map((a) => a.name).join(', '),
          albumName: selectedTrack.track.album.name,
          userInput: input,
          playlists: activePlaylists.map((p) => ({
            id: p.spotifyPlaylistId,
            name: p.name,
            description: p.description,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to get suggestions');
      }

      const data = await res.json();
      setReviewState({
        status: 'suggestions',
        suggestions: data.suggestedPlaylists,
      });

      // Save suggestions to Convex and cache
      if (selectedTrack && userId) {
        try {
          await savePendingSuggestions({
            userId,
            trackId: selectedTrack.track.id,
            userInput: input,
            suggestions: data.suggestedPlaylists,
          });
          // Also update local cache for instant access
          setPendingSuggestionsCache((prev) => new Map(prev).set(selectedTrack.track.id, {
            userInput: input,
            suggestions: data.suggestedPlaylists as PlaylistSuggestion[],
          }));
        } catch (error) {
          console.error('Failed to save pending suggestions:', error);
        }
      }
    } catch (error) {
      console.error('Categorization error:', error);
      toast.error('Failed to get AI suggestions');
      setReviewState({ status: 'input' });
    }
  }

  // Handle confirm selections
  async function handleConfirmSelections(selectedPlaylistIds: string[]) {
    if (!selectedTrack || !userId || !connection) return;

    setReviewState({ status: 'saving' });

    try {
      // Add to Spotify playlists
      if (selectedPlaylistIds.length > 0) {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          throw new Error('No valid access token');
        }

        const res = await fetch('/api/spotify/add-to-playlists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Token': accessToken,
          },
          body: JSON.stringify({
            trackId: selectedTrack.track.id,
            playlistIds: selectedPlaylistIds,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to add to playlists');
        }
      }

      // Save categorization to Convex
      const suggestions =
        reviewState.status === 'suggestions' ? reviewState.suggestions : [];

      await saveCategorization({
        userId,
        trackId: selectedTrack.track.id,
        trackName: selectedTrack.track.name,
        artistName: selectedTrack.track.artists.map((a) => a.name).join(', '),
        albumName: selectedTrack.track.album.name,
        albumImageUrl: selectedTrack.track.album.images[0]?.url,
        trackData: JSON.stringify(selectedTrack.track),
        userInput,
        aiSuggestions: suggestions,
        finalSelections: selectedPlaylistIds,
      });

      // Clear pending suggestions after successful confirmation
      await clearPendingSuggestions({ trackId: selectedTrack.track.id });
      setPendingSuggestionsCache((prev) => {
        const next = new Map(prev);
        next.delete(selectedTrack.track.id);
        return next;
      });

      toast.success(
        selectedPlaylistIds.length > 0
          ? `Added to ${selectedPlaylistIds.length} playlist${selectedPlaylistIds.length !== 1 ? 's' : ''}`
          : 'Categorization saved (no playlists selected)'
      );

      // Reset state
      setSelectedTrack(null);
      setReviewState({ status: 'idle' });
      setUserInput('');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save');
      setReviewState({
        status: 'suggestions',
        suggestions:
          reviewState.status === 'suggestions' ? reviewState.suggestions : [],
      });
    }
  }

  // Handle cancel
  function handleCancel() {
    setSelectedTrack(null);
    setReviewState({ status: 'idle' });
    setUserInput('');
  }

  // Playlist management handlers
  async function handleAddPlaylist(spotifyPlaylist: SpotifyPlaylist, description: string, userNotes?: string) {
    console.log('handleAddPlaylist called', { userId, spotifyPlaylist, description, userNotes });
    if (!userId) {
      console.error('No userId, cannot add playlist');
      toast.error('Not logged in');
      return;
    }

    try {
      console.log('Calling upsertPlaylist mutation...');
      await upsertPlaylist({
        userId,
        spotifyPlaylistId: spotifyPlaylist.id,
        name: spotifyPlaylist.name,
        description,
        userNotes,
        imageUrl: spotifyPlaylist.images?.[0]?.url,
      });
      console.log('Playlist added successfully');
      toast.success(`Added "${spotifyPlaylist.name}" playlist`);
    } catch (error) {
      console.error('Failed to add playlist:', error);
      toast.error('Failed to add playlist');
    }
  }

  // Create a brand new playlist on Spotify and save locally
  async function handleCreatePlaylist(name: string, description: string, userNotes?: string): Promise<{ playlist: SpotifyPlaylist } | null> {
    if (!userId || !connection) {
      toast.error('Not connected to Spotify');
      return null;
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      toast.error('Could not get access token');
      return null;
    }

    try {
      // Create on Spotify (without description - it's too long, we only store it locally)
      const res = await fetch('/api/spotify/create-playlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Token': accessToken,
        },
        body: JSON.stringify({
          spotifyUserId: connection.spotifyUserId,
          name,
          // Don't send description to Spotify - it's only for local use
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to create playlist on Spotify');
      }

      const data = await res.json();
      const playlist = data.playlist as SpotifyPlaylist;

      // Save locally
      await upsertPlaylist({
        userId,
        spotifyPlaylistId: playlist.id,
        name: playlist.name,
        description,
        userNotes,
        imageUrl: playlist.images?.[0]?.url,
      });

      // Refresh playlist list
      fetchSpotifyPlaylists();

      return { playlist };
    } catch (error) {
      console.error('Failed to create playlist:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist';
      toast.error(errorMessage);
      return null;
    }
  }

  async function handleUpdateDescription(playlistId: string, description: string, userNotes?: string) {
    try {
      await updatePlaylistDescription({
        playlistId: playlistId as Id<'spotifyPlaylists'>,
        description,
        userNotes,
      });
      toast.success('Description updated');
    } catch {
      toast.error('Failed to update description');
    }
  }

  async function handleToggleActive(playlistId: string, isActive: boolean) {
    try {
      await togglePlaylistActive({
        playlistId: playlistId as Id<'spotifyPlaylists'>,
        isActive,
      });
    } catch {
      toast.error('Failed to toggle playlist');
    }
  }

  async function handleDeletePlaylist(playlistId: string) {
    try {
      await deletePlaylist({
        playlistId: playlistId as Id<'spotifyPlaylists'>,
      });
      toast.success('Playlist removed');
    } catch {
      toast.error('Failed to remove playlist');
    }
  }

  // Handle backfill - check past songs for a playlist (returns matches for preview)
  async function handleCheckPastSongs(playlist: LocalPlaylist): Promise<BackfillMatch[] | null> {
    console.log('[Backfill] Starting check for playlist:', playlist.name);

    if (!categorizations?.length) {
      console.log('[Backfill] No categorizations found');
      toast.info('No categorized songs to check');
      return null;
    }

    console.log('[Backfill] Found', categorizations.length, 'categorizations');
    console.log('[Backfill] Sample categorizations:', categorizations.slice(0, 3).map((c) => ({
      trackId: c.trackId,
      trackName: c.trackName,
    })));

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.error('[Backfill] Failed to get access token');
      toast.error('Not authenticated');
      return null;
    }

    console.log('[Backfill] Got access token');

    try {
      toast.info(`Checking ${categorizations.length} songs...`);

      const requestBody = {
        playlist: {
          id: playlist.spotifyPlaylistId,
          name: playlist.name,
          description: playlist.description,
        },
        categorizations: categorizations.map((c) => ({
          trackId: c.trackId,
          trackName: c.trackName,
          artistName: c.artistName,
          userInput: c.userInput,
        })),
        accessToken,
        dryRun: true, // Get matches without adding to Spotify
      };

      console.log('[Backfill] Sending request to API:', {
        playlistId: playlist.spotifyPlaylistId,
        categorizationCount: categorizations.length,
      });

      const res = await fetch('/api/spotify/backfill-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('[Backfill] API response status:', res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Backfill] API error response:', errorText);
        throw new Error('Failed to check past songs');
      }

      const data = await res.json();
      console.log('[Backfill] API returned matches:', data.matches?.length || 0);
      console.log('[Backfill] Sample matches:', data.matches?.slice(0, 3).map((m: BackfillMatch) => ({
        trackId: m.trackId,
        trackName: m.trackName,
      })));
      return data.matches || [];
    } catch (error) {
      console.error('[Backfill] Error during check:', error);
      toast.error('Failed to check past songs');
      return null;
    }
  }

  // Handle confirm backfill - add matched songs to the playlist
  async function handleConfirmBackfill(playlist: LocalPlaylist, matches: BackfillMatch[]) {
    console.log('[Backfill] Starting confirm for playlist:', playlist.name, 'matches:', matches.length);

    if (!categorizations?.length || !matches.length) {
      console.warn('[Backfill] Early exit - categorizations:', categorizations?.length, 'matches:', matches.length);
      return;
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.error('[Backfill] Failed to get access token for confirm');
      toast.error('Not authenticated');
      return;
    }

    console.log('[Backfill] Got access token for confirm');

    try {
      // Validate all track IDs are proper Spotify format
      const isValidSpotifyId = (id: string) => /^[a-zA-Z0-9]{22}$/.test(id);
      const invalidMatches = matches.filter((m) => !isValidSpotifyId(m.trackId));

      if (invalidMatches.length > 0) {
        console.error('[Backfill] Found invalid Spotify track IDs:', invalidMatches.map((m) => ({
          trackId: m.trackId,
          trackName: m.trackName,
        })));
        toast.error(`Cannot add ${invalidMatches.length} track(s) with invalid IDs`);
        return;
      }

      // Add matching tracks to Spotify in batches of 100
      const trackUris = matches.map((m) => `spotify:track:${m.trackId}`);
      console.log('[Backfill] Creating', trackUris.length, 'track URIs');
      console.log('[Backfill] Sample URIs:', trackUris.slice(0, 3));

      let totalAdded = 0;

      for (let i = 0; i < trackUris.length; i += 100) {
        const batch = trackUris.slice(i, i + 100);
        const batchNum = Math.floor(i / 100) + 1;
        console.log(`[Backfill] Adding batch ${batchNum}/${Math.ceil(trackUris.length / 100)} with ${batch.length} tracks`);

        const url = `https://api.spotify.com/v1/playlists/${playlist.spotifyPlaylistId}/tracks`;
        console.log('[Backfill] Request URL:', url);
        console.log('[Backfill] Authorization header present:', !!accessToken);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: batch }),
        });

        console.log(`[Backfill] Batch ${batchNum} response status:`, res.status);

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`[Backfill] Batch ${batchNum} error response:`, errorText);
          throw new Error(`Failed to add tracks to Spotify (batch ${batchNum}): ${res.status}`);
        }

        const responseData = await res.json();
        console.log(`[Backfill] Batch ${batchNum} response:`, responseData);
        totalAdded += batch.length;
      }

      console.log('[Backfill] Successfully added', totalAdded, 'songs to playlist');
      toast.success(`Added ${matches.length} songs to "${formatPlaylistName(playlist.name)}"`);
    } catch (error) {
      console.error('[Backfill] Error during confirm:', error);
      toast.error(`Failed to add songs to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (authLoading) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <LoginPrompt
        icon={Music}
        message="Please log in to use Spotify Playlister"
        redirectPath="/spotify-playlister"
      />
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-bold text-3xl">Spotify Playlister</h1>
          <p className="mt-2 text-muted-foreground">
            Categorize your recently played songs into playlists using AI
          </p>
        </div>
        {isConnected && (
          <div className="flex items-center gap-4">
            <SyncAlbumsButton
              isSyncing={isSyncingHistory}
              onSync={handleSyncHistory}
              variant="ghost"
            />
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-muted-foreground text-sm hover:text-foreground hover:underline"
            >
              Disconnect Spotify
            </button>
          </div>
        )}
      </div>

      {/* Spotify Connection (only shows when not connected) */}
      <SpotifyConnection
        isConnected={isConnected}
        displayName={connection?.displayName}
        onDisconnect={handleDisconnect}
      />

      {isConnected && (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Main Content */}
          <div className="space-y-6">
            {/* Song Review / Suggestions */}
            {selectedTrack && reviewState.status !== 'idle' && (
              <>
                {(reviewState.status === 'input' || reviewState.status === 'loading') && (
                  <SongReviewCard
                    track={selectedTrack.track}
                    reviewState={reviewState}
                    initialInput={userInput}
                    playerState={playerState}
                    onTogglePlayback={togglePlayback}
                    onSubmit={handleSubmitCategorization}
                    onCancel={handleCancel}
                  />
                )}

                {(reviewState.status === 'suggestions' || reviewState.status === 'saving') && (
                  <PlaylistSuggestions
                    track={selectedTrack.track}
                    userInput={userInput}
                    suggestions={reviewState.status === 'suggestions' ? reviewState.suggestions : []}
                    playlists={(localPlaylists ?? []) as LocalPlaylist[]}
                    isSaving={reviewState.status === 'saving'}
                    onConfirm={handleConfirmSelections}
                    onCancel={handleCancel}
                  />
                )}
              </>
            )}

            {/* Playlist Manager */}
            <PlaylistManager
              localPlaylists={localPlaylists as LocalPlaylist[] | undefined}
              spotifyPlaylists={spotifyPlaylists}
              isLoading={!localPlaylists}
              onAddPlaylist={handleAddPlaylist}
              onCreatePlaylist={handleCreatePlaylist}
              onUpdateDescription={handleUpdateDescription}
              onToggleActive={handleToggleActive}
              onDeletePlaylist={handleDeletePlaylist}
              onCheckPastSongs={handleCheckPastSongs}
              onConfirmBackfill={handleConfirmBackfill}
              playerState={playerState}
              onTogglePlayback={togglePlayback}
            />
          </div>

          {/* Sidebar */}
          <div>
            <TracksPanel
              recentTracks={recentTracks}
              likedTracks={likedTracks}
              categorizedTracks={categorizations}
              isLoadingRecent={isLoadingTracks}
              isLoadingLiked={isLoadingLiked}
              isLoadingCategorized={categorizations === undefined}
              selectedTrackId={selectedTrack?.track.id ?? null}
              nowPlayingTrackId={currentlyPlayingTrack?.id ?? null}
              categorizedTrackIds={categorizedTrackIds}
              playerState={playerState}
              onTogglePlayback={togglePlayback}
              onSelectRecentTrack={handleSelectTrack}
              onSelectLikedTrack={handleSelectLikedTrack}
              onRefresh={fetchRecentTracks}
              onRefreshLiked={fetchLikedTracks}
              onSelectCategorizedTrack={handleSelectCategorizedTrack}
            />
          </div>
        </div>
      )}

      {/* Global mini-player */}
      <MiniPlayer
        playerState={playerState}
        currentTrack={currentPlayingTrack}
        onTogglePlayback={togglePlayback}
        onSkip={skip}
      />
    </div>
  );
}


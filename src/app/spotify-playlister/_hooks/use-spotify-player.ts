'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PlayerState } from '../_utils/types';

type UseSpotifyPlayerReturn = {
  state: PlayerState;
  play: (trackUri: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  togglePlayback: (trackUri: string) => void;
  skip: (seconds: number) => void;
};

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

type SpotifyPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (state: unknown) => void) => void;
  removeListener: (event: string) => void;
  getCurrentState: () => Promise<PlaybackState | null>;
  setName: (name: string) => void;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (position_ms: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  activateElement: () => Promise<void>;
};

type PlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      uri: string;
      name: string;
      artists: Array<{ name: string }>;
    };
  };
};

export function useSpotifyPlayer(
  getAccessToken: () => Promise<string | null>,
  enabled: boolean
): UseSpotifyPlayerReturn {
  const [state, setState] = useState<PlayerState>({
    isReady: false,
    isPlaying: false,
    isPending: false,
    pendingTrackId: null,
    currentTrackId: null,
    position: 0,
    duration: 0,
    error: null,
  });

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const tokenGetterRef = useRef(getAccessToken);

  // Keep token getter up to date
  useEffect(() => {
    tokenGetterRef.current = getAccessToken;
  }, [getAccessToken]);

  // Load SDK and initialize player
  useEffect(() => {
    if (!enabled) {
      console.log('Spotify player not enabled (waiting for auth)');
      return;
    }

    let player: SpotifyPlayer | null = null;

    function initializePlayer() {
      console.log('Initializing Spotify player...');
      
      player = new window.Spotify.Player({
        name: 'Playlister Web Player',
        getOAuthToken: async (cb) => {
          console.log('Getting OAuth token...');
          try {
            const token = await tokenGetterRef.current();
            console.log('Token received:', token ? 'yes' : 'no');
            if (token) cb(token);
          } catch (err) {
            console.error('Error getting token:', err);
          }
        },
        volume: 0.5,
      });

      // Error handling
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Initialization error:', message);
        setState((s) => ({ ...s, error: `Init: ${message}` }));
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Authentication error:', message);
        setState((s) => ({ ...s, error: 'Premium required for playback' }));
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Account error:', message);
        setState((s) => ({ ...s, error: 'Premium account required' }));
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Playback error:', message);
        setState((s) => ({ ...s, error: message }));
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify Player ready with device ID:', device_id);
        deviceIdRef.current = device_id;
        setState((s) => ({ ...s, isReady: true, error: null }));
      });

      // Not ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline:', device_id);
        setState((s) => ({ ...s, isReady: false }));
      });

      // Playback state changes
      player.addListener('player_state_changed', (playbackState: PlaybackState | null) => {
        if (!playbackState) {
          setState((s) => ({
            ...s,
            isPlaying: false,
            isPending: false,
            pendingTrackId: null,
            currentTrackId: null,
            position: 0,
            duration: 0,
          }));
          return;
        }

        setState((s) => ({
          ...s,
          isPlaying: !playbackState.paused,
          isPending: false,
          pendingTrackId: null,
          currentTrackId: playbackState.track_window.current_track.id,
          position: playbackState.position,
          duration: playbackState.duration,
        }));
      });

      player.connect().then((success) => {
        if (success) {
          console.log('Spotify player connected successfully');
        } else {
          console.error('Spotify player failed to connect');
          setState((s) => ({ ...s, error: 'Failed to connect player' }));
        }
      });
      
      playerRef.current = player;
    }

    // Check if SDK is already loaded
    if (window.Spotify) {
      console.log('Spotify SDK already loaded');
      initializePlayer();
    } else {
      console.log('Loading Spotify SDK...');
      // Load the SDK script
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);

      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('Spotify SDK ready');
        initializePlayer();
      };
    }

    return () => {
      if (player) {
        console.log('Disconnecting Spotify player');
        player.disconnect();
      }
    };
  }, [enabled]);

  const play = useCallback(async (trackUri: string) => {
    if (!deviceIdRef.current) {
      console.error('No device ID available');
      return;
    }

    const trackId = trackUri.replace('spotify:track:', '');
    
    // Set pending state immediately for visual feedback
    setState((s) => ({ ...s, isPending: true, pendingTrackId: trackId }));

    const token = await tokenGetterRef.current();
    if (!token) {
      console.error('No access token');
      setState((s) => ({ ...s, isPending: false, pendingTrackId: null }));
      return;
    }

    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: [trackUri],
        }),
      });
    } catch (error) {
      console.error('Play error:', error);
      setState((s) => ({ ...s, isPending: false, pendingTrackId: null }));
    }
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    playerRef.current?.resume();
  }, []);

  const togglePlayback = useCallback(
    (trackUri: string) => {
      const trackId = trackUri.replace('spotify:track:', '');
      if (state.currentTrackId === trackId && state.isPlaying) {
        pause();
      } else if (state.currentTrackId === trackId && !state.isPlaying) {
        resume();
      } else {
        play(trackUri);
      }
    },
    [state.currentTrackId, state.isPlaying, play, pause, resume]
  );

  const skip = useCallback((seconds: number) => {
    playerRef.current?.seek((state.position || 0) + seconds * 1000);
  }, [state.position]);

  return {
    state,
    play,
    pause,
    resume,
    togglePlayback,
    skip,
  };
}


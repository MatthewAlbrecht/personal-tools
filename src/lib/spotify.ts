import { env } from '~/env.js';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// ============================================================================
// Types
// ============================================================================

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  duration_ms: number;
  external_urls: { spotify: string };
  preview_url: string | null;
};

export type RecentlyPlayedItem = {
  track: SpotifyTrack;
  played_at: string;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description: string | null;
  images: Array<{ url: string; height: number | null; width: number | null }>;
  owner: { id: string; display_name: string };
  tracks: { total: number };
  external_urls: { spotify: string };
};

export type SavedTrackItem = {
  added_at: string;
  track: SpotifyTrack;
};

export type TokenRefreshResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

// ============================================================================
// Token Management
// ============================================================================

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json() as Promise<TokenRefreshResult>;
}

// ============================================================================
// API Helpers
// ============================================================================

async function spotifyFetch<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${error}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Recently Played
// ============================================================================

export async function getRecentlyPlayed(
  accessToken: string,
  limit = 50
): Promise<RecentlyPlayedItem[]> {
  const data = await spotifyFetch<{ items: RecentlyPlayedItem[] }>(
    `/me/player/recently-played?limit=${limit}`,
    accessToken
  );
  return data.items;
}

// ============================================================================
// Liked Songs (Saved Tracks)
// ============================================================================

export type LikedTracksResponse = {
  items: SavedTrackItem[];
  total: number;
  offset: number;
};

export async function getLikedTracks(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<LikedTracksResponse> {
  const data = await spotifyFetch<{ items: SavedTrackItem[]; total: number }>(
    `/me/tracks?limit=${limit}&offset=${offset}`,
    accessToken
  );
  return { items: data.items, total: data.total, offset };
}

// ============================================================================
// Playlists
// ============================================================================

export async function getUserPlaylists(
  accessToken: string,
  limit = 50
): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{ items: SpotifyPlaylist[] }>(
    `/me/playlists?limit=${limit}`,
    accessToken
  );
  return data.items;
}

export async function getPlaylist(
  accessToken: string,
  playlistId: string
): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(`/playlists/${playlistId}`, accessToken);
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[]
): Promise<{ snapshot_id: string }> {
  return spotifyFetch<{ snapshot_id: string }>(
    `/playlists/${playlistId}/tracks`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ uris: trackUris }),
    }
  );
}

export async function createPlaylist(
  accessToken: string,
  userId: string,
  name: string,
  description?: string,
  isPublic = false
): Promise<SpotifyPlaylist> {
  // Use /me/playlists endpoint which doesn't require explicit user ID
  return spotifyFetch<SpotifyPlaylist>('/me/playlists', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description ?? '',
      public: isPublic,
    }),
  });
}

// ============================================================================
// Track Info
// ============================================================================

export async function getTrack(
  accessToken: string,
  trackId: string
): Promise<SpotifyTrack> {
  return spotifyFetch<SpotifyTrack>(`/tracks/${trackId}`, accessToken);
}

export async function getTracks(
  accessToken: string,
  trackIds: string[]
): Promise<SpotifyTrack[]> {
  // Spotify allows max 50 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    chunks.push(trackIds.slice(i, i + 50));
  }

  const results: SpotifyTrack[] = [];
  for (const chunk of chunks) {
    const data = await spotifyFetch<{ tracks: SpotifyTrack[] }>(
      `/tracks?ids=${chunk.join(',')}`,
      accessToken
    );
    results.push(...data.tracks);
  }

  return results;
}

// ============================================================================
// Helpers
// ============================================================================

export function trackToUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

export function getAlbumImageUrl(
  track: SpotifyTrack,
  size: 'large' | 'medium' | 'small' = 'medium'
): string | undefined {
  const images = track.album.images;
  if (images.length === 0) return undefined;

  // Spotify typically returns images in order: large, medium, small
  if (size === 'large') return images[0]?.url;
  if (size === 'small') return images[images.length - 1]?.url;
  return images[Math.floor(images.length / 2)]?.url ?? images[0]?.url;
}

export function formatArtists(track: SpotifyTrack): string {
  return track.artists.map((a) => a.name).join(', ');
}

import { ConvexHttpClient } from 'convex/browser';
import type { NextApiRequest, NextApiResponse } from 'next';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { env } from '~/env';
import {
  getAlbum,
  getRecentlyPlayed,
  refreshAccessToken,
  type RecentlyPlayedItem,
  type SpotifyAlbum,
} from '~/lib/spotify';
import {
  detectAlbumListenSessions,
  groupPlaysByAlbum,
  type PlayEvent,
} from '~/lib/album-detection';

type SpotifyConnection = {
  _id: Id<'spotifyConnections'>;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  spotifyUserId: string;
  displayName?: string;
};

type SyncResult = {
  userId: string;
  success: boolean;
  tracksProcessed: number;
  albumsDiscovered: number;
  albumListensRecorded: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify this is a legitimate cron request
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🔄 Starting Spotify history sync...');

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const results: SyncResult[] = [];

  try {
    // Get all Spotify connections
    const connections = (await convex.query(
      api.spotify.getAllConnections,
      {}
    )) as SpotifyConnection[];
    console.log(`📊 Found ${connections.length} Spotify connections`);

    for (const connection of connections) {
      const result = await syncUserHistory(convex, connection);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const totalTracks = results.reduce((sum, r) => sum + r.tracksProcessed, 0);
    const totalAlbumsDiscovered = results.reduce(
      (sum, r) => sum + r.albumsDiscovered,
      0
    );
    const totalListens = results.reduce(
      (sum, r) => sum + r.albumListensRecorded,
      0
    );

    console.log('✅ Spotify history sync completed');
    console.log(`   - Users synced: ${successCount}/${connections.length}`);
    console.log(`   - Tracks processed: ${totalTracks}`);
    console.log(`   - Albums discovered: ${totalAlbumsDiscovered}`);
    console.log(`   - Album listens recorded: ${totalListens}`);

    res.status(200).json({
      success: true,
      results,
      summary: {
        usersProcessed: connections.length,
        usersSuccessful: successCount,
        totalTracks,
        totalAlbumsDiscovered,
        totalListens,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Spotify history sync failed:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      results,
      timestamp: new Date().toISOString(),
    });
  }
}

async function syncUserHistory(
  convex: ConvexHttpClient,
  connection: SpotifyConnection
): Promise<SyncResult> {
  const result: SyncResult = {
    userId: connection.userId,
    success: false,
    tracksProcessed: 0,
    albumsDiscovered: 0,
    albumListensRecorded: 0,
  };

  let syncLogId: Id<'spotifySyncLogs'> | null = null;

  try {
    // Refresh token if expired or expiring soon (within 5 minutes)
    let accessToken = connection.accessToken;
    if (connection.expiresAt < Date.now() + 5 * 60 * 1000) {
      console.log(`🔑 Refreshing token for user ${connection.userId}`);
      const tokenResult = await refreshAccessToken(connection.refreshToken);
      accessToken = tokenResult.access_token;

      await convex.mutation(api.spotify.updateTokens, {
        userId: connection.userId,
        accessToken: tokenResult.access_token,
        expiresIn: tokenResult.expires_in,
        refreshToken: tokenResult.refresh_token,
      });
    }

    // Fetch recently played
    console.log(`🎵 Fetching recently played for user ${connection.userId}`);
    const recentlyPlayed = await getRecentlyPlayed(accessToken, 50);

    // Store raw response in sync log
    syncLogId = await convex.mutation(api.spotify.createSyncLog, {
      userId: connection.userId,
      syncType: 'recently_played',
      rawResponse: JSON.stringify(recentlyPlayed),
    });

    // Process tracks
    const trackItems = recentlyPlayed.map((item) => ({
      trackId: item.track.id,
      trackName: item.track.name,
      artistName: item.track.artists.map((a) => a.name).join(', '),
      albumName: item.track.album.name,
      albumImageUrl: item.track.album.images?.[0]?.url,
      spotifyAlbumId: item.track.album.id,
      trackData: JSON.stringify(item.track),
      playedAt: Date.parse(item.played_at),
    }));

    await convex.mutation(api.spotify.upsertTracksFromRecentlyPlayed, {
      userId: connection.userId,
      items: trackItems,
    });

    result.tracksProcessed = trackItems.length;

    // Detect album listens
    const albumDetectionResult = await detectAlbumListens(
      convex,
      accessToken,
      connection.userId,
      recentlyPlayed
    );

    result.albumsDiscovered = albumDetectionResult.albumsDiscovered;
    result.albumListensRecorded = albumDetectionResult.listensRecorded;

    // Mark sync as processed
    if (syncLogId) {
      await convex.mutation(api.spotify.updateSyncLogStatus, {
        syncLogId,
        status: 'processed',
      });
    }

    result.success = true;
    console.log(
      `✅ Synced user ${connection.userId}: ${result.tracksProcessed} tracks, ${result.albumsDiscovered} albums discovered, ${result.albumListensRecorded} listens`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    result.error = errorMessage;
    console.error(`❌ Failed to sync user ${connection.userId}:`, errorMessage);

    // Mark sync as failed
    if (syncLogId) {
      await convex.mutation(api.spotify.updateSyncLogStatus, {
        syncLogId,
        status: 'failed',
        error: errorMessage,
      });
    }
  }

  return result;
}

async function detectAlbumListens(
  convex: ConvexHttpClient,
  accessToken: string,
  userId: string,
  recentlyPlayed: RecentlyPlayedItem[]
): Promise<{ albumsDiscovered: number; listensRecorded: number }> {
  // Convert to PlayEvent format for session detection
  const playEvents: PlayEvent[] = recentlyPlayed.map((item) => ({
    trackId: item.track.id,
    trackNumber: item.track.track_number,
    playedAt: Date.parse(item.played_at),
    albumId: item.track.album.id,
  }));

  // Group by album to get album metadata and ensure albums exist in DB
  const albumsById = groupPlaysByAlbum(playEvents);
  const albumMetadata = new Map<
    string,
    { name: string; totalTracks: number; dbId: Id<'spotifyAlbums'> }
  >();

  let albumsDiscovered = 0;
  let listensRecorded = 0;

  // First pass: ensure all albums exist in DB and get their totalTracks
  for (const [spotifyAlbumId] of albumsById) {
    // Get album name from recentlyPlayed data
    const albumName =
      recentlyPlayed.find((item) => item.track.album.id === spotifyAlbumId)?.track
        .album.name ?? 'Unknown Album';

    // Check if we already have this album in the DB
    const existingAlbum = (await convex.query(api.spotify.getAlbumBySpotifyId, {
      spotifyAlbumId,
    })) as { _id: Id<'spotifyAlbums'>; totalTracks: number } | null;

    if (existingAlbum) {
      albumMetadata.set(spotifyAlbumId, {
        name: albumName,
        totalTracks: existingAlbum.totalTracks,
        dbId: existingAlbum._id,
      });
    } else {
      // Fetch album details from Spotify
      let spotifyAlbum: SpotifyAlbum;
      try {
        spotifyAlbum = await getAlbum(accessToken, spotifyAlbumId);
      } catch (error) {
        console.warn(
          `Failed to fetch album ${spotifyAlbumId}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }

      // Create album in DB
      const albumDbId = await convex.mutation(api.spotify.upsertAlbum, {
        spotifyAlbumId,
        name: spotifyAlbum.name,
        artistName: spotifyAlbum.artists.map((a) => a.name).join(', '),
        imageUrl: spotifyAlbum.images?.[0]?.url,
        releaseDate: spotifyAlbum.release_date,
        totalTracks: spotifyAlbum.total_tracks,
        genres: spotifyAlbum.genres,
        rawData: JSON.stringify(spotifyAlbum),
      });

      // Backfill tracks from the album
      const albumTracksToAdd = spotifyAlbum.tracks.items.map((t) => ({
        trackId: t.id,
        trackName: t.name,
        artistName: t.artists.map((a) => a.name).join(', '),
      }));

      await convex.mutation(api.spotify.backfillTracksFromAlbum, {
        userId,
        spotifyAlbumId,
        albumName: spotifyAlbum.name,
        albumImageUrl: spotifyAlbum.images?.[0]?.url,
        tracks: albumTracksToAdd,
      });

      albumsDiscovered++;

      albumMetadata.set(spotifyAlbumId, {
        name: spotifyAlbum.name,
        totalTracks: spotifyAlbum.total_tracks,
        dbId: albumDbId,
      });
    }
  }

  // Second pass: detect listen sessions for each album
  for (const [spotifyAlbumId, plays] of albumsById) {
    const metadata = albumMetadata.get(spotifyAlbumId);
    if (!metadata) continue; // Album fetch failed, skip

    // Detect valid listen sessions using the new algorithm
    const sessions = detectAlbumListenSessions(plays, metadata.totalTracks);

    // Record each valid session
    for (const session of sessions) {
      const result = await convex.mutation(api.spotify.recordAlbumListen, {
        userId,
        albumId: metadata.dbId,
        trackIds: session.trackIds,
        earliestPlayedAt: session.earliestPlayedAt,
        latestPlayedAt: session.latestPlayedAt,
        source: 'cron_sync',
      });

      // Only count as recorded if not deduplicated
      if (result.recorded) {
        listensRecorded++;
      }
    }
  }

  return { albumsDiscovered, listensRecorded };
}

